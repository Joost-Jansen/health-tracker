"""Recognise recurring routes ("vaste rondjes") from GPS tracks, for runs and for rides.

A run or ride is reduced to a shape: start, end, distance and the set of ~100 m
grid cells it passes. Two are the same route when they start close together,
have a similar distance and cover mostly the same cells. A cluster of at least
MIN_COUNT[sport] activities becomes a route. Route ids carry a prefix per sport
(r1, r2, ... for runs; f1, f2, ... for rides) so both live in one routes table.
"""

from __future__ import annotations

import math
import re
from statistics import median

CELL_M = 100.0
REF_LAT = 52.0  # fixed so cell ids are stable across runs; fine for the Netherlands
M_PER_DEG_LAT = 111_320.0
DLAT = CELL_M / M_PER_DEG_LAT
DLON = CELL_M / (M_PER_DEG_LAT * math.cos(math.radians(REF_LAT)))

START_RADIUS_M = 300.0
LOOP_RADIUS_M = 300.0  # watch is often stopped a few hundred metres before home
MAX_DISTANCE_DIFF = 0.10
MIN_OVERLAP = 0.75  # real data: same loop with a small detour overlaps ~76%
MIN_RUNS = 3
MIN_COUNT = {"run": MIN_RUNS, "ride": 2}  # few rides with GPS, so two of the same already count
PREFIX = {"run": "r", "ride": "f"}
LABELS = {"run": ("rondje", "route"), "ride": ("fietsrondje", "fietsroute")}  # (loop, point to point)
DEFAULT_NAME = re.compile(r"^\d+\.\d km (rondje \(r|route \(r|fietsrondje \(f|fietsroute \(f)\d+\)$")


def haversine_m(a, b) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


def _cell(point) -> tuple[int, int]:
    return (math.floor(point[0] / DLAT), math.floor(point[1] / DLON))


def shape(run: dict) -> dict | None:
    """Comparable shape of a run, or None when it has no GPS track."""
    latlng = run.get("latlng") or []
    if len(latlng) < 2:
        return None
    return {
        "start": list(latlng[0]),
        "end": list(latlng[-1]),
        "distance_km": run["distance_km"],
        "cells": {_cell(p) for p in latlng},
    }


def _covered(cells: set, other: set) -> float:
    """Share of `cells` that lie in or next to a cell of `other` (absorbs GPS noise)."""
    if not cells:
        return 0.0
    hit = sum(
        1 for (i, j) in cells if any((i + di, j + dj) in other for di in (-1, 0, 1) for dj in (-1, 0, 1))
    )
    return hit / len(cells)


def same_shape(a: dict, b: dict) -> bool:
    if haversine_m(a["start"], b["start"]) > START_RADIUS_M:
        return False
    longest = max(a["distance_km"], b["distance_km"])
    if longest <= 0 or abs(a["distance_km"] - b["distance_km"]) / longest > MAX_DISTANCE_DIFF:
        return False
    return min(_covered(a["cells"], b["cells"]), _covered(b["cells"], a["cells"])) >= MIN_OVERLAP


def same_route(a: dict, b: dict) -> bool:
    sa, sb = shape(a), shape(b)
    return sa is not None and sb is not None and same_shape(sa, sb)


def _pace(seconds_per_km: float) -> str:
    total = round(seconds_per_km)
    return f"{total // 60}:{total % 60:02d}"


def _stored_shape(route: dict) -> dict:
    return {
        "start": route["start"],
        "end": route["end"],
        "distance_km": route["distance_km"],
        "cells": {tuple(c) for c in route["cells"]},
    }


def _next_number(ids, prefix: str) -> int:
    nums = [int(i[len(prefix):]) for i in ids if i.startswith(prefix) and i[len(prefix):].isdigit()]
    return 1 + max(nums, default=0)


def build_routes(runs: list[dict], existing: list[dict], sport: str = "run", min_runs: int | None = None) -> list[dict]:
    """Cluster runs (or rides) of one sport into routes; keep id and name of matching existing routes.

    `existing` may hold routes of every sport: only those of `sport` are matched, so a ride never takes over a
    run route's id or name. Numbering continues per prefix (r for runs, f for rides).
    """
    prefix = PREFIX.get(sport, sport[:1])
    loop_label, line_label = LABELS.get(sport, LABELS["run"])
    min_runs = MIN_COUNT.get(sport, MIN_RUNS) if min_runs is None else min_runs

    clusters: list[tuple[dict, list[dict]]] = []  # (representative shape, runs)
    for run in sorted(runs, key=lambda r: r["date"]):
        s = shape(run)
        if s is None:
            continue
        for rep, members in clusters:
            if same_shape(rep, s):
                members.append(run)
                break
        else:
            clusters.append((s, [run]))

    unmatched = [r for r in existing if r.get("sport", "run") == sport]
    next_n = _next_number({r["id"] for r in existing}, prefix)

    routes = []
    for rep, members in clusters:
        if len(members) < min_runs:
            continue
        match = next((r for r in unmatched if same_shape(_stored_shape(r), rep)), None)
        if match:
            unmatched.remove(match)
            route_id = match["id"]
            name = None if DEFAULT_NAME.match(match["name"]) else match["name"]  # keep only names Joost gave
        else:
            route_id, name = f"{prefix}{next_n}", None
            next_n += 1

        distance = round(median(m["distance_km"] for m in members), 2)
        is_loop = haversine_m(rep["start"], rep["end"]) <= LOOP_RADIUS_M
        hrs = [m["avg_hr"] for m in members if m.get("avg_hr")]
        timed = [m for m in members if m.get("moving_time_s") and m["distance_km"]]
        paces = [m["moving_time_s"] / m["distance_km"] for m in timed]
        speeds = [m["distance_km"] / m["moving_time_s"] * 3600 for m in timed]
        routes.append(
            {
                "id": route_id,
                "sport": sport,
                "name": name or f"{distance:.1f} km {loop_label if is_loop else line_label} ({route_id})",
                "distance_km": distance,
                "is_loop": is_loop,
                "elevation_gain_m": round(median(m.get("elevation_gain_m") or 0 for m in members)),
                "runs": len(members),
                "first_run": members[0]["date"],
                "last_run": members[-1]["date"],
                # tempo for runs, speed for rides; the other one is None so every route has the same fields
                "median_pace": _pace(median(paces)) if paces and sport != "ride" else None,
                "median_speed_kmh": round(median(speeds), 1) if speeds and sport == "ride" else None,
                "median_hr": round(median(hrs)) if hrs else None,
                "start": [round(x, 5) for x in rep["start"]],
                "end": [round(x, 5) for x in rep["end"]],
                "activity_ids": [m["activity_id"] for m in members],
                "cells": sorted([list(c) for c in rep["cells"]]),
            }
        )
    return sorted(routes, key=lambda r: (-r["runs"], r["id"]))
