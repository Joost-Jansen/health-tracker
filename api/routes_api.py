"""Rondjes: recurring routes (runs and rides) with a map, the history of every run or ride on them, and "a route for X km".

The pure functions take plain data; the router reads the caller's routes and activities from their DataStore:

    app.include_router(routes_api.make_router(today_fn, current_user))
"""

from __future__ import annotations

from datetime import date
from statistics import median
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.history import _pick
from tools import db
from tools.recommend import recommend

PREVIEW_POINTS = 150
TRACK_POINTS = 800
VARIANT_POINTS = {"preview": 80, "detail": 300}
# (user id, activity id, points) -> downsampled track; a stored track never changes. Keyed by user because activity
# ids repeat across users; streams_fn is the user's DataStore.streams (plain functions in tests key on themselves).
_TRACK_CACHE: dict[tuple, list] = {}
_CACHE_MAX = 4000


def _runs(route: dict, activities: list[dict]) -> list[dict]:
    refs = set(route.get("activity_ids") or [])
    return sorted((a for a in activities if a["id"] in refs or a["start_local"] in refs), key=lambda a: a["start_local"])


def _pace(a: dict) -> int | None:
    if a.get("moving_time_s") and a.get("distance_km"):
        return round(a["moving_time_s"] / a["distance_km"])
    return None


def _efficiency(a: dict) -> float | None:
    """Metres per heartbeat: speed divided by heart rate. Higher at the same route = fitter, whatever the effort."""
    if a.get("moving_time_s") and a.get("distance_km") and a.get("avg_hr"):
        return round(a["distance_km"] * 1000 / (a["moving_time_s"] / 60 * a["avg_hr"]), 3)
    return None


def _activity_track(aid: str, streams_fn: Callable, limit: int) -> list[list[float]]:
    owner = getattr(streams_fn, "__self__", None)
    scope = getattr(owner, "scope", None)
    key = (scope.user_id if scope is not None else streams_fn, aid, limit)
    if key not in _TRACK_CACHE:
        latlng = [p for p in ((streams_fn(aid) or {}).get("latlng") or []) if p and p[0] is not None]
        if len(_TRACK_CACHE) >= _CACHE_MAX:
            _TRACK_CACHE.clear()
        _TRACK_CACHE[key] = [[round(latlng[i][0], 5), round(latlng[i][1], 5)] for i in _pick(len(latlng), limit)] if len(latlng) >= 2 else []
    return _TRACK_CACHE[key]


def _track(route: dict, runs: list[dict], streams_fn: Callable, limit: int) -> list[list[float]]:
    """The route's "average" track: its medoid (the run most like all others, from tools/routes.py), else the
    most recent run with GPS."""
    medoid = route.get("medoid_id")
    ordered = ([a for a in runs if a["id"] == medoid] if medoid else []) + list(reversed(runs))
    for a in ordered:
        track = _activity_track(a["id"], streams_fn, limit)
        if track:
            return track
    return []


def _variants(route: dict, runs: list[dict], streams_fn: Callable, limit: int) -> list[dict]:
    """Every other run on the route, to draw lightly under the average track."""
    medoid = route.get("medoid_id")
    out = []
    for a in runs:
        if a["id"] == medoid:
            continue
        track = _activity_track(a["id"], streams_fn, limit)
        if track:
            out.append({"id": a["id"], "date": a["start_local"][:10], "track": track})
    return out


def route_summary(route: dict, activities: list[dict], streams_fn: Callable, points: int = PREVIEW_POINTS, variant_points: int = VARIANT_POINTS["preview"]) -> dict:
    runs = _runs(route, activities)
    paces = [(a, _pace(a)) for a in runs if _pace(a)]
    best = min(paces, key=lambda x: x[1]) if paces else None
    recent = [p for _, p in paces[-5:]]
    earlier = [p for _, p in paces[:-5]]
    eff = [e for e in (_efficiency(a) for a in runs) if e]
    return {
        **{k: route.get(k) for k in ("id", "name", "distance_km", "is_loop", "elevation_gain_m", "runs", "first_run", "last_run", "median_pace", "median_speed_kmh", "median_hr", "start")},
        "sport": route.get("sport", "run"),
        "best": {"activity_id": best[0]["id"], "date": best[0]["start_local"][:10], "pace_s_per_km": best[1], "moving_time_s": best[0].get("moving_time_s")} if best else None,
        "recent_pace_s_per_km": round(median(recent)) if recent else None,
        "earlier_pace_s_per_km": round(median(earlier)) if earlier else None,
        "recent_efficiency": round(median(eff[-5:]), 3) if eff[:-5] else None,
        "earlier_efficiency": round(median(eff[:-5]), 3) if eff[:-5] else None,
        "medoid_id": route.get("medoid_id"),
        "track": _track(route, runs, streams_fn, points),
        "variants": _variants(route, runs, streams_fn, variant_points),
    }


def route_detail(route: dict, activities: list[dict], streams_fn: Callable) -> dict:
    runs = _runs(route, activities)
    out = route_summary(route, activities, streams_fn, TRACK_POINTS, VARIANT_POINTS["detail"])
    out["history"] = [
        {"id": a["id"], "date": a["start_local"][:10], "distance_km": a.get("distance_km"), "moving_time_s": a.get("moving_time_s"), "avg_hr": a.get("avg_hr"), "pace_s_per_km": _pace(a), "m_per_beat": _efficiency(a), "hr_zones_s": a.get("hr_zones_s")}
        for a in runs
    ]
    return out


def suggest(routes: list[dict], activities: list[dict], streams_fn: Callable, km: float, today: date, tolerance: float = 0.05, start: str | None = None, limit: int = 3, sport: str = "run") -> list[dict]:
    """Routes of one sport only (routes stored without a sport are runs); `start` must be a route of that sport."""
    usable = [r for r in routes if r.get("start") and r.get("last_run") and r.get("sport", "run") == sport]
    if not usable:
        return []
    by_id = {r["id"]: r for r in usable}
    if start and start not in by_id:
        raise HTTPException(status_code=404, detail="onbekend rondje")
    out = []
    for rec in recommend(usable, km, today, tolerance, start=start, limit=limit, sport=sport):
        parts = [by_id[p] for p in rec["parts"]]
        out.append({**rec, "names": [p.get("name") or p["id"] for p in parts], "tracks": {p["id"]: _track(p, _runs(p, activities), streams_fn, 300) for p in parts}})
    return out


class RouteRename(BaseModel):
    name: str


def make_router(today: Callable[[], date], current_user: Callable) -> APIRouter:
    """Routes of the caller (`current_user` returns an api.users.User); a rename is saved in their routes."""
    r = APIRouter()

    def find(u, route_id: str) -> dict:
        for route in u.store.routes:
            if route["id"] == route_id:
                return route
        raise HTTPException(status_code=404, detail="rondje niet gevonden")

    @r.get("/api/routes")
    def list_routes(sport: str | None = None, u=Depends(current_user)):
        items = [x for x in u.store.routes if not sport or x.get("sport", "run") == sport]
        acts = u.store.activities
        return sorted((route_summary(x, acts, u.store.streams) for x in items), key=lambda x: -(x.get("runs") or 0))

    # before /{route_id} so "suggest" is not taken for an id
    @r.get("/api/routes/suggest")
    def suggest_route(
        km: float = Query(..., gt=0, le=300),
        tolerance: float = Query(0.05, ge=0, le=0.5),
        start: str | None = None,
        sport: str = "run",
        u=Depends(current_user),
    ):
        return {"km": km, "options": suggest(u.store.routes, u.store.activities, u.store.streams, km, today(), tolerance, start, sport=sport)}

    @r.get("/api/routes/{route_id}")
    def get_route(route_id: str, u=Depends(current_user)):
        return route_detail(find(u, route_id), u.store.activities, u.store.streams)

    @r.patch("/api/routes/{route_id}")
    def rename(route_id: str, body: RouteRename, u=Depends(current_user)):
        name = body.name.strip()
        if not name or len(name) > 80:
            raise HTTPException(status_code=422, detail="naam van 1 tot 80 tekens")
        items = u.store.routes
        for x in items:
            if x["id"] == route_id:
                x["name"] = name
                db.save_routes(u.scope, items)
                return route_detail(x, u.store.activities, u.store.streams)
        raise HTTPException(status_code=404, detail="rondje niet gevonden")

    return r
