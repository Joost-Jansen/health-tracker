"""Fetch new Garmin and Strava data into data/, then rebuild routes/ and summary/.

    python tools/sync.py                      # incremental, both sources
    python tools/sync.py --since 2025-06-01   # backfill
    python tools/sync.py --source strava

Credentials come only from the environment (GitHub Actions secrets):
    STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN, GARMINTOKENS
When TOKEN_OUT_DIR is set, refreshed tokens that changed are written there so the
workflow can update the secrets. Tokens are never printed or written into the repo.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools import db, store
from tools.derive import derive
from tools.fit import read_fit_streams
from tools.secretbox import decrypt, encrypt
from tools.store import from_garmin, from_strava, wellness_from_garmin

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKFILL_DAYS = 90
STRAVA_API = "https://www.strava.com/api/v3"
STRAVA_STREAM_KEYS = "time,latlng,heartrate,velocity_smooth,altitude,cadence,distance,watts"


class RateLimited(Exception):
    """The API asked us to slow down; progress so far is kept and the next run continues."""


def fetch_metric(stats: dict, name: str, fn, day: str):
    """Call one Garmin wellness endpoint; count ok / empty / errors so the log shows why a metric is missing."""
    counts = stats.setdefault(name, {})
    try:
        value = fn(day)
    except RateLimited:
        raise
    except Exception as err:  # a device may not support every metric
        key = f"fout {type(err).__name__}"
        counts[key] = counts.get(key, 0) + 1
        return None
    key = "ok" if value else "leeg"
    counts[key] = counts.get(key, 0) + 1
    return value


class FileSink:
    """Legacy target: JSON files in the repo (data/)."""

    def __init__(self, root: Path):
        self.root = Path(root)

    def upsert_activity(self, record: dict) -> str:
        return str(store.upsert_activity(self.root, record))

    def write_wellness(self, day: str, values: dict) -> None:
        store.write_wellness(self.root, day, values)

    def get_fit(self, garmin_id, year: str) -> bytes | None:
        path = self.root / self.fit_key(garmin_id, year)
        return path.read_bytes() if path.exists() else None

    def put_fit(self, garmin_id, year: str, data: bytes) -> str:
        path = self.root / self.fit_key(garmin_id, year)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return self.fit_key(garmin_id, year)

    @staticmethod
    def fit_key(garmin_id, year: str) -> str:
        return f"data/raw/fit/{year}/{garmin_id}.zip"


class DbSink:
    """Target: the training database (tools/db.py)."""

    def __init__(self, engine):
        self.engine = engine

    def upsert_activity(self, record: dict) -> str:
        return db.upsert_activity(self.engine, record)

    def write_wellness(self, day: str, values: dict) -> None:
        db.write_wellness(self.engine, day, values)

    def get_fit(self, garmin_id, year: str) -> bytes | None:
        return db.get_fit(self.engine, self.fit_key(garmin_id, year))

    def put_fit(self, garmin_id, year: str, data: bytes) -> str:
        db.put_fit(self.engine, self.fit_key(garmin_id, year), data)
        return self.fit_key(garmin_id, year)

    @staticmethod
    def fit_key(garmin_id, year: str) -> str:
        return f"garmin-{garmin_id}"


def as_sink(target):
    return FileSink(target) if isinstance(target, (str, Path)) else target


def _epoch(iso_utc: str) -> int:
    return int(datetime.fromisoformat(iso_utc.replace("Z", "+00:00")).timestamp())


def write_rotated_token(out_dir: Path | None, name: str, old: str | None, new: str | None) -> None:
    if not out_dir or not new or new == old:
        return
    path = Path(out_dir) / name
    path.write_text(new)
    path.chmod(0o600)


# --- Strava -------------------------------------------------------------------------


class StravaClient:
    def __init__(self, client_id: str, client_secret: str, refresh_token: str):
        import requests

        self._http = requests.Session()
        r = self._http.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            timeout=30,
        )
        r.raise_for_status()
        body = r.json()
        self.refresh_token = body["refresh_token"]
        self._http.headers["Authorization"] = f"Bearer {body['access_token']}"

    def _get(self, path: str, **params):
        r = self._http.get(f"{STRAVA_API}{path}", params=params, timeout=60)
        if r.status_code == 429:
            raise RateLimited("Strava rate limit")
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()

    def list_activities(self, after_epoch: int) -> list[dict]:
        out, page = [], 1
        while True:
            batch = self._get("/athlete/activities", after=after_epoch, per_page=100, page=page) or []
            out += batch
            if len(batch) < 100:
                return out
            page += 1

    def streams(self, activity_id: int) -> dict | None:
        return self._get(f"/activities/{activity_id}/streams", keys=STRAVA_STREAM_KEYS, key_by_type="true")


def sync_strava(target, client, state: dict, since: date | None = None) -> int:
    sink = as_sink(target)
    s = state.setdefault("strava", {})
    if "last_start_epoch" not in s:
        start = since or date.today() - timedelta(days=DEFAULT_BACKFILL_DAYS)
        s["last_start_epoch"] = int(datetime(start.year, start.month, start.day, tzinfo=timezone.utc).timestamp())
    elif since:
        s["last_start_epoch"] = min(s["last_start_epoch"], int(datetime(since.year, since.month, since.day, tzinfo=timezone.utc).timestamp()))

    activities = sorted(client.list_activities(s["last_start_epoch"]), key=lambda a: a["start_date"])
    for activity in activities:
        streams = client.streams(activity["id"])  # may raise RateLimited; progress so far is kept
        sink.upsert_activity(from_strava(activity, streams))
        s["last_start_epoch"] = _epoch(activity["start_date"])
    return len(activities)


# --- Garmin -------------------------------------------------------------------------


class GarminClient:
    def __init__(self, tokens: str):
        from garminconnect import Garmin

        self._Garmin = Garmin
        self.api = Garmin()
        self.api.login(tokens)
        self.stats: dict = {}

    def _call(self, fn, *args, **kwargs):
        from garminconnect import GarminConnectTooManyRequestsError

        try:
            return fn(*args, **kwargs)
        except GarminConnectTooManyRequestsError as err:
            raise RateLimited("Garmin rate limit") from err

    def activities(self, start: date, end: date) -> list[dict]:
        return self._call(self.api.get_activities_by_date, start.isoformat(), end.isoformat(), None, "asc")

    def splits(self, activity_id) -> dict:
        return self._call(self.api.get_activity_splits, str(activity_id))

    def fit(self, activity_id) -> bytes:
        return self._call(self.api.download_activity, str(activity_id), dl_fmt=self._Garmin.ActivityDownloadFormat.ORIGINAL)

    def wellness(self, day: str) -> dict:
        def get(name, fn):
            return fetch_metric(self.stats, name, lambda d: self._call(fn, d), day)

        return wellness_from_garmin(
            sleep=get("slaap", self.api.get_sleep_data),
            hrv=get("hrv", self.api.get_hrv_data),
            summary=get("dagoverzicht", self.api.get_user_summary),
            readiness=get("readiness", self.api.get_training_readiness),
        )

    def tokens(self) -> str:
        return self.api.client.dumps()


def sync_garmin(target, client, state: dict, today: date, since: date | None = None, read_streams=read_fit_streams) -> int:
    sink = as_sink(target)
    g = state.setdefault("garmin", {})
    default_start = since or today - timedelta(days=DEFAULT_BACKFILL_DAYS)

    act_start = date.fromisoformat(g["last_activity_day"]) if "last_activity_day" in g else default_start
    if since:
        act_start = min(act_start, since)
    count = 0
    for activity in sorted(client.activities(act_start, today), key=lambda a: a["startTimeLocal"]):
        activity_id = activity["activityId"]
        year = activity["startTimeLocal"][:4]
        fit = sink.get_fit(activity_id, year)
        if fit is None:
            fit = client.fit(activity_id)
            sink.put_fit(activity_id, year, fit)
        fit_rel = sink.fit_key(activity_id, year)
        try:
            streams = read_streams(fit)
        except ValueError as err:
            print(f"garmin: geen streams voor {activity_id} ({err})")
            streams = None
        sink.upsert_activity(from_garmin(activity, client.splits(activity_id), fit_file=fit_rel, streams=streams))
        g["last_activity_day"] = activity["startTimeLocal"][:10]
        count += 1
    g["last_activity_day"] = today.isoformat()

    well_start = date.fromisoformat(g["last_wellness_day"]) if "last_wellness_day" in g else default_start
    if since:
        well_start = min(well_start, since)
    day = well_start
    while day <= today:
        sink.write_wellness(day.isoformat(), client.wellness(day.isoformat()))
        g["last_wellness_day"] = day.isoformat()
        day += timedelta(days=1)
    return count


# --- database mode (Railway cron) ----------------------------------------------------


def run_db_sync(engine, key: str, env_tokens: str | None, client_factory=None, today: date | None = None,
                read_streams=read_fit_streams, since: date | None = None) -> int:
    """Garmin -> database, then derived data. Tokens: the encrypted copy in the database wins over GARMINTOKENS,
    because Garmin rotates the refresh token and only the database copy is kept up to date."""
    client_factory = client_factory or GarminClient
    tz = ZoneInfo("Europe/Amsterdam")
    today = today or datetime.now(tz).date()
    state = db.get_setting(engine, "sync_state") or {}
    stored = db.get_setting(engine, "garmin_tokens")
    tokens = decrypt(stored, key) if stored and key else env_tokens
    failed, client = [], None
    try:
        if not tokens:
            raise RuntimeError("geen Garmin-tokens: zet GARMINTOKENS (tools/setup_garmin.py --railway)")
        client = client_factory(tokens)
        print(f"garmin: {sync_garmin(DbSink(engine), client, state, today, since, read_streams)} activiteiten")
    except RateLimited:
        print("garmin: rate limit bereikt, volgende run gaat verder")
    except Exception as err:
        print(f"garmin: MISLUKT ({type(err).__name__}: {err})")
        failed.append("garmin")
    finally:
        if client is not None:
            for metric, counts in getattr(client, "stats", {}).items():
                print(f"garmin {metric}: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
            if key:
                db.set_setting(engine, "garmin_tokens", encrypt(client.tokens(), key))
        state["last_sync_local"] = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
        if failed:
            state["last_failed"] = failed
        else:
            state.pop("last_failed", None)
        db.set_setting(engine, "sync_state", state)
    print(f"derive: {derive(engine)}")
    return 1 if failed else 0


# --- CLI ----------------------------------------------------------------------------


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--since", type=date.fromisoformat, help="backfill vanaf deze datum (YYYY-MM-DD)")
    parser.add_argument("--source", choices=["all", "strava", "garmin"], default="all")
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--files", action="store_true", help="schrijf naar de bestanden in data/ (oude modus) ook als DATABASE_URL gezet is")
    args = parser.parse_args(argv)

    if os.environ.get("DATABASE_URL") and not args.files:
        engine = db.connect(os.environ["DATABASE_URL"])
        db.create_schema(engine)
        return run_db_sync(engine, os.environ.get("TOKEN_ENCRYPTION_KEY", ""), os.environ.get("GARMINTOKENS"), since=args.since)

    root = args.root
    token_out = os.environ.get("TOKEN_OUT_DIR")
    state_path = root / "data" / "sync_state.json"
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    tz = ZoneInfo("Europe/Amsterdam")
    today = datetime.now(tz).date()
    failed = []

    def save():
        state_path.parent.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(state, indent=1))

    if args.source in ("all", "strava"):
        env = [os.environ.get(k) for k in ("STRAVA_CLIENT_ID", "STRAVA_CLIENT_SECRET", "STRAVA_REFRESH_TOKEN")]
        if not all(env):
            print("strava: overgeslagen, secrets ontbreken")
        else:
            try:
                client = StravaClient(*env)
                write_rotated_token(token_out, "STRAVA_REFRESH_TOKEN", env[2], client.refresh_token)
                print(f"strava: {sync_strava(root, client, state, args.since)} activiteiten")
            except RateLimited:
                print("strava: rate limit bereikt, volgende run gaat verder")
            except Exception as err:
                print(f"strava: MISLUKT ({type(err).__name__}: {err})")
                failed.append("strava")
            finally:
                save()

    if args.source in ("all", "garmin"):
        tokens = os.environ.get("GARMINTOKENS")
        if not tokens:
            print("garmin: overgeslagen, secret GARMINTOKENS ontbreekt")
        else:
            client = None
            try:
                client = GarminClient(tokens)
                print(f"garmin: {sync_garmin(root, client, state, today, args.since)} activiteiten")
            except RateLimited:
                print("garmin: rate limit bereikt, volgende run gaat verder")
            except Exception as err:
                print(f"garmin: MISLUKT ({type(err).__name__}: {err})")
                failed.append("garmin")
            finally:
                if client is not None:
                    for metric, counts in client.stats.items():
                        print(f"garmin {metric}: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
                    write_rotated_token(token_out, "GARMINTOKENS", tokens, client.tokens())
                save()

    state["last_sync_local"] = datetime.now(tz).strftime("%Y-%m-%d %H:%M")
    if failed:
        state["last_failed"] = failed
    else:
        state.pop("last_failed", None)
    save()

    from tools.build import build

    build(root, today)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
