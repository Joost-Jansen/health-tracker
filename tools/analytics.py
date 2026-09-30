"""Training load: Banister TRIMP per activity, and fitness (CTL), fatigue (ATL) and form (TSB) per day."""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, timedelta

CTL_DAYS = 42
ATL_DAYS = 7


def trimp(activity: dict, rhr: float, max_by_sport: dict) -> float:
    """Banister TRIMP from average HR, with the max HR of the activity's sport (run max as fallback)."""
    hr, secs = activity.get("avg_hr"), activity.get("moving_time_s")
    if not hr or not secs:
        return 0.0
    hr_max = max_by_sport.get(activity["sport"], max_by_sport["run"])
    ratio = max(0.0, min(1.0, (hr - rhr) / (hr_max - rhr)))
    return secs / 60 * ratio * 0.64 * math.exp(1.92 * ratio)


def fitness_series(activities: list[dict], rhr: float, max_by_sport: dict, end: date) -> list[dict]:
    """One row per day from the first activity to `end`: load, ctl, atl, tsb (form = yesterday's ctl - atl)."""
    load: dict[date, float] = defaultdict(float)
    for a in activities:
        load[date.fromisoformat(a["start_local"][:10])] += trimp(a, rhr, max_by_sport)
    if not load:
        return []

    rows, ctl, atl = [], 0.0, 0.0
    day = min(load)
    while day <= end:
        tsb = ctl - atl
        x = load.get(day, 0.0)
        ctl += (x - ctl) / CTL_DAYS
        atl += (x - atl) / ATL_DAYS
        rows.append({"date": day.isoformat(), "load": round(x, 1), "ctl": round(ctl, 1), "atl": round(atl, 1), "tsb": round(tsb, 1)})
        day += timedelta(days=1)
    return rows
