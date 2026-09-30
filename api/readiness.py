"""Klaar voor training? A plain verdict from last night's recovery against Joost's own baseline, plus form.

Signals: resting HR above its 60-day median, short sleep, low Body Battery, very negative form (TSB).
Not medical advice; the dashboard says so.
"""

from __future__ import annotations

from datetime import date, timedelta
from statistics import median

MAX_AGE_DAYS = 1  # older recovery data says little about today


def _baseline(wellness: dict, key: str, today: date, days: int) -> float | None:
    values = [w[key] for d, w in wellness.items() if w.get(key) and today - timedelta(days=days) <= date.fromisoformat(d) < today]
    return median(values) if len(values) >= 7 else None


def readiness(wellness: dict, today: date, tsb: float | None = None) -> dict | None:
    days = sorted((d for d, w in wellness.items() if date.fromisoformat(d) <= today and (w.get("resting_hr") or w.get("sleep_h"))), reverse=True)
    latest = days[0] if days and (today - date.fromisoformat(days[0])).days <= MAX_AGE_DAYS else None
    signals = []
    if latest:
        w = wellness[latest]
        base_rhr = _baseline(wellness, "resting_hr", date.fromisoformat(latest), 60)
        if w.get("resting_hr") and base_rhr:
            delta = w["resting_hr"] - base_rhr
            level = "warn" if delta >= 5 else "attention" if delta >= 3 else "ok"
            signals.append({"key": "resting_hr", "label": "Rusthartslag", "value": f"{w['resting_hr']} bpm", "note": f"{delta:+.0f} t.o.v. normaal ({base_rhr:.0f})", "level": level})
        if w.get("sleep_h"):
            base_sleep = _baseline(wellness, "sleep_h", date.fromisoformat(latest), 30)
            h = w["sleep_h"]
            level = "warn" if h < 5 else "attention" if h < 6 or (base_sleep and h < base_sleep - 1.25) else "ok"
            note = f"normaal {base_sleep:.1f} u".replace(".", ",") if base_sleep else ""
            if w.get("sleep_score"):
                note = f"score {w['sleep_score']}" + (f", {note}" if note else "")
            signals.append({"key": "sleep_h", "label": "Slaap", "value": f"{h:.1f} u".replace(".", ","), "note": note, "level": level})
    bb = (wellness.get(today.isoformat()) or {}).get("body_battery_high") or ((wellness.get(latest) or {}).get("body_battery_high") if latest else None)
    if bb:
        signals.append({"key": "body_battery", "label": "Body Battery", "value": str(bb), "note": "hoogste vandaag", "level": "attention" if bb < 40 else "ok"})
    if tsb is not None:
        signals.append({"key": "tsb", "label": "Vorm", "value": f"{tsb:+.0f}", "note": "fitheid min vermoeidheid", "level": "warn" if tsb < -30 else "attention" if tsb < -20 else "ok"})
    if not signals:
        return None

    warns = sum(s["level"] == "warn" for s in signals)
    attention = sum(s["level"] == "attention" for s in signals)
    if warns >= 2 or (warns and attention):
        verdict, text = "herstel", "Meerdere signalen van vermoeidheid. Maak er een rustdag of heel rustige training van."
    elif warns or attention:
        verdict, text = "rustig aan", "Eén of twee signalen wijken af. Train gerust, maar houd het rustig (Z1-Z2) of kort."
    elif latest:
        verdict, text = "klaar", "Herstel ziet er normaal uit. Geplande training kan zoals bedoeld."
    else:
        verdict, text = "onbekend", "Vorm en Body Battery zijn in orde, maar zonder nachtdata is herstel niet goed te beoordelen. Luister naar je lijf."
    if not latest:
        text += " Geen slaap- of rusthartslagdata van afgelopen nacht (horloge niet gedragen, of nog niet gesynct)."
    return {"verdict": verdict, "text": text, "date": latest, "signals": signals}
