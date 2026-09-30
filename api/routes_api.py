"""Rondjes: recurring routes with a map, the history of every run on them, and "a route for X km".

Plain callables in, so it works on routes.json and on the routes table alike. Wire it in api/main.py with:

    app.include_router(routes_api.make_router(routes_fn, lambda: store.activities, store.streams, today_fn, current_user, save_fn))

`save_fn(routes)` persists a rename; leave it out and renaming answers 501.
"""

from __future__ import annotations

from datetime import date
from statistics import median
from typing import Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.history import _pick
from tools.recommend import recommend

PREVIEW_POINTS = 120
TRACK_POINTS = 800


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


def _track(route: dict, runs: list[dict], streams_fn: Callable, limit: int) -> list[list[float]]:
    """GPS track of the most recent run on the route that has one."""
    for a in reversed(runs):
        latlng = [p for p in ((streams_fn(a["id"]) or {}).get("latlng") or []) if p and p[0] is not None]
        if len(latlng) >= 2:
            return [[round(latlng[i][0], 5), round(latlng[i][1], 5)] for i in _pick(len(latlng), limit)]
    return []


def route_summary(route: dict, activities: list[dict], streams_fn: Callable, points: int = PREVIEW_POINTS) -> dict:
    runs = _runs(route, activities)
    paces = [(a, _pace(a)) for a in runs if _pace(a)]
    best = min(paces, key=lambda x: x[1]) if paces else None
    recent = [p for _, p in paces[-5:]]
    earlier = [p for _, p in paces[:-5]]
    eff = [e for e in (_efficiency(a) for a in runs) if e]
    return {
        **{k: route.get(k) for k in ("id", "name", "distance_km", "is_loop", "elevation_gain_m", "runs", "first_run", "last_run", "median_pace", "median_hr", "start")},
        "sport": route.get("sport", "run"),
        "best": {"activity_id": best[0]["id"], "date": best[0]["start_local"][:10], "pace_s_per_km": best[1], "moving_time_s": best[0].get("moving_time_s")} if best else None,
        "recent_pace_s_per_km": round(median(recent)) if recent else None,
        "earlier_pace_s_per_km": round(median(earlier)) if earlier else None,
        "recent_efficiency": round(median(eff[-5:]), 3) if eff[:-5] else None,
        "earlier_efficiency": round(median(eff[:-5]), 3) if eff[:-5] else None,
        "track": _track(route, runs, streams_fn, points),
    }


def route_detail(route: dict, activities: list[dict], streams_fn: Callable) -> dict:
    runs = _runs(route, activities)
    out = route_summary(route, activities, streams_fn, TRACK_POINTS)
    out["history"] = [
        {"id": a["id"], "date": a["start_local"][:10], "distance_km": a.get("distance_km"), "moving_time_s": a.get("moving_time_s"), "avg_hr": a.get("avg_hr"), "pace_s_per_km": _pace(a), "m_per_beat": _efficiency(a), "hr_zones_s": a.get("hr_zones_s")}
        for a in runs
    ]
    return out


def suggest(routes: list[dict], activities: list[dict], streams_fn: Callable, km: float, today: date, tolerance: float = 0.05, start: str | None = None, limit: int = 3) -> list[dict]:
    usable = [r for r in routes if r.get("start") and r.get("last_run")]
    if not usable:
        return []
    by_id = {r["id"]: r for r in usable}
    if start and start not in by_id:
        raise HTTPException(status_code=404, detail="onbekend rondje")
    out = []
    for rec in recommend(usable, km, today, tolerance, start=start, limit=limit):
        parts = [by_id[p] for p in rec["parts"]]
        out.append({**rec, "names": [p.get("name") or p["id"] for p in parts], "tracks": {p["id"]: _track(p, _runs(p, activities), streams_fn, 300) for p in parts}})
    return out


class RouteRename(BaseModel):
    name: str


def make_router(
    routes: Callable[[], list[dict]],
    activities: Callable[[], list[dict]],
    streams: Callable,
    today: Callable[[], date],
    author: Callable,
    save: Callable[[list[dict]], None] | None = None,
) -> APIRouter:
    r = APIRouter()

    def find(route_id: str) -> dict:
        for route in routes():
            if route["id"] == route_id:
                return route
        raise HTTPException(status_code=404, detail="rondje niet gevonden")

    @r.get("/api/routes")
    def list_routes(sport: str | None = None, who: str = Depends(author)):
        items = [x for x in routes() if not sport or x.get("sport", "run") == sport]
        acts = activities()
        return sorted((route_summary(x, acts, streams) for x in items), key=lambda x: -(x.get("runs") or 0))

    # before /{route_id} so "suggest" is not taken for an id
    @r.get("/api/routes/suggest")
    def suggest_route(km: float = Query(..., gt=0, le=100), tolerance: float = Query(0.05, ge=0, le=0.5), start: str | None = None, who: str = Depends(author)):
        return {"km": km, "options": suggest(routes(), activities(), streams, km, today(), tolerance, start)}

    @r.get("/api/routes/{route_id}")
    def get_route(route_id: str, who: str = Depends(author)):
        return route_detail(find(route_id), activities(), streams)

    @r.patch("/api/routes/{route_id}")
    def rename(route_id: str, body: RouteRename, who: str = Depends(author)):
        if save is None:
            raise HTTPException(status_code=501, detail="hernoemen kan pas als rondjes in de database staan")
        name = body.name.strip()
        if not name or len(name) > 80:
            raise HTTPException(status_code=422, detail="naam van 1 tot 80 tekens")
        items = routes()
        for x in items:
            if x["id"] == route_id:
                x["name"] = name
                save(items)
                return route_detail(x, activities(), streams)
        raise HTTPException(status_code=404, detail="rondje niet gevonden")

    return r
