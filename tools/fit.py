"""Read per-second streams (GPS, heart rate, speed, ...) from a Garmin FIT download."""

from __future__ import annotations

import io
import zipfile

DEG_PER_SEMICIRCLE = 180 / 2**31
# stream name -> FIT fields, first one present wins
FIELDS = {
    "heartrate": ("heart_rate",),
    "velocity": ("enhanced_speed", "speed"),
    "altitude": ("enhanced_altitude", "altitude"),
    "cadence": ("cadence",),
    "distance": ("distance",),
    "watts": ("power",),
}


def streams_from_records(records) -> dict:
    """Streams aligned on `time`; `latlng` only holds the records that have a position."""
    records = [r for r in records if r.get("timestamp") is not None]
    if not records:
        return {}
    t0 = records[0]["timestamp"]
    streams: dict[str, list] = {"time": [round((r["timestamp"] - t0).total_seconds()) for r in records]}
    for name, keys in FIELDS.items():
        values = [next((r[k] for k in keys if r.get(k) is not None), None) for r in records]
        if any(v is not None for v in values):
            streams[name] = values
    track = [
        [round(r["position_lat"] * DEG_PER_SEMICIRCLE, 5), round(r["position_long"] * DEG_PER_SEMICIRCLE, 5)]
        for r in records
        if r.get("position_lat") is not None and r.get("position_long") is not None
    ]
    if track:
        streams["latlng"] = track
    return streams


def read_fit_streams(data: bytes) -> dict:
    """Streams from the zip Garmin returns for an ORIGINAL download (or a bare .fit)."""
    import fitdecode

    if data[:2] == b"PK":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names = [n for n in z.namelist() if n.lower().endswith(".fit")]
                if not names:
                    raise ValueError("no .fit file in Garmin download")
                data = z.read(names[0])
        except zipfile.BadZipFile as err:
            raise ValueError(f"unreadable Garmin download: {err}") from err

    records = []
    try:
        with fitdecode.FitReader(io.BytesIO(data)) as reader:
            for frame in reader:
                if frame.frame_type == fitdecode.FIT_FRAME_DATA and frame.name == "record":
                    records.append({f.name: f.value for f in frame.fields})
    except fitdecode.FitError as err:
        raise ValueError(f"unreadable FIT file: {err}") from err
    return streams_from_records(records)
