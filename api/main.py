"""Training dashboard API. Serves /api/* and the static site from web/out.

    uvicorn api.main:create_app --factory --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from api import auth
from api.content import content_router
from api.dashboard import build_dashboard
from api.data import DataStore
from tools import db

ROOT = Path(__file__).resolve().parents[1]
TZ = ZoneInfo("Europe/Amsterdam")


@dataclass
class Settings:
    user: str
    password_hash: str
    jwt_secret: str
    cookie_secure: bool = True
    token_days: int = 30
    agent_token_hash: str = ""  # sha256 hex of the agents' Bearer token

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            user=os.environ.get("TRAINING_USER", ""),
            password_hash=os.environ.get("TRAINING_PASSWORD_HASH", ""),
            jwt_secret=os.environ.get("TRAINING_JWT_SECRET", ""),
            cookie_secure=os.environ.get("COOKIE_SECURE", "true").lower() != "false",
            agent_token_hash=os.environ.get("TRAINING_AGENT_TOKEN_HASH", ""),
        )


class Credentials(BaseModel):
    username: str
    password: str


def create_app(engine=None, static_dir: Path | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    if engine is None:
        engine = db.connect(os.environ["DATABASE_URL"])
    db.create_schema(engine)
    store = DataStore(engine)
    throttle = auth.Throttle()
    app = FastAPI(title="training", docs_url=None, redoc_url=None, openapi_url=None)

    def current_user(request: Request) -> str:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
            if token and settings.agent_token_hash and auth.same(hashlib.sha256(token.encode()).hexdigest(), settings.agent_token_hash):
                return "agent"
            raise HTTPException(status_code=401, detail="ongeldig agent-token")
        user = auth.token_user(request.cookies.get(auth.COOKIE), settings.jwt_secret)
        if not user or not settings.user or not auth.same(user, settings.user):
            raise HTTPException(status_code=401, detail="niet ingelogd")
        return user

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/login")
    def login(creds: Credentials, response: Response):
        if throttle.locked():
            raise HTTPException(status_code=429, detail="te veel pogingen, probeer het over een kwartier opnieuw")
        ok = bool(settings.user and settings.jwt_secret) and auth.same(creds.username, settings.user)
        ok = auth.verify_password(creds.password, settings.password_hash) and ok
        if not ok:
            throttle.fail()
            raise HTTPException(status_code=401, detail="onjuiste gebruikersnaam of wachtwoord")
        throttle.succeed()
        token = auth.create_token(settings.user, settings.jwt_secret, settings.token_days)
        response.set_cookie(
            auth.COOKIE, token, max_age=settings.token_days * 86400, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/"
        )
        return {"username": settings.user}

    @app.post("/api/logout")
    def logout(response: Response):
        response.delete_cookie(auth.COOKIE, path="/")
        return {"ok": True}

    @app.get("/api/me")
    def me(user: str = Depends(current_user)):
        return {"username": user}

    @app.get("/api/dashboard")
    def dashboard(user: str = Depends(current_user)):
        return build_dashboard(store.activities, store.wellness, store.zones, datetime.now(TZ).date(), store.last_sync)

    app.include_router(content_router(store, current_user))

    static_dir = static_dir or ROOT / "web" / "out"
    if static_dir.exists():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="site")
    return app
