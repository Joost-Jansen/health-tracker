"""Joost's own heart-rate zones per sport (zones.json), used for every zone calculation."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAMES = ("Z1", "Z2", "Z3", "Z4", "Z5")
MAX_SAMPLE_GAP_S = 30  # larger gaps are pauses, not time at that heart rate


def load_zones(root: Path = ROOT) -> dict:
    data = json.loads((Path(root) / "zones.json").read_text())
    return {k: v for k, v in data.items() if not k.startswith("_")}


def zone_for(zones: dict, sport: str, hr: float) -> str | None:
    if sport not in zones:
        return None
    for name, lower_next in zip(NAMES, zones[sport]["bounds"]):
        if hr < lower_next:
            return name
    return NAMES[-1]


def zone_seconds(zones: dict, sport: str, heartrate: list, time: list) -> dict[str, int] | None:
    if sport not in zones:
        return None
    out = {name: 0 for name in NAMES}
    for i in range(len(heartrate) - 1):
        if heartrate[i]:
            out[zone_for(zones, sport, heartrate[i])] += min(time[i + 1] - time[i], MAX_SAMPLE_GAP_S)
    return out
