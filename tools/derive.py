"""Recompute derived data in the database: time per HR zone on each activity, and the regular routes.

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
    changed, runs = 0, []
    for a in db.load_activities(engine, with_streams=True):
        s = a.get("streams") or {}
        if zones:
            z = zone_seconds(zones, a["sport"], s["heartrate"], s["time"]) if s.get("heartrate") and s.get("time") else None
            if a.get("hr_zones_s") != z:
                db.set_derived(engine, a["id"], hr_zones_s=z)
                changed += 1
        if a["sport"] == "run" and s.get("latlng") and a.get("distance_km"):
            runs.append(_run_for_routes(a, s["latlng"]))

    existing = [r for r in db.load_routes(engine) if r.get("sport", "run") == "run"]
    routes = [dict(r, sport="run") for r in build_routes(runs, existing)]
    db.save_routes(engine, routes)
    return {"zones_updated": changed, "routes": len(routes)}


if __name__ == "__main__":
    print(derive(db.connect(os.environ["DATABASE_URL"])))
