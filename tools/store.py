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

from tools.sports import garmin_sport, strava_sport

MATCH_WINDOW_S = 120
# Which source wins for a scalar field when both have it; default is garmin first.
FIELD_PRIORITY = {"name": ("strava", "garmin", "wahoo", "fit")}
# Uploaded FIT files (Wahoo, or any other device) come after the synced sources.
DEFAULT_PRIORITY = ("garmin", "strava", "wahoo", "fit")
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
    sport = strava_sport(activity.get("sport_type") or activity.get("type"))
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


def _elapsed_s(activity: dict) -> float | None:
    """Garmin's activity list has given `elapsedDuration` in milliseconds next to `duration` in seconds."""
    elapsed, duration = activity.get("elapsedDuration"), activity.get("duration")
    if elapsed and duration and elapsed > duration * 10:
        return elapsed / 1000
    return elapsed or duration


def garmin_summary(detail: dict) -> dict:
    """An activity from Garmin's detail endpoint (get_activity: summaryDTO, activityTypeDTO), as the activity list
    gives it, so from_garmin reads both. Multisport legs only come this way."""
    s = detail.get("summaryDTO") or {}
    clock = lambda v: v.replace("T", " ").split(".")[0] if v else v  # noqa: E731  "2021-04-11T12:36:16.0"
    return {
        **s,
        "activityId": detail["activityId"],
        "activityName": detail.get("activityName"),
        "activityType": detail.get("activityTypeDTO") or {},
        "parentId": detail.get("parentId"),
        "startTimeLocal": clock(s.get("startTimeLocal")),
        "startTimeGMT": clock(s.get("startTimeGMT")),
        "averageRunningCadenceInStepsPerMinute": s.get("averageRunCadence"),
        "averageBikingCadenceInRevPerMinute": s.get("averageBikeCadence"),
    }


def from_garmin(activity: dict, splits: dict | None, fit_file: str | None = None, streams: dict | None = None) -> dict:
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
        "sport": garmin_sport(activity.get("activityType")),
        "name": activity.get("activityName"),
        "distance_km": _round((activity.get("distance") or 0) / 1000, 2),
        "moving_time_s": _round(activity.get("movingDuration") or activity.get("duration")),
        "elapsed_time_s": _round(_elapsed_s(activity)),
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


def from_fit(activity: dict, fit_file: str | None = None, filename: str | None = None) -> dict:
    """A record from tools.fit.read_fit_activity. Source `wahoo` for a Wahoo file, else `fit`."""
    source = "wahoo" if "wahoo" in activity.get("manufacturer", "") else "fit"
    laps = []
    for lap in activity.get("laps") or []:
        km = (lap.get("distance_m") or 0) / 1000
        laps.append(_drop_none({
            "distance_km": _round(km, 2), "time_s": _round(lap.get("time_s")), "avg_hr": _round(lap.get("avg_hr")),
            "pace": _pace(lap.get("time_s") or 0, km), "elevation_gain_m": lap.get("ascent_m"),
        }))
    sport = activity["sport"]
    label = {"ride": "Cycling", "run": "Running", "swim": "Swimming"}.get(sport, sport.capitalize())
    cadence = activity.get("avg_cadence")
    if cadence is not None and sport == "run":
        cadence *= 2  # FIT stores running cadence per leg
    record = {
        "start_utc": activity["start_utc"],
        "start_local": activity["start_local"],
        "sport": sport,
        "name": f"{'Wahoo' if source == 'wahoo' else 'FIT'} {label}",  # like Garmin's "Amsterdam Cycling"
        "distance_km": _round((activity.get("distance_m") or 0) / 1000, 2),
        "moving_time_s": _round(activity.get("timer_s")),
        "elapsed_time_s": _round(activity.get("elapsed_s") or activity.get("timer_s")),
        "elevation_gain_m": activity.get("ascent_m"),
        "avg_hr": _round(activity.get("avg_hr")),
        "max_hr": _round(activity.get("max_hr")),
        "avg_cadence_spm": _round(cadence),
        "avg_power_w": _round(activity.get("avg_power")),
        "indoor": activity.get("indoor") or None,
        "laps": laps or None,
        "fit_file": fit_file,
        "streams": activity.get("streams") or None,
        "sources": {source: {"file": filename, "manufacturer": activity.get("manufacturer") or None}},
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


def delete_activity_by_source(root: Path, source: str, source_id, day: str) -> None:
    """Remove the activity file that `source` sent as `source_id`, started around `day`."""
    d = date.fromisoformat(day)
    for offset in (0, -1, 1):
        x = d + timedelta(days=offset)
        for path in _activities_dir(root).glob(f"{x.year}/{x.isoformat()}_*.json"):
            if str(json.loads(path.read_text()).get("sources", {}).get(source, {}).get("id")) == str(source_id):
                path.unlink()


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


def prepare(record: dict) -> dict:
    """Keep each source's own scalar values next to it, so a later merge can pick by source priority."""
    (src,) = record["sources"]
    record = dict(record)
    record["sources"] = {src: dict(record["sources"][src], fields={k: record[k] for k in SCALAR_FIELDS if k in record})}
    return record


def activity_id(record: dict) -> str:
    return record["start_local"][:16].replace("T", "_").replace(":", "") + "_" + record["sport"]


def same_start(a: dict, b: dict) -> bool:
    return abs((_parse_utc(a["start_utc"]) - _parse_utc(b["start_utc"])).total_seconds()) <= MATCH_WINDOW_S


def merge(existing: dict, incoming: dict) -> dict:
    return _merge(existing, incoming)


def upsert_activity(root: Path, record: dict) -> Path:
    """Write the record, merging with an existing file for the same activity (±2 min)."""
    record = prepare(record)
    path = _find_match(root, record)
    if path is None:
        path = _activities_dir(root) / record["start_local"][:4] / f"{activity_id(record)}.json"
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
