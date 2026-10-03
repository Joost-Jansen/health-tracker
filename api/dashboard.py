"""Data for the dashboard page: zones, volume, form, recent activities, recovery."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from statistics import median

from tools.analytics import fitness_series
from tools.zones import NAMES

DEFAULT_RHR = 60  # population average; used only without the user's own resting HR (sleep data or profile)
SUMMARY_FIELDS = ("id", "start_local", "sport", "name", "distance_km", "moving_time_s", "avg_hr", "max_hr", "elevation_gain_m", "hr_zones_s")


def _day(a: dict) -> date:
    return date.fromisoformat(a["start_local"][:10])


def resting_hr(wellness: dict, fallback: float | None = None) -> float:
    """Median of the user's measured resting HR; else what they entered in their profile; else a population value."""
    values = [w["resting_hr"] for w in wellness.values() if w.get("resting_hr")]
    return median(values) if values else (fallback or DEFAULT_RHR)


def max_by_sport(zones: dict, activities: list[dict] | None = None) -> dict:
    """Max HR per sport from the user's zones; for sports without zones, the highest max HR in their own activities."""
    out = {sport: z["max_hr"] for sport, z in zones.items() if isinstance(z, dict) and z.get("max_hr")}
    for a in activities or []:
        if a.get("max_hr") and a["sport"] not in zones:
            out[a["sport"]] = max(out.get(a["sport"], 0), a["max_hr"])
    return out


def form_status(tsb: float) -> str:
    if tsb > 5:
        return "fris"
    if tsb >= -10:
        return "in balans"
    if tsb >= -30:
        return "vermoeid"
    return "zeer vermoeid"


def _zone_share(activities: list[dict]) -> dict:
    per_sport: dict[str, dict[str, int]] = defaultdict(lambda: {z: 0 for z in NAMES})
    for a in activities:
        for z, secs in (a.get("hr_zones_s") or {}).items():
            per_sport[a["sport"]][z] += secs
    out = {sport: _share(secs) for sport, secs in per_sport.items() if sum(secs.values())}
    if out:
        # every sport's seconds were counted with its own zones, so the total is a plain sum
        out["all"] = _share({z: sum(v["seconds"][z] for v in out.values()) for z in NAMES})
    return out


def _share(secs: dict[str, int]) -> dict:
    total = sum(secs.values())
    return {"seconds": secs, "total_s": total, "pct": {z: round(s / total * 100, 1) for z, s in secs.items()}}


def _volume(activities: list[dict], weeks: int = 1) -> dict:
    out: dict[str, dict] = defaultdict(lambda: {"count": 0, "km": 0.0, "seconds": 0})
    for a in activities:
        v = out[a["sport"]]
        v["count"] += 1
        v["km"] += a.get("distance_km") or 0
        v["seconds"] += a.get("moving_time_s") or 0
    return {
        sport: {"count": round(v["count"] / weeks, 1) if weeks > 1 else v["count"], "km": round(v["km"] / weeks, 1), "seconds": round(v["seconds"] / weeks)}
        for sport, v in out.items()
    }


def summary(a: dict) -> dict:
    return {k: a.get(k) for k in SUMMARY_FIELDS if a.get(k) is not None}


def build_dashboard(activities: list[dict], wellness: dict, zones: dict, today: date, last_sync: str, rhr_fallback: float | None = None) -> dict:
    monday = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)
    week = [a for a in activities if monday <= _day(a) <= today]
    month = [a for a in activities if month_start <= _day(a) <= today]
    prev4 = [a for a in activities if monday - timedelta(weeks=4) <= _day(a) < monday]

    rhr = resting_hr(wellness, rhr_fallback)
    series = fitness_series(activities, rhr, max_by_sport(zones, activities), end=today)
    form = None
    if series:
        now, peak = series[-1], max(series, key=lambda r: r["ctl"])
        form = {
            "ctl": now["ctl"],
            "atl": now["atl"],
            "tsb": now["tsb"],
            "status": form_status(now["tsb"]),
            "ctl_peak": peak["ctl"],
            "ctl_peak_date": peak["date"],
            "series": series[-91:],
        }

    recent_days = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    rhr_60 = [wellness[d]["resting_hr"] for d in ((today - timedelta(days=i)).isoformat() for i in range(60)) if wellness.get(d, {}).get("resting_hr")]

    return {
        "today": today.isoformat(),
        "last_sync": last_sync,
        "zone_bounds": {sport: z["bounds"] for sport, z in zones.items()},
        "zone_estimates": sorted(sport for sport, z in zones.items() if isinstance(z, dict) and z.get("estimate")),
        "zones_set": sorted(zones),
        "zones": {"week": _zone_share(week), "month": _zone_share(month)},
        "volume": {"week": _volume(week), "avg4w": _volume(prev4, weeks=4)},
        "form": form,
        "recent": [summary(a) for a in sorted(activities, key=lambda a: a["start_local"], reverse=True)[:6]],
        "recovery": {
            "days": [dict(wellness[d], date=d) for d in recent_days if d in wellness],
            "baseline_rhr": median(rhr_60) if rhr_60 else None,
        },
        "upcoming": [],
    }
