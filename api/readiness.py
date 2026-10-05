"""Readiness ("Klaar voor training?"): a plain verdict from last night's recovery against the user's own baseline, plus form.

Signals: resting HR above its 60-day median, short sleep, low Body Battery, very negative form (TSB).
Not medical advice; the dashboard says so.

Returns codes and numbers only; the site renders them with web/lib/texts.ts (T.readiness), agents get `as_text`.
"""

from __future__ import annotations

from datetime import date, timedelta
from statistics import median

MAX_AGE_DAYS = 1  # older recovery data says little about today


def _baseline(wellness: dict, key: str, today: date, days: int) -> float | None:
    values = [w[key] for d, w in wellness.items() if w.get(key) and today - timedelta(days=days) <= date.fromisoformat(d) < today]
    return median(values) if len(values) >= 7 else None


def _note(code: str, **params) -> dict:
    return {"code": code, "params": {k: v for k, v in params.items() if v is not None}}


def readiness(wellness: dict, today: date, tsb: float | None = None) -> dict | None:
    """{verdict: klaar|rustig aan|herstel|onbekend, date: night used or None, no_night, signals: [{key, value, level, note}]}.
    `note` is {code, params}: vs_baseline {delta, baseline}, sleep {score?, baseline?}, highest {date, days_ago},
    form_yesterday {} (form is yesterday's fitness minus fatigue)."""
    days = sorted((d for d, w in wellness.items() if date.fromisoformat(d) <= today and (w.get("resting_hr") or w.get("sleep_h"))), reverse=True)
    latest = days[0] if days and (today - date.fromisoformat(days[0])).days <= MAX_AGE_DAYS else None
    signals = []
    if latest:
        w = wellness[latest]
        base_rhr = _baseline(wellness, "resting_hr", date.fromisoformat(latest), 60)
        if w.get("resting_hr") and base_rhr:
            delta = w["resting_hr"] - base_rhr
            level = "warn" if delta >= 5 else "attention" if delta >= 3 else "ok"
            signals.append({"key": "resting_hr", "value": w["resting_hr"], "note": _note("vs_baseline", delta=round(delta), baseline=round(base_rhr)), "level": level})
        if w.get("sleep_h"):
            base_sleep = _baseline(wellness, "sleep_h", date.fromisoformat(latest), 30)
            h = w["sleep_h"]
            level = "warn" if h < 5 else "attention" if h < 6 or (base_sleep and h < base_sleep - 1.25) else "ok"
            note = _note("sleep", score=w.get("sleep_score") or None, baseline=round(base_sleep, 1) if base_sleep else None)
            signals.append({"key": "sleep_h", "value": round(h, 1), "note": note, "level": level})
    bb_day = today.isoformat() if (wellness.get(today.isoformat()) or {}).get("body_battery_high") else latest
    bb = (wellness.get(bb_day) or {}).get("body_battery_high") if bb_day else None
    if bb:
        days_ago = (today - date.fromisoformat(bb_day)).days
        signals.append({"key": "body_battery", "value": bb, "note": _note("highest", date=bb_day, days_ago=days_ago), "level": "attention" if bb < 40 else "ok"})
    if tsb is not None:
        signals.append({"key": "tsb", "value": round(tsb, 1), "note": _note("form_yesterday"), "level": "warn" if tsb < -30 else "attention" if tsb < -20 else "ok"})
    if not signals:
        return None

    warns = sum(s["level"] == "warn" for s in signals)
    attention = sum(s["level"] == "attention" for s in signals)
    if warns >= 2 or (warns and attention):
        verdict = "recover"
    elif warns or attention:
        verdict = "easy"
    elif latest:
        verdict = "ready"
    else:
        verdict = "unknown"
    return {"verdict": verdict, "date": latest, "no_night": latest is None, "signals": signals}


def as_text(r: dict) -> str:
    """One line for AI assistants (MCP get_context): the verdict and every signal with its number."""
    names = {"resting_hr": "rusthartslag", "sleep_h": "slaap", "body_battery": "body battery", "tsb": "vorm"}
    units = {"resting_hr": " bpm", "sleep_h": " u"}
    parts = []
    for s in r["signals"]:
        p = s["note"]["params"]
        value = f"{s['value']:+.0f}" if s["key"] == "tsb" else f"{s['value']}{units.get(s['key'], '')}"
        detail = {
            "vs_baseline": f"{p.get('delta', 0):+d} t.o.v. mediaan {p.get('baseline')}",
            "sleep": ", ".join(x for x in (f"score {p['score']}" if p.get("score") else "", f"normaal {p['baseline']} u" if p.get("baseline") else "") if x),
            "highest": f"hoogste op {p.get('date')}",
            "form_yesterday": "fitheid min vermoeidheid van gisteren",
        }.get(s["note"]["code"], "")
        parts.append(f"{names.get(s['key'], s['key'])} {value}" + (f" ({detail})" if detail else "") + f" [{s['level']}]")
    night = f"nacht van {r['date']}" if r["date"] else "geen nachtdata van afgelopen nacht"
    verdict = {"ready": "klaar", "easy": "rustig aan", "recover": "herstel", "unknown": "onbekend"}.get(r["verdict"], r["verdict"])
    return f"{verdict} ({night}); " + "; ".join(parts)
