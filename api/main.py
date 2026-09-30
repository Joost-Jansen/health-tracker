"""Training dashboard API. Serves /api/* and the static site from web/out.

    uvicorn api.main:create_app --factory --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from api import auth
from api.dashboard import build_dashboard
from api.data import DataStore
from api.history import activity_detail, heatmap, list_activities
from api.trends import build_trends

ROOT = Path(__file__).resolve().parents[1]
TZ = ZoneInfo("Europe/Amsterdam")


@dataclass
class Settings:
    user: str
    password_hash: str
    jwt_secret: str
    cookie_secure: bool = True
    token_days: int = 30

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            user=os.environ.get("TRAINING_USER", ""),
            password_hash=os.environ.get("TRAINING_PASSWORD_HASH", ""),
            jwt_secret=os.environ.get("TRAINING_JWT_SECRET", ""),
            cookie_secure=os.environ.get("COOKIE_SECURE", "true").lower() != "false",
        )


class Credentials(BaseModel):
    username: str
    password: str


def create_app(root: Path = ROOT, static_dir: Path | None = None, settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = DataStore(root)
    throttle = auth.Throttle()
    app = FastAPI(title="training", docs_url=None, redoc_url=None, openapi_url=None)

    def current_user(request: Request) -> str:
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

    cache: dict = {}

    def cached(key: tuple, fn):
        # streams-heavy results (trends, heatmap) only change after a sync or at midnight
        key = (*key, store.last_sync, len(store.activities))
        if key not in cache:
            if len(cache) > 32:
                cache.clear()
            cache[key] = fn()
        return cache[key]

    def routes() -> list[dict]:
        path = root / "routes" / "routes.json"
        return json.loads(path.read_text()) if path.exists() else []

    @app.get("/api/activities")
    def activities(sport: str | None = None, start: str | None = Query(None, alias="from"), end: str | None = Query(None, alias="to"), user: str = Depends(current_user)):
        return list_activities(store.activities, sport, start, end)

    @app.get("/api/activities/{activity_id}")
    def activity(activity_id: str, user: str = Depends(current_user)):
        out = activity_detail(activity_id, store.activities, store.streams, store.zones, routes())
        if out is None:
            raise HTTPException(status_code=404, detail="activiteit niet gevonden")
        return out

    @app.get("/api/heatmap")
    def heatmap_route(sport: str | None = "run", user: str = Depends(current_user)):
        return cached(("heatmap", sport), lambda: heatmap(store.activities, store.streams, sport or None))

    @app.get("/api/trends")
    def trends(user: str = Depends(current_user)):
        today = datetime.now(TZ).date()
        return cached(("trends", today), lambda: build_trends(store.activities, store.wellness, store.zones, store.streams, today))

    static_dir = static_dir or root / "web" / "out"
    if static_dir.exists():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="site")
    return app
