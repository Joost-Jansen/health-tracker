"""Recompute derived data in the database: time per HR zone on each activity, and the regular routes
(runs and outdoor rides; indoor rides have no GPS track and never form a route).

Run after every sync and after a zones change:

    DATABASE_URL=... python tools/derive.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools import db
from tools.routes import build_routes

ROUTE_SPORTS = ("run", "ride")
from tools.zones import zone_seconds


def _run_for_routes(a: dict, latlng: list) -> dict:
    return {
        "activity_id": a["id"],
        "date": a["start_local"][:10],
        "distance_km": a["distance_km"],
        "latlng": latlng,
        "elevation_gain_m": a.get("elevation_gain_m"),
        "avg_hr": a.get("avg_hr"),
        "moving_time_s": a.get("moving_time_s"),
    }


def derive(engine) -> dict:
    zones = db.get_setting(engine, "zones")
    changed = 0
    tracks: dict[str, list[dict]] = {sport: [] for sport in ROUTE_SPORTS}
    for a in db.load_activities(engine, with_streams=True):
        s = a.get("streams") or {}
        if zones:
            z = zone_seconds(zones, a["sport"], s["heartrate"], s["time"]) if s.get("heartrate") and s.get("time") else None
            if a.get("hr_zones_s") != z:
                db.set_derived(engine, a["id"], hr_zones_s=z)
                changed += 1
        if a["sport"] in tracks and s.get("latlng") and a.get("distance_km"):
            tracks[a["sport"]].append(_run_for_routes(a, s["latlng"]))

    # save_routes replaces the whole table, so rebuild every sport and save them together;
    # build_routes only matches existing routes of its own sport (ids r.. for runs, f.. for rides)
    existing = db.load_routes(engine)
    routes, counts = [], {}
    for sport in ROUTE_SPORTS:
        built = build_routes(tracks[sport], existing, sport=sport)
        counts[sport] = len(built)
        routes += built
    db.save_routes(engine, routes)
    return {"zones_updated": changed, "routes": counts}


if __name__ == "__main__":
    print(derive(db.connect(os.environ["DATABASE_URL"])))
