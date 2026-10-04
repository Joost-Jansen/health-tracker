"""Recognise recurring routes ("vaste rondjes") from GPS tracks, for runs and for rides.

A run or ride is reduced to a shape: start, end, distance and the set of ~100 m
grid cells it passes. Two are the same route when they cover mostly the same
cells and have a similar distance, wherever they start: riders and runners often start the
tracker on the bike only once out of town, at a different spot each time, and
a watch can start late on a run. Rides allow more difference in distance and in
the extra stretch of the longer one. A cluster of at least MIN_COUNT[sport]
activities becomes a route; its medoid (the member most like all others) is the
route's "average" track, the other members are its variations. Route ids carry a prefix per sport
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

START_RADIUS_M = 300.0  # combining loops into one run (tools/recommend.py): same start
LOOP_RADIUS_M = 300.0  # watch is often stopped a few hundred metres before home
MAX_DISTANCE_DIFF = 0.10
MIN_OVERLAP = 0.75  # real data: same loop with a small detour overlaps ~76%
# per sport: max relative distance difference, share of the shorter track on the longer one,
# share of the longer track on the shorter one (the longer may have an extra lead-in)
MATCH = {"run": (MAX_DISTANCE_DIFF, MIN_OVERLAP, MIN_OVERLAP), "ride": (0.30, 0.70, 0.60)}
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


def overlap(a: dict, b: dict) -> tuple[float, float]:
    """(share of the shorter track on the longer, share of the longer on the shorter)."""
    short, long_ = (a, b) if a["distance_km"] <= b["distance_km"] else (b, a)
    return _covered(short["cells"], long_["cells"]), _covered(long_["cells"], short["cells"])


def same_shape(a: dict, b: dict, sport: str = "run") -> bool:
    max_diff, min_short, min_long = MATCH.get(sport, MATCH["run"])
    longest = max(a["distance_km"], b["distance_km"])
    if longest <= 0 or abs(a["distance_km"] - b["distance_km"]) / longest > max_diff:
        return False
    s, l = overlap(a, b)
    return s >= min_short and l >= min_long


# Pairs that are not the same route by MATCH but plausibly the same circuit: ask the user.
# short: share of the shorter on the longer (a detour, shortcut or lead-in keeps this high);
# long: share of the longer on the shorter (the extra part is at most ~40% of the longer);
# near / near_diff: both shares at least `near` with a similar distance (partly other streets).
CANDIDATE = {
    "run": {"short": 0.80, "long": 0.60, "near": 0.60, "near_diff": 0.25},
    "ride": {"short": 0.75, "long": 0.60, "near": 0.50, "near_diff": 0.40},
}


CONFIDENCE_BAND = {"same": (0.80, 1.0), "candidate": (0.50, 0.79), "different": (0.0, 0.49)}


def _km(x: float) -> str:
    return f"{x:.1f}".replace(".", ",")


def compare(a: dict, b: dict, sport: str = "run") -> dict:
    """How alike two shapes are: outcome `same` (MATCH, merged automatically), `candidate` (plausibly the same
    circuit or a variant of it: ask) or `different`, a confidence in 0..1 and a reason in Dutch.

    Cells are a set, so where a loop starts and which way round it goes do not matter."""
    max_diff = MATCH.get(sport, MATCH["run"])[0]
    cand = CANDIDATE.get(sport, CANDIDATE["run"])
    da, db = a["distance_km"], b["distance_km"]
    longest = max(da, db)
    d = abs(da - db) / longest if longest > 0 else 1.0
    s, l = overlap(a, b)
    raw = (0.6 * s + 0.4 * l) * (1 - 0.5 * min(d, 1.0))
    start_far = haversine_m(a["start"], b["start"]) > START_RADIUS_M
    if same_shape(a, b, sport):
        outcome, reason = "same", "lijkt hetzelfde rondje"
    elif (s >= cand["short"] and l >= cand["long"]) or (min(s, l) >= cand["near"] and d <= cand["near_diff"]):
        outcome = "candidate"
        if s >= cand["short"] and start_far:
            reason = "zelfde rondje, ander startpunt"
        elif s >= cand["short"] and d > max_diff:
            reason = f"zelfde rondje met een extra lus of omweg ({_km(abs(da - db))} km verschil)"
        else:
            reason = "grotendeels hetzelfde rondje, deels een andere weg"
    else:
        outcome, reason = "different", "ander rondje"
    # each outcome has its own band (same >= 0.8, candidate 0.5-0.79, different < 0.5), ordered by raw likeness
    lo, hi = CONFIDENCE_BAND[outcome]
    return {"outcome": outcome, "confidence": round(lo + (hi - lo) * raw, 2), "reason": reason, "overlap": [round(s, 2), round(l, 2)], "distance_diff": round(d, 2)}


VARIANT_GAP = 0.08  # a new length variant starts where sorted distances jump by 8% ...
VARIANT_MIN_KM = {"run": 0.5, "ride": 2.0}  # ... and by at least this much


def distance_variants(members: list[dict], sport: str = "run") -> list[dict]:
    """Length variants within a route: members grouped where their sorted distances jump clearly,
    shortest first, each with its median distance, count, members and last date."""
    ordered = sorted((m for m in members if m.get("distance_km")), key=lambda m: m["distance_km"])
    groups: list[list[dict]] = []
    min_km = VARIANT_MIN_KM.get(sport, VARIANT_MIN_KM["run"])
    for m in ordered:
        prev = groups[-1][-1]["distance_km"] if groups else None
        if prev is None or (m["distance_km"] - prev > min_km and m["distance_km"] > prev * (1 + VARIANT_GAP)):
            groups.append([m])
        else:
            groups[-1].append(m)
    return [
        {
            "distance_km": round(median(m["distance_km"] for m in g), 1),
            "runs": len(g),
            "activity_ids": [m["activity_id"] for m in sorted(g, key=lambda m: m["date"])],
            "last_run": max(m["date"] for m in g),
        }
        for g in groups
    ]


def same_route(a: dict, b: dict, sport: str = "run") -> bool:
    sa, sb = shape(a), shape(b)
    return sa is not None and sb is not None and same_shape(sa, sb, sport)


def _medoid(shapes: list[dict]) -> int:
    """Index of the member most like all others (highest summed overlap): the route's "average" track."""
    if len(shapes) <= 2:
        return len(shapes) - 1  # with two, the latest
    return max(range(len(shapes)), key=lambda i: (sum(min(overlap(shapes[i], o)) for j, o in enumerate(shapes) if j != i), i))


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

    # a track joins the cluster where it matches most members, and at least half of them, so one odd
    # member cannot chain two different routes together
    clusters: list[tuple[list[dict], list[dict]]] = []  # (shapes, runs)
    for run in sorted(runs, key=lambda r: r["date"]):
        s = shape(run)
        if s is None:
            continue
        best, best_hits = None, 0
        for shapes, members in clusters:
            hits = sum(same_shape(o, s, sport) for o in shapes)
            if hits * 2 >= len(shapes) and hits > best_hits:
                best, best_hits = (shapes, members), hits
        if best:
            best[0].append(s)
            best[1].append(run)
        else:
            clusters.append(([s], [run]))

    unmatched = [r for r in existing if r.get("sport", "run") == sport]
    next_n = _next_number({r["id"] for r in existing}, prefix)

    routes = []
    for shapes, members in clusters:
        if len(members) < min_runs:
            continue
        m = _medoid(shapes)
        rep, medoid = shapes[m], members[m]
        match = next((r for r in unmatched if same_shape(_stored_shape(r), rep, sport)), None)
        if match:
            unmatched.remove(match)
            route_id = match["id"]
            name = None if DEFAULT_NAME.match(match["name"]) else match["name"]  # keep only names the user gave
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
                "medoid_id": medoid["activity_id"],
                "cells": sorted([list(c) for c in rep["cells"]]),
            }
        )
    return sorted(routes, key=lambda r: (-r["runs"], r["id"]))
