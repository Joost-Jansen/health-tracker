"""Heart rate through one day and night (GET /api/heartrate, MCP get_heart_rate): Garmin's intraday values from the
evening before through the day, the sleep window and stages, that day's resting HR against the user's normal, and a
summary of the night (lowest, average, the last two hours of sleep against the rest), so a rise before waking shows
as numbers and not only as a line.

Times are minutes after local midnight of the day; the evening before is negative (tools/store.py heart_rate_from_garmin).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Callable

from fastapi import APIRouter, Depends

from api.dashboard import resting_hr
from api.errors import ApiError
from api.readiness import baseline
from tools import db
from tools.store import SLEEP_STAGES

LAST_HOURS_MIN = 120  # "the last two hours of sleep"
MIN_NIGHT_MIN = 180  # a night summary only for a sleep of 3 h or more
MIN_COVERAGE = 0.5  # ... with values for at least half of it (Garmin gives one about every 2 minutes)
EVENING_MARGIN_MIN = 60  # the chart starts this long before falling asleep, on a whole hour
BASELINE_DAYS = 60  # normal resting HR: the median of the 60 days before, as on Today (api/readiness.py)


def _avg(values: list[int]) -> int | None:
    return round(sum(values) / len(values)) if values else None


def night_summary(points: list[list[int]], sleep: dict | None) -> dict | None:
    """{lowest, lowest_at, avg, last_avg, before_avg, rise, minutes} over the sleep window, or None when the night is
    too short or has too few values. `last_avg` is the last two hours of sleep, `before_avg` the rest, `rise` the
    difference: a few beats is normal, a clear rise is the pre-wake rise this is meant to show."""
    if not sleep:
        return None
    start, end = sleep["start"], sleep["end"]
    if end - start < MIN_NIGHT_MIN:
        return None
    inside = [(m, v) for m, v in points if start <= m <= end]
    if len(inside) < MIN_COVERAGE * (end - start) / 2:
        return None
    split = end - LAST_HOURS_MIN
    last = [v for m, v in inside if m >= split]
    before = [v for m, v in inside if m < split]
    low_at, low = min(inside, key=lambda p: (p[1], p[0]))
    last_avg, before_avg = _avg(last), _avg(before)
    return {
        "lowest": low,
        "lowest_at": low_at,
        "avg": _avg([v for _, v in inside]),
        "last_avg": last_avg,
        "before_avg": before_avg,
        "rise": last_avg - before_avg if last_avg is not None and before_avg is not None else None,
        "minutes": end - start,
    }


def normal_resting_hr(wellness: dict, day: date, fallback: float | None = None) -> float | None:
    """The 60-day median before `day` (as readiness uses it); with too little history the median of everything, else
    what the user entered. None without any of these: no reference line rather than a population guess."""
    base = baseline(wellness, "resting_hr", day, BASELINE_DAYS)
    if base is None and any(w.get("resting_hr") for w in wellness.values()):
        base = resting_hr(wellness)
    return round(base, 1) if base is not None else fallback


def day_view(s: db.Scope, wellness: dict, day: date | None, rhr_fallback: float | None = None, today: date | None = None) -> dict:
    """Everything the heart-rate page needs for one day. Without `day`: the latest day with data (else today)."""
    days = db.heart_rate_days(s)
    if day is None:
        day = date.fromisoformat(days[-1]) if days else (today or date.today())
    iso = day.isoformat()
    row = db.get_heart_rate(s, iso) or {}
    before = db.get_heart_rate(s, (day - timedelta(days=1)).isoformat()) or {}
    after = db.get_heart_rate(s, (day + timedelta(days=1)).isoformat()) or {}

    sleep = row.get("sleep")
    start = 0
    if sleep and sleep["start"] < 0:  # fell asleep before midnight: show the evening from an hour before
        start = (sleep["start"] - EVENING_MARGIN_MIN) // 60 * 60
    points = [[m - 1440, v] for m, v in before.get("hr") or [] if m - 1440 >= start] + [[m, v] for m, v in row.get("hr") or [] if m <= 1440]
    # the next night, when it began before this day's midnight: shaded at the right edge
    next_sleep = (after.get("sleep") or {}).get("start")
    out_sleep = None
    if sleep:
        stages = [{"start": a, "end": b, "stage": SLEEP_STAGES[lvl]} for a, b, lvl in sleep.get("stages") or [] if lvl in SLEEP_STAGES]
        out_sleep = {"start": sleep["start"], "end": sleep["end"], "stages": stages}

    end = 1440
    if today is not None and day >= today and row.get("hr"):  # today: up to the last reading, not an empty evening
        end = min(1440, (row["hr"][-1][0] // 60 + 1) * 60)
    night = wellness.get(iso) or {}
    values = [v for m, v in points if m >= 0]  # the day itself, 0:00-24:00
    return {
        "day": iso,
        "prev": next((d for d in reversed(days) if d < iso), None),
        "next": next((d for d in days if d > iso), None),
        "latest": days[-1] if days else None,
        "from": start,
        "to": end,
        "points": points,
        "sleep": out_sleep,
        "next_sleep_start": 1440 + next_sleep if next_sleep is not None and next_sleep < 0 else None,
        "resting_hr": night.get("resting_hr") or row.get("resting"),
        "normal_resting_hr": normal_resting_hr(wellness, day, rhr_fallback),
        "min": min(values) if values else None,
        "max": max(values) if values else None,
        "night": night_summary(points, sleep),
    }


def clock(minute: int) -> str:
    """Minute after midnight (negative: the evening before) as 23:40."""
    m = minute % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


STAGE_NL = {"deep": "diep", "light": "licht", "rem": "REM", "awake": "wakker"}


def as_markdown(v: dict, block_min: int = 30) -> str:
    """For AI assistants (MCP get_heart_rate), in Dutch: the night in numbers and a table per half hour."""
    if not v["points"]:
        return f"Geen hartslag per dag van {v['day']} (horloge niet gedragen, nog niet gesynchroniseerd of geen Garmin)." + (
            f" Laatste dag met data: {v['latest']}." if v.get("latest") else ""
        )
    lines = [f"# Hartslag {v['day']}", ""]
    facts = []
    if v["resting_hr"]:
        facts.append(f"rusthartslag {v['resting_hr']} bpm")
    if v["normal_resting_hr"]:
        facts.append(f"normaal (mediaan 60 dagen) {v['normal_resting_hr']:.0f} bpm")
    facts.append(f"laagste {v['min']}, hoogste {v['max']} bpm tussen 0 en 24 uur" if v["min"] is not None else "")
    lines.append("; ".join(f for f in facts if f) + ".")
    sleep, n = v["sleep"], v["night"]
    if sleep:
        lines.append(f"Slaap {clock(sleep['start'])}-{clock(sleep['end'])} ({(sleep['end'] - sleep['start']) / 60:.1f} u).")
    if n:
        lines.append(
            f"Nacht: laagste {n['lowest']} bpm om {clock(n['lowest_at'])}, gemiddeld {n['avg']}; "
            f"laatste 2 uur slaap gemiddeld {n['last_avg']} tegen {n['before_avg']} daarvoor ({n['rise']:+d})."
        )
    lines += ["", "| Tijd | Gem | Min | Max | Slaapfase |", "|---|---|---|---|---|"]
    stages = (sleep or {}).get("stages") or []
    blocks: dict[int, list[int]] = {}
    for m, bpm in v["points"]:
        blocks.setdefault(m // block_min * block_min, []).append(bpm)
    for b in sorted(blocks):
        vals = blocks[b]
        # the stage that covers most of this block
        cover: dict[str, int] = {}
        for st in stages:
            overlap = min(st["end"], b + block_min) - max(st["start"], b)
            if overlap > 0:
                cover[st["stage"]] = cover.get(st["stage"], 0) + overlap
        stage = STAGE_NL[max(cover, key=cover.get)] if cover else ""
        lines.append(f"| {clock(b)} | {round(sum(vals) / len(vals))} | {min(vals)} | {max(vals)} | {stage} |")
    return "\n".join(lines)


def make_router(today: Callable[[], date], current_user: Callable) -> APIRouter:
    r = APIRouter()

    @r.get("/api/heartrate")
    def heartrate(day: str | None = None, u=Depends(current_user)):
        try:
            when = date.fromisoformat(day) if day else None
        except ValueError:
            raise ApiError(422, "invalid_date", date=day) from None
        return day_view(u.scope, u.store.wellness, when, u.store.rhr_fallback, today())

    return r
