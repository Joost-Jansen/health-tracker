"""Normalise Garmin and Strava data and store it as one JSON file per activity / per day.

Layout:
    data/activities/YYYY/YYYY-MM-DD_HHMM_<sport>.json   one activity, merged from all sources
    data/wellness/YYYY/YYYY-MM-DD.json                  sleep, HRV, resting HR, Body Battery, readiness
    data/raw/fit/YYYY/<garmin id>.zip                   original Garmin FIT download
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path

MATCH_WINDOW_S = 120
# Which source wins for a scalar field when both have it; default is garmin first.
FIELD_PRIORITY = {"name": ("strava", "garmin")}
DEFAULT_PRIORITY = ("garmin", "strava")
SCALAR_FIELDS = (
    "name",
    "distance_km",
    "moving_time_s",
    "elapsed_time_s",
    "elevation_gain_m",
    "avg_hr",
    "max_hr",
    "avg_cadence_spm",
)

STRAVA_SPORTS = {
    "Run": "run", "TrailRun": "run", "VirtualRun": "run",
    "Ride": "ride", "VirtualRide": "ride", "GravelRide": "ride", "MountainBikeRide": "ride", "EBikeRide": "ride",
    "Swim": "swim",
}
GARMIN_SPORTS = {
    "running": "run", "trail_running": "run", "treadmill_running": "run", "track_running": "run", "virtual_run": "run",
    "cycling": "ride", "road_biking": "ride", "indoor_cycling": "ride", "virtual_ride": "ride",
    "gravel_cycling": "ride", "mountain_biking": "ride",
    "lap_swimming": "swim", "open_water_swimming": "swim", "swimming": "swim",
}
STRAVA_STREAM_KEYS = {
    "time": "time", "latlng": "latlng", "heartrate": "heartrate", "velocity_smooth": "velocity",
    "altitude": "altitude", "cadence": "cadence", "distance": "distance", "watts": "watts",
}


def _round(value, digits=0):
    if value is None:
        return None
    return round(value) if digits == 0 else round(value, digits)


def _pace(seconds: float, km: float) -> str | None:
    if not km:
        return None
    total = round(seconds / km)
    return f"{total // 60}:{total % 60:02d}"


def _drop_none(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def from_strava(activity: dict, streams: dict | None) -> dict:
    sport = STRAVA_SPORTS.get(activity.get("sport_type") or activity.get("type"), (activity.get("sport_type") or "other").lower())
    cadence = activity.get("average_cadence")
    if cadence is not None and sport == "run":
        cadence *= 2
    record = {
        "start_utc": activity["start_date"],
        "start_local": activity["start_date_local"].rstrip("Z"),
        "sport": sport,
        "name": activity.get("name"),
        "distance_km": _round(activity.get("distance", 0) / 1000, 2),
        "moving_time_s": activity.get("moving_time"),
        "elapsed_time_s": activity.get("elapsed_time"),
        "elevation_gain_m": activity.get("total_elevation_gain"),
        "avg_hr": _round(activity.get("average_heartrate")),
        "max_hr": _round(activity.get("max_heartrate")),
        "avg_cadence_spm": _round(cadence),
        "sources": {"strava": {"id": activity["id"], "raw": activity}},
    }
    if streams:
        record["streams"] = {
            ours: streams[theirs]["data"] for theirs, ours in STRAVA_STREAM_KEYS.items() if theirs in streams
        }
    return _drop_none(record)


def from_garmin(activity: dict, splits: dict | None, fit_file: str | None = None, streams: dict | None = None) -> dict:
    type_key = (activity.get("activityType") or {}).get("typeKey", "other")
    laps = []
    for lap in (splits or {}).get("lapDTOs", []):
        km = (lap.get("distance") or 0) / 1000
        laps.append(
            _drop_none(
                {
                    "distance_km": _round(km, 2),
                    "time_s": _round(lap.get("duration")),
                    "avg_hr": _round(lap.get("averageHR")),
                    "pace": _pace(lap.get("duration") or 0, km),
                    "elevation_gain_m": lap.get("elevationGain"),
                }
            )
        )
    cadence = activity.get("averageRunningCadenceInStepsPerMinute") or activity.get("averageBikingCadenceInRevPerMinute")
    record = {
        "start_utc": activity["startTimeGMT"].replace(" ", "T") + "Z",
        "start_local": activity["startTimeLocal"].replace(" ", "T"),
        "sport": GARMIN_SPORTS.get(type_key, type_key),
        "name": activity.get("activityName"),
        "distance_km": _round((activity.get("distance") or 0) / 1000, 2),
        "moving_time_s": _round(activity.get("movingDuration") or activity.get("duration")),
        "elapsed_time_s": _round(activity.get("elapsedDuration") or activity.get("duration")),
        "elevation_gain_m": activity.get("elevationGain"),
        "avg_hr": _round(activity.get("averageHR")),
        "max_hr": _round(activity.get("maxHR")),
        "avg_cadence_spm": _round(cadence),
        "laps": laps or None,
        "fit_file": fit_file,
        "streams": streams or None,
        "sources": {"garmin": {"id": activity["activityId"], "raw": activity}},
    }
    return _drop_none(record)


def _parse_utc(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _activities_dir(root: Path) -> Path:
    return Path(root) / "data" / "activities"


def _find_match(root: Path, record: dict) -> Path | None:
    start = _parse_utc(record["start_utc"])
    day = date.fromisoformat(record["start_local"][:10])
    for offset in (0, -1, 1):
        d = day + timedelta(days=offset)
        for path in _activities_dir(root).glob(f"{d.year}/{d.isoformat()}_*.json"):
            existing = json.loads(path.read_text())
            if abs((_parse_utc(existing["start_utc"]) - start).total_seconds()) <= MATCH_WINDOW_S:
                return path
    return None


def _merge(existing: dict, incoming: dict) -> dict:
    """Keep non-scalar data (streams, laps, fit_file) from whoever has it; pick scalars by source priority."""
    sources = {**existing.get("sources", {}), **incoming["sources"]}
    merged = {k: v for k, v in existing.items() if k not in SCALAR_FIELDS}
    merged.update({k: v for k, v in incoming.items() if k not in SCALAR_FIELDS})
    merged["sources"] = sources
    for key in SCALAR_FIELDS:
        for src in FIELD_PRIORITY.get(key, DEFAULT_PRIORITY):
            value = sources.get(src, {}).get("fields", {}).get(key)
            if value is not None:
                merged[key] = value
                break
    return merged


def upsert_activity(root: Path, record: dict) -> Path:
    """Write the record, merging with an existing file for the same activity (±2 min)."""
    (src,) = record["sources"]
    record = dict(record)
    record["sources"] = {src: dict(record["sources"][src], fields={k: record[k] for k in SCALAR_FIELDS if k in record})}

    path = _find_match(root, record)
    if path is None:
        stamp = record["start_local"][:16].replace("T", "_").replace(":", "")
        path = _activities_dir(root) / record["start_local"][:4] / f"{stamp}_{record['sport']}.json"
        merged = _merge({}, record)
    else:
        merged = _merge(json.loads(path.read_text()), record)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(merged, ensure_ascii=False, indent=1))
    return path


def load_activities(root: Path) -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(_activities_dir(root).glob("*/*.json"))]


def wellness_from_garmin(sleep: dict | None, hrv: dict | None, summary: dict | None, readiness: list | None) -> dict:
    sleep_dto = (sleep or {}).get("dailySleepDTO") or {}
    hrv_sum = (hrv or {}).get("hrvSummary") or {}
    summary = summary or {}
    ready = (readiness or [{}])[0] if readiness else {}

    def hours(seconds):
        return round(seconds / 3600, 2) if seconds else None

    has_sleep = bool(sleep_dto.get("sleepTimeSeconds"))
    values = _drop_none(
        {
            "sleep_h": hours(sleep_dto.get("sleepTimeSeconds")),
            "deep_sleep_h": hours(sleep_dto.get("deepSleepSeconds")),
            "rem_sleep_h": hours(sleep_dto.get("remSleepSeconds")),
            "sleep_score": ((sleep_dto.get("sleepScores") or {}).get("overall") or {}).get("value"),
            "hrv_last_night": hrv_sum.get("lastNightAvg"),
            "hrv_weekly_avg": hrv_sum.get("weeklyAvg"),
            "hrv_status": hrv_sum.get("status"),
            # without an overnight recording Garmin estimates resting HR from daytime data, which is unreliable
            "resting_hr": summary.get("restingHeartRate") if has_sleep else None,
            "body_battery_high": summary.get("bodyBatteryHighestValue"),
            "body_battery_low": summary.get("bodyBatteryLowestValue"),
            "stress_avg": summary.get("averageStressLevel"),
            "steps": summary.get("totalSteps"),
            "readiness_score": ready.get("score"),
            "readiness_level": ready.get("level"),
        }
    )
    # Garmin uses negative numbers (e.g. stress -1) for "no data"
    return {k: v for k, v in values.items() if not (isinstance(v, (int, float)) and v < 0)}


def _wellness_dir(root: Path) -> Path:
    return Path(root) / "data" / "wellness"


def write_wellness(root: Path, day: str, values: dict) -> Path:
    """Replace the day: Garmin is the only source, and a refetch must drop values newer cleaning rules reject."""
    path = _wellness_dir(root) / day[:4] / f"{day}.json"
    if not values:
        path.unlink(missing_ok=True)
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(values, ensure_ascii=False, indent=1))
    return path


def load_wellness(root: Path) -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text()) for p in sorted(_wellness_dir(root).glob("*/*.json"))}
