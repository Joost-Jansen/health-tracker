"""Koppelingen (T19): each user connects their own Garmin account on the site.

The user types Garmin e-mail and password (and the MFA code when Garmin asks for one). The server logs in once and keeps
only the encrypted session (`settings.garmin_tokens`, tools/secretbox.py); the password is never stored. Garmin has no
public API for individuals, so this uses the same unofficial login as tools/setup_garmin.py.
"""

from __future__ import annotations

import threading
import time
from datetime import date
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from tools import db
from tools.secretbox import WrongKey, decrypt, encrypt

MFA_TTL_S = 10 * 60
FIRST_SYNC_DAYS = 365


class GarminLoginError(Exception):
    pass


class GarminAuth:
    """Real Garmin login. `start` returns ("ok", tokens) or ("mfa", handle); `finish(handle, code)` returns tokens."""

    def start(self, email: str, password: str):
        from garminconnect import Garmin

        api = Garmin(email, password, return_on_mfa=True)
        try:
            status, state = api.login()
        except Exception as err:
            raise GarminLoginError(_explain(err)) from err
        if status == "needs_mfa":
            return "mfa", (api, state)
        return "ok", api.client.dumps()

    def finish(self, handle, code: str) -> str:
        api, state = handle
        try:
            api.resume_login(state, code)
        except Exception as err:
            raise GarminLoginError(_explain(err)) from err
        return api.client.dumps()


def _explain(err: Exception) -> str:
    text = f"{type(err).__name__}: {err}".lower()
    if "401" in text or "authentication" in text or "credentials" in text or "password" in text:
        return "Garmin weigert de inlog: controleer e-mail en wachtwoord (of de MFA-code)."
    if "429" in text or "too many" in text:
        return "Garmin laat even geen nieuwe inlog toe (te veel pogingen). Probeer het over een kwartier opnieuw."
    return "Inloggen bij Garmin lukte niet. Probeer het later opnieuw."


class GarminCredentials(BaseModel):
    email: str
    password: str


class MfaCode(BaseModel):
    code: str


def status(scope: db.Scope, key: str, running: bool) -> dict:
    stored = db.get_setting(scope, "garmin_tokens")
    key_ok = None
    if stored and key:
        try:
            decrypt(stored, key)
            key_ok = True
        except WrongKey:
            key_ok = False
    state = db.get_setting(scope, "sync_state") or {}
    return {
        "garmin": {
            "connected": bool(stored),
            "readable": key_ok,  # False: saved by a service with another key; reconnect
            "connected_at": (db.get_setting(scope, "garmin_meta") or {}).get("connected_at"),
            "last_sync": state.get("last_sync_local"),
            "last_failed": state.get("last_failed") or [],
            "syncing": running,
        }
    }


def make_router(current_user: Callable, runner, key: str, auth: GarminAuth | None = None, today: Callable[[], date] = date.today) -> APIRouter:
    r = APIRouter(prefix="/api/connections")
    auth = auth or GarminAuth()
    pending: dict[int, tuple[float, object]] = {}  # user id -> (time, MFA handle)
    guard = threading.Lock()

    def person(u=Depends(current_user)):
        if u.via != "cookie":
            raise HTTPException(status_code=403, detail="koppelingen beheer je ingelogd op de site")
        return u

    def save(u, tokens: str) -> None:
        if not key:
            raise HTTPException(status_code=500, detail="de server heeft geen sleutel om de koppeling veilig op te slaan (TOKEN_ENCRYPTION_KEY)")
        db.set_setting(u.scope, "garmin_tokens", encrypt(tokens, key))
        db.set_setting(u.scope, "garmin_meta", {"connected_at": time.strftime("%Y-%m-%d %H:%M")})
        first = not (db.get_setting(u.scope, "sync_state") or {}).get("garmin")
        runner.start_user(u.id, since=date.fromordinal(today().toordinal() - FIRST_SYNC_DAYS) if first else None)

    @r.get("")
    def get_status(u=Depends(current_user)):
        return status(u.scope, key, u.id in runner.running)

    @r.post("/garmin")
    def connect(body: GarminCredentials, u=Depends(person)):
        if not body.email.strip() or not body.password:
            raise HTTPException(status_code=422, detail="vul e-mail en wachtwoord in")
        try:
            kind, value = auth.start(body.email.strip(), body.password)
        except GarminLoginError as err:
            raise HTTPException(status_code=400, detail=str(err))
        if kind == "mfa":
            with guard:
                pending[u.id] = (time.monotonic(), value)
            return {"status": "mfa"}
        save(u, value)
        return {"status": "connected"}

    @r.post("/garmin/mfa")
    def mfa(body: MfaCode, u=Depends(person)):
        with guard:
            item = pending.pop(u.id, None)
        if not item or time.monotonic() - item[0] > MFA_TTL_S:
            raise HTTPException(status_code=410, detail="de MFA-stap is verlopen; log opnieuw in bij Garmin")
        try:
            tokens = auth.finish(item[1], body.code.strip())
        except GarminLoginError as err:
            raise HTTPException(status_code=400, detail=str(err))
        save(u, tokens)
        return {"status": "connected"}

    @r.delete("/garmin")
    def disconnect(u=Depends(person)):
        db.delete_setting(u.scope, "garmin_tokens")
        db.delete_setting(u.scope, "garmin_meta")
        return {"ok": True}

    @r.post("/sync")
    def sync_now(u=Depends(current_user)):
        if not db.get_setting(u.scope, "garmin_tokens"):
            raise HTTPException(status_code=409, detail="koppel eerst Garmin")
        started = runner.start_user(u.id)
        return {"started": started, **status(u.scope, key, True)}

    return r
