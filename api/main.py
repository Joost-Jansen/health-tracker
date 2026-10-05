"""Training dashboard API. Serves /api/* and the static site from web/out.

    uvicorn api.main:create_app --factory --host 0.0.0.0 --port 8000

Data comes from the database (DATABASE_URL), per user. Auth: session
cookie (browser) or Bearer agent token; every route sees only the caller's data (api/users.py).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from api import agent_tokens, connections, errors, feedback, mcp, onboarding, routes_api, settings_api, uploads, users, zones_api
from api.errors import ApiError
from api.sync_runner import SyncRunner
from api.content import content_router
from api.dashboard import build_dashboard, next_race, plan_week, sync_day, today_form_pct, today_tsb
from api.history import activity_detail, heatmap, list_activities
from api.plans import enrich, make_router as plans_router
from api.readiness import readiness
from api.trends import build_trends, hr_flags
from tools import db

ROOT = Path(__file__).resolve().parents[1]
TZ = ZoneInfo("Europe/Amsterdam")


MIN_KM, MAX_KM = 0.01, 1000  # a corrected distance


class ActivityCorrection(BaseModel):
    distance_km: float | None = None


@dataclass
class Settings:
    jwt_secret: str
    user: str = ""  # first admin on a fresh multi-user database (bootstrap), not needed afterwards
    password_hash: str = ""
    cookie_secure: bool = True
    token_days: int = 30
    agent_token_hash: str = ""  # legacy env token, belongs to the first admin

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            jwt_secret=os.environ.get("TRAINING_JWT_SECRET", ""),
            user=os.environ.get("TRAINING_USER", ""),
            password_hash=os.environ.get("TRAINING_PASSWORD_HASH", ""),
            cookie_secure=os.environ.get("COOKIE_SECURE", "true").lower() != "false",
            agent_token_hash=os.environ.get("TRAINING_AGENT_TOKEN_HASH", ""),
        )


def today():
    return datetime.now(TZ).date()


def create_app(engine=None, static_dir: Path | None = None, settings: Settings | None = None, garmin_auth=None, garmin_client=None, **sync_kwargs) -> FastAPI:
    """`garmin_auth`, `garmin_client` and `sync_kwargs` replace the real Garmin login, client and FIT reader (tests)."""
    settings = settings or Settings.from_env()
    if not settings.jwt_secret:
        raise RuntimeError("TRAINING_JWT_SECRET ontbreekt")
    production = engine is None  # engine from DATABASE_URL: the real service (tests pass their own engine)
    if production:
        engine = db.connect(os.environ["DATABASE_URL"])
    migrated = db.create_schema(engine)
    if migrated:
        print(f"database: omgezet naar meerdere gebruikers, alle data naar gebruiker 1: {migrated}", flush=True)
    users.bootstrap(engine, settings.user, settings.password_hash)

    stores = users.Stores(engine)
    current_user, token_user = users.make_auth(engine, stores, settings.jwt_secret, settings.agent_token_hash)
    app = FastAPI(title="health-tracker", docs_url=None, redoc_url=None, openapi_url=None)
    errors.install(app)
    app.state.engine, app.state.stores = engine, stores
    runner = SyncRunner(engine, stores, client_factory=garmin_client, **sync_kwargs)
    app.state.sync = runner
    if production and os.environ.get("SYNC_IN_WEB", "true") != "false":
        runner.start_daily()

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    app.include_router(users.make_router(engine, stores, current_user, settings.jwt_secret, settings.cookie_secure, settings.token_days))

    @app.get("/api/dashboard")
    def dashboard(u=Depends(current_user)):
        s, day = u.store, today()
        out = build_dashboard(s.activities, s.wellness, s.zones, day, s.last_sync, s.rhr_fallback)
        out["readiness"] = readiness(s.wellness, day, today_tsb(out["form"]), today_form_pct(out["form"]))
        plan = db.active_plan(u.scope)
        if plan:
            sessions = enrich(plan, s.activities, s.routes, day)["sessions"]
            out["upcoming"] = [x for x in sessions if x["date"] >= day.isoformat()][:5]
            out["plan_title"] = plan["title"]
            out["plan_week"] = plan_week(sessions, s.activities, day, sync_day(s.last_sync))
            out["race"] = next_race(plan, sessions, day)
        return out

    cache: dict = {}

    def cached(u, key: tuple, fn):
        # streams-heavy results (trends, heatmap) only change after a sync or at midnight
        key = (u.id, *key, u.store.last_sync, len(u.store.activities))
        if key not in cache:
            if len(cache) > 64:
                cache.clear()
            cache[key] = fn()
        return cache[key]

    @app.get("/api/activities")
    def activities(sport: str | None = None, start: str | None = Query(None, alias="from"), end: str | None = Query(None, alias="to"), u=Depends(current_user)):
        s = u.store
        flags = cached(u, ("hrflags",), lambda: hr_flags(s.activities, s.streams))
        return list_activities(s.activities, sport, start, end, hr_flags=flags)

    @app.get("/api/activities/{activity_id}")
    def activity(activity_id: str, u=Depends(current_user)):
        s = u.store
        out = activity_detail(activity_id, s.activities, s.streams, s.zones, s.routes)
        if out is None:
            raise ApiError(404, "activity_not_found")
        return out

    @app.patch("/api/activities/{activity_id}")
    def correct_activity(activity_id: str, body: ActivityCorrection, u=Depends(current_user)):
        """The real distance of an activity whose GPS got it wrong (an open-water swim); null removes the correction."""
        if body.distance_km is not None and not MIN_KM <= body.distance_km <= MAX_KM:
            raise ApiError(422, "invalid_distance", min=MIN_KM, max=MAX_KM)
        if db.set_manual_distance(u.scope, activity_id, body.distance_km) is None:
            raise ApiError(404, "activity_not_found")
        u.store.invalidate()
        return activity_detail(activity_id, u.store.activities, u.store.streams, u.store.zones, u.store.routes)

    @app.get("/api/heatmap")
    def heatmap_route(sport: str | None = "run", u=Depends(current_user)):
        return cached(u, ("heatmap", sport), lambda: heatmap(u.store.activities, u.store.streams, sport or None))

    @app.get("/api/trends")
    def trends(u=Depends(current_user)):
        day, s = today(), u.store
        plan = db.active_plan(u.scope)
        # the goal-based insights follow the active plan, so it is part of the cache key
        key = ("trends", day, plan and (plan["id"], plan.get("race"), plan.get("goal")))
        return cached(u, key, lambda: build_trends(s.activities, s.wellness, s.zones, s.streams, day, s.rhr_fallback, plan=plan, last_sync=s.last_sync))

    app.include_router(plans_router(today, current_user))
    app.include_router(content_router(current_user))
    app.include_router(routes_api.make_router(today, current_user))
    app.include_router(zones_api.make_router(today, current_user))
    app.include_router(agent_tokens.make_router(current_user))
    app.include_router(connections.make_router(current_user, runner, runner.key, garmin_auth, today))
    app.include_router(settings_api.make_router(current_user))
    app.include_router(onboarding.make_router(current_user, runner))
    app.include_router(uploads.make_router(current_user))
    app.include_router(feedback.make_router(engine, current_user))
    app.include_router(mcp.make_router(today, current_user, token_user))

    static_dir = static_dir or ROOT / "web" / "out"
    if static_dir.exists():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="site")
    return app
