"""Accounts (T19): who is calling, login/registration, the personal account and the admin panel.

`current_user` (built by `make_auth`) is the one auth dependency of every route. It returns a `User` with that user's own
`DataStore`, so a route can only reach the caller's data. Browser: session cookie with the user id. Agents: Bearer token
from `agent_tokens` (or the legacy env hash, which belongs to the first admin).
"""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable

import bcrypt
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from api import auth, example
from api.data import DataStore
from api.errors import ApiError
from api.websec.client_ip import client_ip, trusted_networks
from api.websec.passwords import MAX_LENGTH as MAX_PASSWORD, check_password
from api.websec import totp
from api.websec.throttle import Limiter
from tools import db, secretbox

REGISTRATION_MODES = ("closed", "invite", "open")
USERNAME = re.compile(r"^[a-z0-9][a-z0-9._-]{2,39}$")
MIN_PASSWORD = 10
LOCALES = ("nl", "en")  # site language per user (setting `locale`); unset = the browser's language
# The privacy statement (web/lib/i18n privacy) a new account consents to; change it with the statement's substance.
PRIVACY_VERSION = "2026-10-07"
RENEW_AFTER_S = 24 * 3600  # a session in use gets a fresh cookie once a day: SESSION_DAYS counts from the last use


@dataclass
class Guards:
    """Rate limits and the client address (shared with stock-tracker: the same numbers in both apps).

    In memory: a restart forgets them; the durable layer is a rate-limit rule at the edge (Cloudflare)."""

    trusted: list = field(default_factory=list)  # TRUSTED_PROXIES
    login_user: Limiter = field(default_factory=lambda: Limiter(10, 15 * 60))
    login_ip: Limiter = field(default_factory=lambda: Limiter(30, 15 * 60))
    register_ip: Limiter = field(default_factory=lambda: Limiter(5, 60 * 60))
    token_ip: Limiter = field(default_factory=lambda: Limiter(20, 15 * 60))  # failed agent/MCP tokens

    @classmethod
    def from_env(cls, trusted_proxies: str) -> "Guards":
        return cls(trusted=trusted_networks(trusted_proxies))

    def ip(self, request: Request) -> str:
        return client_ip(request, self.trusted)

    def too_many(self, limiter: Limiter, key: str) -> ApiError:
        return ApiError(429, "too_many_attempts", headers={"Retry-After": str(limiter.remaining_s(key) or 60)})


@dataclass
class User:
    id: int
    username: str
    display_name: str | None
    is_admin: bool
    via: str  # cookie | agent
    store: DataStore = field(repr=False)
    example: bool = False  # the store is the read-only example account (api/example.py), not this user's data
    totp_enabled: bool = False

    @property
    def scope(self) -> db.Scope:
        return self.store.scope

    @property
    def author(self) -> str:
        """Who wrote something: shown next to log entries, plans and documents."""
        return "agent" if self.via == "agent" else self.username

    def public(self) -> dict:
        return {"id": self.id, "username": self.username, "display_name": self.display_name, "is_admin": self.is_admin, "via": self.via,
                "totp_enabled": self.totp_enabled}


class Stores:
    """One DataStore (with its short cache) per user."""

    def __init__(self, engine):
        self.engine = engine
        self._stores: dict[int, DataStore] = {}

    def get(self, user_id: int) -> DataStore:
        if user_id not in self._stores:
            self._stores[user_id] = DataStore(db.Scope(self.engine, user_id))
        return self._stores[user_id]

    def drop(self, user_id: int) -> None:
        self._stores.pop(user_id, None)


def hash_password(password: str) -> str:
    # bcrypt reads 72 bytes; bcrypt 5 raises on more instead of cutting silently (auth.verify_password cuts the same way)
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds=12)).decode()


def check_new_password(password: str, username: str | None = None) -> None:
    """Long enough, not a password attackers try first, not the username (api/websec/passwords.py)."""
    code = check_password(password, username)
    if code == "password_too_short":
        raise ApiError(422, code, min=MIN_PASSWORD)
    if code == "password_too_long":
        raise ApiError(422, code, max=MAX_PASSWORD)
    if code:
        raise ApiError(422, code)


def check_locale(locale: str | None) -> None:
    if locale is not None and locale not in LOCALES:
        raise ApiError(422, "invalid_locale", options=list(LOCALES))


def privacy_info() -> dict:
    """Who runs this installation (the controller under the GDPR): PRIVACY_CONTROLLER, PRIVACY_CONTACT."""
    return {"controller": os.environ.get("PRIVACY_CONTROLLER", "").strip() or None, "contact": os.environ.get("PRIVACY_CONTACT", "").strip() or None,
            "version": PRIVACY_VERSION}


def bootstrap(engine, username: str, password_hash: str) -> int | None:
    """First start of a multi-user database: the env login (TRAINING_USER, TRAINING_PASSWORD_HASH) becomes user 1, admin.
    Data migrated from the single-user database already belongs to user 1. Without env login and without users, the
    first person to register becomes admin (see `register`)."""
    if db.count_users(engine) or not (username and password_hash):
        return None
    return db.create_user(engine, username, password_hash, is_admin=True, user_id=1)


def set_session_cookie(response: Response, user_id: int, session_version: int, jwt_secret: str, days: int, secure: bool) -> None:
    token = auth.create_token(f"u:{user_id}", jwt_secret, days, session_version)
    response.set_cookie(auth.COOKIE, token, max_age=days * 86400, httponly=True, secure=secure, samesite="lax", path="/")


def make_auth(engine, stores: Stores, jwt_secret: str, legacy_agent_hash: str = "", examples: "example.ExampleData | None" = None,
              session_days: int = 14, cookie_secure: bool = True, guards: Guards | None = None) -> tuple[Callable, Callable]:
    """Returns (current_user dependency, token_user(token) -> User | None). With `examples`, a site login that asks for
    example data on a data route gets the example account's read-only store instead of its own (api/example.py).
    A session cookie is valid `session_days` after its last renewal and only while its session version is the user's."""
    guards = guards or Guards()

    def load(user_id: int | None, via: str, session_version: int | None = None) -> User | None:
        u = db.get_user(engine, user_id) if user_id else None
        if not u or u["suspended"]:
            return None
        if session_version is not None and session_version != u["session_version"]:
            return None  # the password changed (or two-step login) after this session began
        return User(u["id"], u["username"], u.get("display_name"), bool(u["is_admin"]), via, stores.get(u["id"]), totp_enabled=u["totp_enabled"])

    def token_user(token: str | None) -> User | None:
        if not token:
            return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        uid = db.user_for_token_hash(engine, digest)
        if uid is None and legacy_agent_hash and auth.same(digest, legacy_agent_hash):
            uid = next((u["id"] for u in db.list_users(engine) if u["is_admin"]), None)
        return load(uid, "agent")

    def current_user(request: Request, response: Response) -> User:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            ip = guards.ip(request)
            if guards.token_ip.blocked(ip):
                raise guards.too_many(guards.token_ip, ip)
            u = token_user(header[7:].strip())
            if not u:
                guards.token_ip.hit(ip)  # someone guessing tokens
                raise ApiError(401, "invalid_agent_token")
            return u
        claims = auth.token_claims(request.cookies.get(auth.COOKIE), jwt_secret) or {}
        sub, uid = claims.get("sub"), None
        if isinstance(sub, str) and sub.startswith("u:") and sub[2:].isdigit():
            uid = int(sub[2:])
        elif isinstance(sub, str) and sub:  # cookie from before multi-user: carried the username
            found = db.get_user_by_name(engine, sub)
            uid = found["id"] if found else None
        u = load(uid, "cookie", int(claims.get("sv") or 0))
        if not u:
            raise ApiError(401, "not_logged_in")
        if time.time() - int(claims.get("iat") or 0) > RENEW_AFTER_S:  # sliding session: renewed while in use
            set_session_cookie(response, u.id, int(claims.get("sv") or 0), jwt_secret, session_days, cookie_secure)
        if examples is not None and example.serves(request):
            # only the data comes from the example account; never another real user's, and never writable
            return User(example.EXAMPLE_USER_ID, u.username, u.display_name, False, "cookie", examples.store(), example=True)
        return u

    return current_user, token_user


# --- routes ------------------------------------------------------------------------------------------------------


class Credentials(BaseModel):
    username: str
    password: str
    totp: str | None = None  # the authenticator code (or a backup code) when two-step login is on


class Registration(BaseModel):
    username: str
    password: str
    display_name: str | None = None
    invite: str | None = None
    locale: str | None = None
    consent: bool = False  # explicit consent to processing health data (GDPR art. 9(2)(a)), a box on the form


class TotpCode(BaseModel):
    code: str


class TotpDisable(BaseModel):
    password: str
    code: str


class PasswordChange(BaseModel):
    current: str
    new: str


class AccountPatch(BaseModel):
    display_name: str | None = None
    locale: str | None = None


class AdminUserPatch(BaseModel):
    is_admin: bool | None = None
    suspended: bool | None = None


class AppSettingsPatch(BaseModel):
    registration: str | None = None


class InviteIn(BaseModel):
    days: int | None = 14


TOTP_ISSUER = "health-tracker"


def second_factor_ok(engine, row: dict, code: str | None, key: str) -> bool:
    """The authenticator code (each only once) or an unused backup code of a user with two-step login on."""
    if not code or not row.get("totp_secret"):
        return False
    try:
        secret = secretbox.decrypt(row["totp_secret"], key)
    except secretbox.WrongKey:
        return False  # encrypted with another key: only a backup code (or the admin) helps
    step = totp.verify(secret, code, row.get("totp_last_step"))
    if step is not None:
        db.update_user(engine, row["id"], totp_last_step=step)
        return True
    left = totp.use_backup_code(code, row.get("totp_backup") or [])
    if left is None:
        return False
    db.update_user(engine, row["id"], totp_backup=left)
    return True


def make_router(engine, stores: Stores, current_user: Callable, jwt_secret: str, cookie_secure: bool, session_days: int,
                guards: Guards | None = None, key: str = "") -> APIRouter:
    r = APIRouter()
    guards = guards or Guards()

    def set_session(response: Response, user_id: int, session_version: int | None = None) -> None:
        version = db.session_version(engine, user_id) if session_version is None else session_version
        set_session_cookie(response, user_id, version or 0, jwt_secret, session_days, cookie_secure)

    def registration_mode() -> str:
        return "open" if db.count_users(engine) == 0 else db.get_app_setting(engine, "registration", "closed")

    def admin(u: User = Depends(current_user)) -> User:
        if u.via != "cookie" or not u.is_admin:
            raise ApiError(403, "admins_only")
        return u

    def person(u: User = Depends(current_user)) -> User:
        if u.via != "cookie":
            raise ApiError(403, "site_login_only")
        return u

    @r.get("/api/auth/config")
    def auth_config():
        """Public: what the login and registration pages should offer, and who runs this installation (privacy page)."""
        return {"registration": registration_mode(), "first_user": db.count_users(engine) == 0, "privacy": privacy_info()}

    @r.post("/api/login")
    def login(creds: Credentials, request: Request, response: Response):
        name, ip = creds.username.strip().lower()[:40], guards.ip(request)
        for limiter, who in ((guards.login_user, name), (guards.login_ip, ip)):
            if limiter.blocked(who):
                raise guards.too_many(limiter, who)

        def failed(code: str) -> ApiError:
            guards.login_user.hit(name)
            guards.login_ip.hit(ip)
            return ApiError(401, code)

        u = db.get_user_by_name(engine, name, with_hash=True)
        ok = auth.verify_password(creds.password[:MAX_PASSWORD], u["password_hash"] if u else None)
        if not u or not ok:
            raise failed("bad_credentials")
        if u["suspended"]:
            raise ApiError(403, "account_suspended")
        if u.get("totp_enabled_at"):
            if not (creds.totp or "").strip():
                raise ApiError(401, "totp_required")  # the password was right: the page asks for the code
            if not second_factor_ok(engine, u, creds.totp, key):
                raise failed("totp_invalid")
        guards.login_user.reset(name)
        db.update_user(engine, u["id"], last_login_at=datetime.now(timezone.utc))
        set_session(response, u["id"], u.get("session_version") or 0)
        return {"username": u["username"]}

    @r.post("/api/logout")
    def logout(response: Response):
        response.delete_cookie(auth.COOKIE, path="/")
        return {"ok": True}

    @r.post("/api/register")
    def register(body: Registration, request: Request, response: Response):
        ip = guards.ip(request)
        if not guards.register_ip.hit(ip):  # every attempt counts: also guessing invite codes
            raise guards.too_many(guards.register_ip, ip)
        mode = registration_mode()
        first = db.count_users(engine) == 0
        if mode == "closed":
            raise ApiError(403, "registration_closed")
        if mode == "invite" and not (body.invite and db.invite_usable(engine, body.invite.strip())):
            raise ApiError(403, "invalid_invite")
        name = body.username.strip().lower()
        if not USERNAME.match(name):
            raise ApiError(422, "invalid_username")
        if name in example.RESERVED_USERNAMES:
            raise ApiError(409, "username_reserved")
        if db.get_user_by_name(engine, name):
            raise ApiError(409, "username_taken")
        check_new_password(body.password, name)
        check_locale(body.locale)
        if not body.consent:
            raise ApiError(422, "consent_required")
        uid = db.create_user(engine, name, hash_password(body.password), is_admin=first, display_name=(body.display_name or "").strip() or None,
                             consent_at=datetime.now(timezone.utc), privacy_version=PRIVACY_VERSION)
        if body.locale:
            db.set_setting(db.Scope(engine, uid), "locale", body.locale)
        if mode == "invite":
            db.use_invite(engine, body.invite.strip(), uid)
        set_session(response, uid, 0)
        return {"username": name, "is_admin": first}

    @r.get("/api/me")
    def me(u: User = Depends(current_user)):
        return {**u.public(), "locale": db.get_setting(u.scope, "locale")}

    @r.patch("/api/account")
    def update_account(body: AccountPatch, u: User = Depends(person)):
        check_locale(body.locale)
        if body.display_name is not None:
            name = body.display_name.strip()
            if len(name) > 80:
                raise ApiError(422, "name_too_long", max=80)
            db.update_user(engine, u.id, display_name=name or None)
        if body.locale is not None:
            db.set_setting(u.scope, "locale", body.locale)
        return {**db.get_user(engine, u.id), "locale": db.get_setting(u.scope, "locale")}

    @r.post("/api/account/password")
    def change_password(body: PasswordChange, response: Response, u: User = Depends(person)):
        """Every other session ends (a stolen cookie with it); this browser gets a new one."""
        row = db.get_user(engine, u.id, with_hash=True)
        if not auth.verify_password(body.current[:MAX_PASSWORD], row["password_hash"]):
            raise ApiError(403, "wrong_current_password")
        check_new_password(body.new, u.username)
        db.update_user(engine, u.id, password_hash=hash_password(body.new))
        set_session(response, u.id, db.bump_session_version(engine, u.id))
        return {"ok": True}

    # --- two-step login (TOTP) -----------------------------------------------------------------------------------

    @r.post("/api/account/totp/setup")
    def totp_setup(u: User = Depends(person)):
        """A new secret for the authenticator app; two-step login is on once /enable confirms a code from it."""
        row = db.get_user(engine, u.id, with_hash=True)
        if row.get("totp_enabled_at"):
            raise ApiError(409, "totp_already_enabled")
        if not key:
            raise ApiError(500, "no_encryption_key")
        secret = totp.new_secret()
        db.update_user(engine, u.id, totp_secret=secretbox.encrypt(secret, key), totp_last_step=None, totp_backup=None)
        return {"secret": secret, "otpauth_uri": totp.otpauth_uri(secret, u.username, TOTP_ISSUER)}

    @r.post("/api/account/totp/enable")
    def totp_enable(body: TotpCode, response: Response, u: User = Depends(person)):
        """Confirm with a code from the app; returns the backup codes (shown once). Other sessions end."""
        row = db.get_user(engine, u.id, with_hash=True)
        if row.get("totp_enabled_at"):
            raise ApiError(409, "totp_already_enabled")
        if not row.get("totp_secret"):
            raise ApiError(409, "totp_not_set_up")
        step = totp.verify(secretbox.decrypt(row["totp_secret"], key), body.code)
        if step is None:
            raise ApiError(422, "totp_invalid")
        codes, hashes = totp.new_backup_codes()
        db.update_user(engine, u.id, totp_enabled_at=datetime.now(timezone.utc), totp_last_step=step, totp_backup=hashes)
        set_session(response, u.id, db.bump_session_version(engine, u.id))
        return {"backup_codes": codes}

    @r.post("/api/account/totp/disable")
    def totp_disable(body: TotpDisable, request: Request, response: Response, u: User = Depends(person)):
        ip = guards.ip(request)
        if guards.login_ip.blocked(ip) or guards.login_user.blocked(u.username):
            raise guards.too_many(guards.login_ip, ip)
        row = db.get_user(engine, u.id, with_hash=True)
        if not row.get("totp_enabled_at"):
            raise ApiError(409, "totp_not_set_up")
        if not auth.verify_password(body.password[:MAX_PASSWORD], row["password_hash"]):
            guards.login_user.hit(u.username)
            guards.login_ip.hit(ip)
            raise ApiError(403, "wrong_current_password")
        if not second_factor_ok(engine, row, body.code, key):
            guards.login_user.hit(u.username)
            guards.login_ip.hit(ip)
            raise ApiError(422, "totp_invalid")
        db.update_user(engine, u.id, totp_secret=None, totp_enabled_at=None, totp_last_step=None, totp_backup=None)
        set_session(response, u.id, db.bump_session_version(engine, u.id))
        return {"ok": True}

    # --- admin ---------------------------------------------------------------------------------------------------

    @r.get("/api/admin/users")
    def admin_users(a: User = Depends(admin)):
        return db.list_users(engine)

    @r.patch("/api/admin/users/{user_id}")
    def admin_update(user_id: int, body: AdminUserPatch, a: User = Depends(admin)):
        if not db.get_user(engine, user_id):
            raise ApiError(404, "user_not_found")
        if user_id == a.id and (body.is_admin is False or body.suspended):
            raise ApiError(422, "cannot_demote_self")
        changes = body.model_dump(exclude_none=True)
        db.update_user(engine, user_id, **changes)
        target = db.get_user(engine, user_id)
        for key, value in changes.items():
            action = {"is_admin": "make_admin" if value else "remove_admin", "suspended": "block" if value else "unblock"}.get(key)
            if action:
                db.add_audit(engine, a.username, action, target["username"])
        return target

    @r.post("/api/admin/users/{user_id}/reset-password")
    def admin_reset(user_id: int, a: User = Depends(admin)):
        if not db.get_user(engine, user_id):
            raise ApiError(404, "user_not_found")
        temporary = secrets.token_urlsafe(12)
        db.update_user(engine, user_id, password_hash=hash_password(temporary))
        db.bump_session_version(engine, user_id)  # whoever was logged in with the old password is out
        db.add_audit(engine, a.username, "reset_password", db.get_user(engine, user_id)["username"])
        return {"password": temporary}

    @r.delete("/api/admin/users/{user_id}/totp")
    def admin_reset_totp(user_id: int, a: User = Depends(admin)):
        """For a user who lost both the phone and the backup codes. Their sessions end."""
        target = db.get_user(engine, user_id)
        if not target:
            raise ApiError(404, "user_not_found")
        db.update_user(engine, user_id, totp_secret=None, totp_enabled_at=None, totp_last_step=None, totp_backup=None)
        db.bump_session_version(engine, user_id)
        db.add_audit(engine, a.username, "reset_totp", target["username"])
        return db.get_user(engine, user_id)

    @r.delete("/api/admin/users/{user_id}")
    def admin_delete(user_id: int, confirm: str, a: User = Depends(admin)):
        target = db.get_user(engine, user_id)
        if not target:
            raise ApiError(404, "user_not_found")
        if user_id == a.id:
            raise ApiError(422, "cannot_delete_self")
        if confirm != target["username"]:
            raise ApiError(422, "confirm_username")
        from api.connections import revoke_wahoo  # here: connections is the bigger module, imported late on purpose

        revoke_wahoo(db.Scope(engine, user_id), key)
        db.delete_user(engine, user_id)
        stores.drop(user_id)
        db.add_audit(engine, a.username, "delete_user", target["username"])
        return {"ok": True}

    @r.get("/api/admin/overview")
    def admin_overview(a: User = Depends(admin)):
        people = db.list_users(engine)
        return {
            "accounts": len(people),
            "admins": sum(1 for u in people if u["is_admin"]),
            "suspended": sum(1 for u in people if u["suspended"]),
            "files_bytes": sum(u["files_bytes"] for u in people),
            "open_feedback": db.count_open_feedback(engine),
            "audit": db.list_audit(engine),
        }

    @r.get("/api/admin/settings")
    def admin_settings(a: User = Depends(admin)):
        return {"registration": db.get_app_setting(engine, "registration", "closed"), "invites": db.list_invites(engine)}

    @r.patch("/api/admin/settings")
    def admin_settings_update(body: AppSettingsPatch, a: User = Depends(admin)):
        if body.registration is not None:
            if body.registration not in REGISTRATION_MODES:
                raise ApiError(422, "invalid_registration_mode", options=list(REGISTRATION_MODES))
            db.set_app_setting(engine, "registration", body.registration)
            db.add_audit(engine, a.username, "registration", detail=body.registration)
        return admin_settings(a)

    @r.post("/api/admin/invites")
    def admin_invite(body: InviteIn, a: User = Depends(admin)):
        code = secrets.token_urlsafe(8)
        expires = datetime.now(timezone.utc) + timedelta(days=body.days) if body.days else None
        db.create_invite(engine, code, a.id, expires)
        db.add_audit(engine, a.username, "invite", detail=f"{body.days} d" if body.days else None)
        return {"code": code, "expires_at": expires.isoformat() if expires else None}

    @r.delete("/api/admin/invites/{code}")
    def admin_invite_delete(code: str, a: User = Depends(admin)):
        db.delete_invite(engine, code)
        db.add_audit(engine, a.username, "revoke_invite")
        return {"ok": True}

    return r
