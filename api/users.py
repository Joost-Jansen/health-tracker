"""Accounts (T19): who is calling, login/registration, the personal account and the admin panel.

`current_user` (built by `make_auth`) is the one auth dependency of every route. It returns a `User` with that user's own
`DataStore`, so a route can only reach the caller's data. Browser: session cookie with the user id. Agents: Bearer token
from `agent_tokens` (or the legacy env hash, which belongs to the first admin).
"""

from __future__ import annotations

import hashlib
import re
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable

import bcrypt
from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel

from api import auth, example
from api.data import DataStore
from api.errors import ApiError
from tools import db

REGISTRATION_MODES = ("closed", "invite", "open")
USERNAME = re.compile(r"^[a-z0-9][a-z0-9._-]{2,39}$")
MIN_PASSWORD = 10
LOCALES = ("nl", "en")  # site language per user (setting `locale`); unset = the browser's language


@dataclass
class User:
    id: int
    username: str
    display_name: str | None
    is_admin: bool
    via: str  # cookie | agent
    store: DataStore = field(repr=False)
    example: bool = False  # the store is the read-only example account (api/example.py), not this user's data

    @property
    def scope(self) -> db.Scope:
        return self.store.scope

    @property
    def author(self) -> str:
        """Who wrote something: shown next to log entries, plans and documents."""
        return "agent" if self.via == "agent" else self.username

    def public(self) -> dict:
        return {"id": self.id, "username": self.username, "display_name": self.display_name, "is_admin": self.is_admin, "via": self.via}


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
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()


def check_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise ApiError(422, "password_too_short", min=MIN_PASSWORD)


def check_locale(locale: str | None) -> None:
    if locale is not None and locale not in LOCALES:
        raise ApiError(422, "invalid_locale", options=list(LOCALES))


def bootstrap(engine, username: str, password_hash: str) -> int | None:
    """First start of a multi-user database: the env login (TRAINING_USER, TRAINING_PASSWORD_HASH) becomes user 1, admin.
    Data migrated from the single-user database already belongs to user 1. Without env login and without users, the
    first person to register becomes admin (see `register`)."""
    if db.count_users(engine) or not (username and password_hash):
        return None
    return db.create_user(engine, username, password_hash, is_admin=True, user_id=1)


def make_auth(engine, stores: Stores, jwt_secret: str, legacy_agent_hash: str = "", examples: "example.ExampleData | None" = None) -> tuple[Callable, Callable]:
    """Returns (current_user dependency, token_user(token) -> User | None). With `examples`, a site login that asks for
    example data on a data route gets the example account's read-only store instead of its own (api/example.py)."""

    def load(user_id: int | None, via: str) -> User | None:
        u = db.get_user(engine, user_id) if user_id else None
        if not u or u["suspended"]:
            return None
        return User(u["id"], u["username"], u.get("display_name"), bool(u["is_admin"]), via, stores.get(u["id"]))

    def token_user(token: str | None) -> User | None:
        if not token:
            return None
        digest = hashlib.sha256(token.encode()).hexdigest()
        uid = db.user_for_token_hash(engine, digest)
        if uid is None and legacy_agent_hash and auth.same(digest, legacy_agent_hash):
            uid = next((u["id"] for u in db.list_users(engine) if u["is_admin"]), None)
        return load(uid, "agent")

    def current_user(request: Request) -> User:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            u = token_user(header[7:].strip())
            if not u:
                raise ApiError(401, "invalid_agent_token")
            return u
        sub = auth.token_user(request.cookies.get(auth.COOKIE), jwt_secret)
        uid = None
        if sub and sub.startswith("u:") and sub[2:].isdigit():
            uid = int(sub[2:])
        elif sub:  # cookie from before multi-user: carried the username
            found = db.get_user_by_name(engine, sub)
            uid = found["id"] if found else None
        u = load(uid, "cookie")
        if not u:
            raise ApiError(401, "not_logged_in")
        if examples is not None and example.serves(request):
            # only the data comes from the example account; never another real user's, and never writable
            return User(example.EXAMPLE_USER_ID, u.username, u.display_name, False, "cookie", examples.store(), example=True)
        return u

    return current_user, token_user


# --- routes ------------------------------------------------------------------------------------------------------


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: str
    password: str
    display_name: str | None = None
    invite: str | None = None
    locale: str | None = None


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


def make_router(engine, stores: Stores, current_user: Callable, jwt_secret: str, cookie_secure: bool, token_days: int) -> APIRouter:
    r = APIRouter()
    throttles: dict[str, auth.Throttle] = {}

    def set_session(response: Response, user_id: int) -> None:
        token = auth.create_token(f"u:{user_id}", jwt_secret, token_days)
        response.set_cookie(auth.COOKIE, token, max_age=token_days * 86400, httponly=True, secure=cookie_secure, samesite="lax", path="/")

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
        """Public: what the login page should offer."""
        return {"registration": registration_mode(), "first_user": db.count_users(engine) == 0}

    @r.post("/api/login")
    def login(creds: Credentials, response: Response):
        name = creds.username.strip().lower()[:40]
        if len(throttles) > 10_000:  # many different names: keep memory bounded
            throttles.clear()
        throttle = throttles.setdefault(name, auth.Throttle())
        if throttle.locked():
            raise ApiError(429, "too_many_attempts")
        u = db.get_user_by_name(engine, name, with_hash=True)
        ok = auth.verify_password(creds.password, u["password_hash"] if u else "")
        if not u or not ok:
            throttle.fail()
            raise ApiError(401, "bad_credentials")
        if u["suspended"]:
            raise ApiError(403, "account_suspended")
        throttle.succeed()
        db.update_user(engine, u["id"], last_login_at=datetime.now(timezone.utc))
        set_session(response, u["id"])
        return {"username": u["username"]}

    @r.post("/api/logout")
    def logout(response: Response):
        response.delete_cookie(auth.COOKIE, path="/")
        return {"ok": True}

    @r.post("/api/register")
    def register(body: Registration, response: Response):
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
        check_new_password(body.password)
        check_locale(body.locale)
        uid = db.create_user(engine, name, hash_password(body.password), is_admin=first, display_name=(body.display_name or "").strip() or None)
        if body.locale:
            db.set_setting(db.Scope(engine, uid), "locale", body.locale)
        if mode == "invite":
            db.use_invite(engine, body.invite.strip(), uid)
        set_session(response, uid)
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
    def change_password(body: PasswordChange, u: User = Depends(person)):
        row = db.get_user(engine, u.id, with_hash=True)
        if not auth.verify_password(body.current, row["password_hash"]):
            raise ApiError(403, "wrong_current_password")
        check_new_password(body.new)
        db.update_user(engine, u.id, password_hash=hash_password(body.new))
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
        temporary = secrets.token_urlsafe(9)
        db.update_user(engine, user_id, password_hash=hash_password(temporary))
        db.add_audit(engine, a.username, "reset_password", db.get_user(engine, user_id)["username"])
        return {"password": temporary}

    @r.delete("/api/admin/users/{user_id}")
    def admin_delete(user_id: int, confirm: str, a: User = Depends(admin)):
        target = db.get_user(engine, user_id)
        if not target:
            raise ApiError(404, "user_not_found")
        if user_id == a.id:
            raise ApiError(422, "cannot_delete_self")
        if confirm != target["username"]:
            raise ApiError(422, "confirm_username")
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
