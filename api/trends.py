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
RACE_MIN_KM = 5.0
RACE_HARD_SHARE = 0.85  # share of HR time in Z4-Z5: a sustained all-out effort, not a tempo run
RIEGEL = 1.06
PREDICT_KM = {"5k": 5.0, "10k": 10.0, "21k": 21.0975, "42k": 42.195}
SPLIT_KM = {"fastestSplit_5000": 5.0, "fastestSplit_10000": 10.0, "fastestSplit_21098": 21.0975}
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


def _hard_share(a: dict) -> float:
    z = a.get("hr_zones_s") or {}
    total = sum(z.values())
    return (z.get("Z4", 0) + z.get("Z5", 0)) / total if total else 0.0


def races(activities: list[dict]) -> list[dict]:
    """Triathlon days (swim, ride and run on one day), activities named like a race, and runs of 5 km or more
    with at least 85% of the time in Z4-Z5 (a race or time trial, even when Garmin calls it "Running")."""
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
            named = any(w in name for w in RACE_WORDS)
            hard = a["sport"] == "run" and (a.get("distance_km") or 0) >= RACE_MIN_KM and _hard_share(a) >= RACE_HARD_SHARE
            if named or hard:
                out.append(
                    {
                        "date": day,
                        "name": a.get("name") if named else f"Wedstrijd of test ({a.get('name') or 'run'})",
                        "detected": "naam" if named else "hartslag",
                        "sport": a["sport"],
                        "seconds": a.get("moving_time_s"),
                        "distance_km": a.get("distance_km"),
                        "activity_ids": [a["id"]],
                    }
                )
    return out


def riegel(seconds: float, km: float, target_km: float) -> float:
    return seconds * (target_km / km) ** RIEGEL


def efforts(activities: list[dict], since: str) -> list[dict]:
    """Best efforts to predict from: Garmin's fastest splits in every run, plus whole runs that were races."""
    race_ids = {i for r in races(activities) if r["sport"] == "run" for i in r["activity_ids"]}
    out = []
    for a in standalone_runs(activities):  # a run after swimming or cycling says little about a standalone race
        if a["start_local"][:10] < since:
            continue
        raw = _raw(a)
        for field, km in SPLIT_KM.items():
            if raw.get(field):
                out.append({"date": a["start_local"][:10], "km": km, "seconds": raw[field], "activity_id": a["id"], "source": "split"})
        if a["id"] in race_ids and a.get("moving_time_s"):
            out.append({"date": a["start_local"][:10], "km": a["distance_km"], "seconds": a["moving_time_s"], "activity_id": a["id"], "source": "wedstrijd"})
    return out


def predictions(activities: list[dict], today: date, days: int = 180) -> dict:
    """Race time per distance with Riegel (T2 = T1 x (D2/D1)^1.06), from the effort over the longest distance
    in the last `days` days (longer efforts predict a marathon far better than a fast kilometre). Riegel is
    optimistic for the marathon without enough long runs; the page says so."""
    pool = efforts(activities, (today - timedelta(days=days)).isoformat())
    out = {}
    for key, km in PREDICT_KM.items():
        usable = [e for e in pool if e["km"] >= min(km, 5.0) * 0.99] or pool
        if not usable:
            continue
        longest = max(e["km"] for e in usable if e["km"] <= km * 1.01) if any(e["km"] <= km * 1.01 for e in usable) else min(e["km"] for e in usable)
        base = min((e for e in usable if abs(e["km"] - longest) < 0.3), key=lambda e: riegel(e["seconds"], e["km"], km))
        secs = riegel(base["seconds"], base["km"], km)
        out[key] = {"seconds": round(secs), "pace_s_per_km": round(secs / km), "from": base}
    return out


def insights(form: list[dict], weekly: list[dict], activities: list[dict], today: date) -> list[dict]:
    """Short, data-backed remarks about load and intensity. Each: level (goed|let_op|info), title, text."""
    out = []
    if len(form) >= 8:
        now, week_ago = form[-1], form[-8]
        ramp = now["ctl"] - week_ago["ctl"]
        acwr = now["atl"] / now["ctl"] if now["ctl"] else None
        if acwr and acwr > 1.5:
            out.append({"level": "let_op", "title": "Belasting loopt snel op", "text": f"Vermoeidheid (ATL {now['atl']:.0f}) is {acwr:.1f}x je fitheid (CTL {now['ctl']:.0f}). Boven 1,5 stijgt het blessurerisico; plan een rustiger dag."})
        elif ramp > 6:
            out.append({"level": "let_op", "title": "Snelle opbouw", "text": f"Fitheid +{ramp:.1f} in 7 dagen. Meer dan ~5-7 per week houdt je lichaam lastig bij."})
        elif now["tsb"] > 15:
            out.append({"level": "info", "title": "Fris", "text": f"Vorm +{now['tsb']:.0f}: goed moment voor een wedstrijd of een zware sessie."})
    four = [a for a in activities if a["sport"] == "run" and a["start_local"][:10] > (today - timedelta(days=28)).isoformat()]
    secs = {z: sum((a.get("hr_zones_s") or {}).get(z, 0) for a in four) for z in ("Z1", "Z2", "Z3", "Z4", "Z5")}
    total = sum(secs.values())
    if total > 3600:
        easy = (secs["Z1"] + secs["Z2"]) / total * 100
        grey = secs["Z3"] / total * 100
        level = "goed" if easy >= 75 else "let_op"
        out.append({"level": level, "title": f"{easy:.0f}% rustig (Z1-Z2) de laatste 4 weken", "text": f"Z3 {grey:.0f}%, Z4-Z5 {100 - easy - grey:.0f}%. Voor marathonopbouw is ~80% rustig de gangbare richtlijn." + ("" if easy >= 75 else " Wedstrijden tellen mee; zonder wedstrijd hoort het grootste deel in Z1-Z2 te liggen.")})
    if four:
        longest = max(four, key=lambda a: a.get("distance_km") or 0)
        km = longest.get("distance_km") or 0
        out.append({"level": "goed" if km >= 28 else "info", "title": f"Langste run laatste 4 weken: {km:.1f} km", "text": "Marathonvoorbereiding: bouw de lange duurloop op naar 30-32 km, 3-5 weken voor de wedstrijd." if km < 28 else "Lange duurloop op marathonniveau."})
    if len(weekly) >= 5:
        last = [sum(v["km"] for s, v in w["sports"].items() if s == "run") for w in weekly[-5:-1]]
        cur = sum(v["km"] for s, v in weekly[-1]["sports"].items() if s == "run")
        avg = sum(last) / 4
        if avg:
            out.append({"level": "info", "title": f"Loopvolume {avg:.0f} km/week (gem. 4 weken)", "text": f"Deze week tot nu {cur:.0f} km."})
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
        "predictions": predictions(activities, today),
        "insights": insights(form, weekly_volume(activities), activities, today),
    }
