"""Agent tokens made on the website (Instellingen), so no Railway CLI is needed. Only SHA-256 hashes are stored,
in the setting `agent_tokens`; the token is shown once. The env TRAINING_AGENT_TOKEN_HASH keeps working next to it.
Creating and revoking needs Joost's login cookie; an agent cannot mint tokens.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from tools import db

KEY = "agent_tokens"
MAX_TOKENS = 20


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def list_tokens(engine) -> list[dict]:
    return [{k: v for k, v in t.items() if k != "hash"} for t in db.get_setting(engine, KEY) or []]


def create_token(engine, name: str) -> tuple[str, dict]:
    items = db.get_setting(engine, KEY) or []
    if len(items) >= MAX_TOKENS:
        raise ValueError(f"maximaal {MAX_TOKENS} tokens; trek er eerst een in")
    token = "tr_" + secrets.token_urlsafe(32)
    entry = {"id": secrets.token_hex(4), "name": name, "hash": _hash(token), "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    db.set_setting(engine, KEY, items + [entry])
    return token, {k: v for k, v in entry.items() if k != "hash"}


def revoke_token(engine, token_id: str) -> bool:
    items = db.get_setting(engine, KEY) or []
    keep = [t for t in items if t["id"] != token_id]
    db.set_setting(engine, KEY, keep)
    return len(keep) < len(items)


def token_matches(engine, token: str | None) -> bool:
    if not token:
        return False
    digest = _hash(token)
    return any(hmac.compare_digest(digest, t["hash"]) for t in db.get_setting(engine, KEY) or [])


class NewToken(BaseModel):
    name: str


def make_router(engine, current_user: Callable) -> APIRouter:
    r = APIRouter(prefix="/api/agent-tokens")

    def joost(user: str = Depends(current_user)) -> str:
        if user == "agent":
            raise HTTPException(status_code=403, detail="alleen Joost (ingelogd op de site) beheert agent-tokens")
        return user

    @r.get("")
    def get_tokens(user: str = Depends(joost)):
        return list_tokens(engine)

    @r.post("")
    def new_token(body: NewToken, user: str = Depends(joost)):
        name = body.name.strip()
        if not name or len(name) > 60:
            raise HTTPException(status_code=422, detail="naam van 1 tot 60 tekens")
        try:
            token, entry = create_token(engine, name)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        return {**entry, "token": token}

    @r.delete("/{token_id}")
    def delete_token(token_id: str, user: str = Depends(joost)):
        if not revoke_token(engine, token_id):
            raise HTTPException(status_code=404, detail="token niet gevonden")
        return {"ok": True}

    return r
