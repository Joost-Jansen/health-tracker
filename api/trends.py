"""Trends: form (CTL/ATL/TSB), weekly volume per sport, Z2 running pace, VO2max, recovery, records and races.

Pure functions over plain data (see api/history.py): works on the file store and on tools/db.py.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from statistics import mean
from typing import Callable

from api.dashboard import max_by_sport, resting_hr
from tools.analytics import fitness_series

StreamsFn = Callable[[str], "dict | None"]

RECORD_SPLITS = {"1k": "fastestSplit_1000", "5k": "fastestSplit_5000", "10k": "fastestSplit_10000", "21k": "fastestSplit_21098"}
RACE_WORDS = ("race", "wedstrijd", "marathon", "triathlon", "benchmark", "loop van", "run van")
MIN_Z2_SECONDS = 300  # a run needs at least 5 minutes in Z2 to count for the Z2 pace
MIN_SPEED = 1.5  # m/s; slower is walking or standing


def week_of(day: str) -> str:
    """Monday of the ISO week, as YYYY-MM-DD."""
    d = date.fromisoformat(day[:10])
    return (d - timedelta(days=d.weekday())).isoformat()


def _raw(a: dict) -> dict:
    return ((a.get("sources") or {}).get("garmin") or {}).get("raw") or {}


def weekly_volume(activities: list[dict]) -> list[dict]:
    weeks: dict[str, dict] = defaultdict(lambda: defaultdict(lambda: {"km": 0.0, "seconds": 0, "count": 0}))
    for a in activities:
        v = weeks[week_of(a["start_local"])][a["sport"]]
        v["km"] += a.get("distance_km") or 0
        v["seconds"] += a.get("moving_time_s") or 0
        v["count"] += 1
    if not weeks:
        return []
    out, wk, last = [], date.fromisoformat(min(weeks)), date.fromisoformat(max(weeks))
    while wk <= last:  # include empty weeks so charts show the gaps
        sports = weeks.get(wk.isoformat(), {})
        out.append({"week": wk.isoformat(), "sports": {s: {**v, "km": round(v["km"], 1)} for s, v in sports.items()}})
        wk += timedelta(weeks=1)
    return out


def standalone_runs(activities: list[dict]) -> list[dict]:
    """Runs not on a day with a swim or ride before them (triathlon/brick runs are not comparable)."""
    other = defaultdict(list)
    for a in activities:
        if a["sport"] in ("swim", "ride"):
            other[a["start_local"][:10]].append(a["start_local"])
    return [a for a in activities if a["sport"] == "run" and not any(t < a["start_local"] for t in other.get(a["start_local"][:10], []))]


def z2_speed(streams: dict, bounds: list[int]) -> tuple[float, int] | None:
    """Mean speed (m/s) and seconds spent in Z2 while moving, from the streams."""
    time, hr, v = streams.get("time") or [], streams.get("heartrate") or [], streams.get("velocity") or []
    if not (len(time) == len(hr) == len(v)) or len(time) < 2:
        return None
    lo, hi = bounds[0], bounds[1]
    dist = secs = 0.0
    for i in range(len(time) - 1):
        dt = min(time[i + 1] - time[i], 30)
        if hr[i] and lo <= hr[i] < hi and v[i] and v[i] >= MIN_SPEED:
            dist += v[i] * dt
            secs += dt
    if secs < MIN_Z2_SECONDS:
        return None
    return dist / secs, int(secs)


def z2_pace(activities: list[dict], streams_fn: StreamsFn, zones: dict) -> list[dict]:
    """Weekly pace while in Z2 (standalone, outdoor runs). Falling pace at the same HR = better aerobic base."""
    bounds = (zones.get("run") or {}).get("bounds")
    if not bounds:
        return []
    weeks: dict[str, list[tuple[float, int]]] = defaultdict(list)
    for a in standalone_runs(activities):
        if "treadmill" in (a.get("name") or "").lower():
            continue
        r = z2_speed(streams_fn(a["id"]) or {}, bounds)
        if r:
            weeks[week_of(a["start_local"])].append(r)
    out = []
    for wk in sorted(weeks):
        dist = sum(v * s for v, s in weeks[wk])
        secs = sum(s for _, s in weeks[wk])
        out.append({"week": wk, "pace_s_per_km": round(1000 * secs / dist), "runs": len(weeks[wk]), "z2_seconds": secs})
    return out


def vo2max(activities: list[dict]) -> list[dict]:
    by_day = {}
    for a in sorted(activities, key=lambda a: a["start_local"]):
        value = _raw(a).get("vO2MaxValue")
        if value:
            by_day[a["start_local"][:10]] = value
    return [{"date": d, "value": v} for d, v in sorted(by_day.items())]


def recovery_weekly(wellness: dict) -> list[dict]:
    keys = ("resting_hr", "sleep_h", "body_battery_high", "stress_avg", "hrv")
    weeks: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for day, w in wellness.items():
        for k in keys:
            if w.get(k) is not None:
                weeks[week_of(day)][k].append(w[k])
    out = []
    for wk in sorted(weeks):
        row = {"week": wk}
        for k in keys:
            vals = weeks[wk].get(k)
            row[k] = round(mean(vals), 1) if vals else None
        out.append(row)
    return out


def records(activities: list[dict]) -> dict:
    """Progression of the fastest split per distance (Garmin's fastestSplit_*): every time a new best was set."""
    out = {}
    runs = sorted((a for a in activities if a["sport"] == "run"), key=lambda a: a["start_local"])
    for key, field in RECORD_SPLITS.items():
        best, rows = None, []
        for a in runs:
            secs = _raw(a).get(field)
            if secs and (best is None or secs < best):
                best = secs
                rows.append({"date": a["start_local"][:10], "seconds": round(secs), "activity_id": a["id"]})
        out[key] = rows
    return out


def races(activities: list[dict]) -> list[dict]:
    """Triathlon days (swim, ride and run on one day) and activities named like a race."""
    by_day = defaultdict(list)
    for a in activities:
        by_day[a["start_local"][:10]].append(a)
    out = []
    for day, items in sorted(by_day.items()):
        sports = {a["sport"] for a in items}
        if {"swim", "ride", "run"} <= sports:
            multi = [a for a in items if a["sport"] in ("swim", "ride", "run")]
            out.append(
                {
                    "date": day,
                    "name": "Triathlon",
                    "sport": "triathlon",
                    "seconds": sum(a.get("moving_time_s") or 0 for a in multi),
                    "distance_km": round(sum(a.get("distance_km") or 0 for a in multi), 1),
                    "activity_ids": [a["id"] for a in sorted(multi, key=lambda a: a["start_local"])],
                }
            )
            continue
        for a in items:
            name = (a.get("name") or "").lower()
            if any(w in name for w in RACE_WORDS):
                out.append(
                    {
                        "date": day,
                        "name": a.get("name"),
                        "sport": a["sport"],
                        "seconds": a.get("moving_time_s"),
                        "distance_km": a.get("distance_km"),
                        "activity_ids": [a["id"]],
                    }
                )
    return out


def build_trends(activities: list[dict], wellness: dict, zones: dict, streams_fn: StreamsFn, today: date) -> dict:
    form = fitness_series(activities, resting_hr(wellness), max_by_sport(zones), end=today)
    return {
        "today": today.isoformat(),
        "form": form,
        "weekly": weekly_volume(activities),
        "z2_pace": z2_pace(activities, streams_fn, zones),
        "vo2max": vo2max(activities),
        "recovery_weekly": recovery_weekly(wellness),
        "records": records(activities),
        "races": races(activities),
    }
