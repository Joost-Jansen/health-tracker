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
from pydantic import BaseModel

from api import agent_tokens, apple, auth, connections, daily, errors, example, feedback, mcp, onboarding, routes_api, settings_api, site, uploads, users, zones_api
from api.websec import log_redact
from api.websec.csrf import OriginCheckMiddleware
from api.websec.headers import SecurityHeadersMiddleware
from api.websec.uploads import BodyLimitMiddleware
from api.errors import ApiError
from api.sync_runner import SyncRunner
from api.content import content_router
from api.dashboard import build_dashboard, next_race, plan_week, sync_day, today_form_pct, today_tsb
from api.history import activity_detail, heatmap, list_activities
from api.plans import enrich, make_router as plans_router
from api.readiness import readiness
from api.trends import build_trends, hr_flags
from tools import db, secretbox

ROOT = Path(__file__).resolve().parents[1]
TZ = ZoneInfo("Europe/Amsterdam")


MIN_KM, MAX_KM = 0.01, 1000  # a corrected distance
JSON_BODY_MAX = 6 * 1024 * 1024  # any other request: a feedback screenshot (3 MB, base64) is the largest legitimate one


class ActivityCorrection(BaseModel):
    distance_km: float | None = None


@dataclass
class Settings:
    jwt_secret: str
    user: str = ""  # first admin on a fresh multi-user database (bootstrap), not needed afterwards
    password_hash: str = ""
    cookie_secure: bool = True
    session_days: int = 14  # sliding: renewed while in use (api/users.py)
    agent_token_hash: str = ""  # legacy env token, belongs to the first admin
    public_origins: tuple[str, ...] = ()  # PUBLIC_ORIGINS: extra origins allowed to post (the CSRF check)
    trusted_proxies: str = ""  # TRUSTED_PROXIES: whose CF-Connecting-IP / X-Forwarded-For is believed

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            jwt_secret=os.environ.get("TRAINING_JWT_SECRET", ""),
            user=os.environ.get("TRAINING_USER", ""),
            password_hash=os.environ.get("TRAINING_PASSWORD_HASH", ""),
            cookie_secure=os.environ.get("COOKIE_SECURE", "true").lower() != "false",
            agent_token_hash=os.environ.get("TRAINING_AGENT_TOKEN_HASH", ""),
            session_days=int(os.environ.get("SESSION_DAYS") or 14),
            public_origins=tuple(o.strip() for o in os.environ.get("PUBLIC_ORIGINS", "").split(",") if o.strip()),
            trusted_proxies=os.environ.get("TRUSTED_PROXIES", ""),
        )


def today():
    return datetime.now(TZ).date()


def insecure_allowed() -> bool:
    """ALLOW_INSECURE_DEFAULTS=true: the one opt-out (local development) of the checks below."""
    return os.environ.get("ALLOW_INSECURE_DEFAULTS", "").lower() == "true"


def check_production_secrets(settings: Settings) -> None:
    """Refuse to start with secrets that would make the install unsafe, instead of running with them quietly."""
    if insecure_allowed():
        return
    if len(settings.jwt_secret) < 32:
        raise RuntimeError("TRAINING_JWT_SECRET is shorter than 32 characters; make one with: python -c \"import secrets; print(secrets.token_hex(32))\"")
    key = secretbox.configured_key()
    if not key:
        raise RuntimeError(
            "APP_ENCRYPTION_KEY is not set. New install: python -m tools.secretbox --new-key. Existing install that ran without it: "
            "python -m tools.secretbox --print-derived-key (with the same TRAINING_JWT_SECRET) keeps stored connections readable. "
            "ALLOW_INSECURE_DEFAULTS=true skips this check (development only)."
        )
    if not secretbox.valid_key(key):
        raise RuntimeError("APP_ENCRYPTION_KEY is not a valid Fernet key (32 url-safe base64-encoded bytes)")


def create_app(engine=None, static_dir: Path | None = None, settings: Settings | None = None, garmin_auth=None, garmin_client=None,
               example_dir: Path | None = None, **sync_kwargs) -> FastAPI:
    """`garmin_auth`, `garmin_client` and `sync_kwargs` replace the real Garmin login, client and FIT reader (tests).
    `example_dir` holds the example account's database (api/example.py; default EXAMPLE_DATA_DIR or the temp dir)."""
    settings = settings or Settings.from_env()
    if not settings.jwt_secret:
        raise RuntimeError("TRAINING_JWT_SECRET ontbreekt")
    production = engine is None  # engine from DATABASE_URL: the real service (tests pass their own engine)
    if production:
        check_production_secrets(settings)
        engine = db.connect(os.environ["DATABASE_URL"])
    migrated = db.create_schema(engine)
    if migrated:
        print(f"database: omgezet naar meerdere gebruikers, alle data naar gebruiker 1: {migrated}", flush=True)
    users.bootstrap(engine, settings.user, settings.password_hash)

    stores = users.Stores(engine)
    examples = example.ExampleData(example_dir, today)
    guards = users.Guards.from_env(settings.trusted_proxies)
    current_user, token_user = users.make_auth(engine, stores, settings.jwt_secret, settings.agent_token_hash, examples,
                                               settings.session_days, settings.cookie_secure, guards)
    app = FastAPI(title="health-tracker", docs_url=None, redoc_url=None, openapi_url=None)
    errors.install(app)
    log_redact.install()  # the MCP token in /api/mcp/<token> and Bearer values never reach the logs
    # Innermost first (each add wraps the previous): the security headers end up on every response, also a 403 or 413.
    app.middleware("http")(example.refuse_writes)
    app.add_middleware(OriginCheckMiddleware, allowed_origins=settings.public_origins, cookie_name=auth.COOKIE, exempt_paths=("/api/mcp",))
    app.add_middleware(BodyLimitMiddleware, default=JSON_BODY_MAX, limits={
        "/api/activities/upload": uploads.MAX_BYTES + 1024,
        "/api/apple/import": apple.MAX_BYTES + 1024,
        "/api/apple/upload": apple.CHUNK_BYTES + 1024,
    })
    app.add_middleware(SecurityHeadersMiddleware, csp=site.API_CSP, hsts=settings.cookie_secure)
    app.state.engine, app.state.stores, app.state.examples = engine, stores, examples
    runner = SyncRunner(engine, stores, client_factory=garmin_client, **sync_kwargs)
    app.state.sync = runner
    if production and os.environ.get("SYNC_IN_WEB", "true") != "false":
        runner.start_daily()
    if production:
        examples.warm()  # seed the example account in the background, so the first walk does not wait for it

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    app.include_router(users.make_router(engine, stores, current_user, settings.jwt_secret, settings.cookie_secure, settings.session_days, guards))

    @app.get("/api/dashboard")
    def dashboard(u=Depends(current_user)):
        s, day = u.store, today()
        out = build_dashboard(s.activities, s.wellness, s.zones, day, s.last_sync, s.rhr_fallback)
        out["readiness"] = readiness(s.wellness, day, today_tsb(out["form"]), today_form_pct(out["form"]), s.rhr_fallback)
        plan = db.active_plan(u.scope)
        if plan:
            sessions = enrich(plan, s.activities, s.routes, day)["sessions"]
            out["upcoming"] = [x for x in sessions if x["date"] >= day.isoformat()][:12]  # Today shows as many as fit
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
    app.include_router(daily.make_router(today, current_user))
    app.include_router(agent_tokens.make_router(current_user))
    app.include_router(connections.make_router(current_user, runner, runner.key, garmin_auth, today))
    app.include_router(settings_api.make_router(current_user))
    app.include_router(uploads.make_router(current_user))
    app.state.apple = apple.AppleImports(stores, on_done=cache.clear)
    app.include_router(apple.make_router(current_user, app.state.apple))
    app.include_router(onboarding.make_router(current_user, runner, app.state.apple))
    app.include_router(feedback.make_router(engine, current_user))
    app.include_router(mcp.make_router(today, current_user, token_user, guards))

    static_dir = static_dir or ROOT / "web" / "out"
    if static_dir.exists():
        app.mount("/", site.SiteFiles(directory=static_dir, html=True), name="site")
    return app
