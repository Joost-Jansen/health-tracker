from datetime import date, datetime

from tests.test_store import GARMIN_ACTIVITY, GARMIN_SPLITS, STRAVA_ACTIVITY, STRAVA_STREAMS
from tools.store import load_activities, load_wellness
from tools.sync import RateLimited, sync_garmin, sync_strava, write_rotated_token


class FakeStrava:
    def __init__(self, activities, fail_streams_after=None):
        self.activities = activities
        self.fail_after = fail_streams_after
        self.stream_calls = 0
        self.asked_after = None

    def list_activities(self, after_epoch):
        self.asked_after = after_epoch
        return [a for a in self.activities if _epoch(a) > after_epoch]

    def streams(self, activity_id):
        if self.fail_after is not None and self.stream_calls >= self.fail_after:
            raise RateLimited("429")
        self.stream_calls += 1
        return STRAVA_STREAMS


def _strava(i):
    return dict(STRAVA_ACTIVITY, id=i, start_date=f"2026-09-2{i}T07:30:05Z", start_date_local=f"2026-09-2{i}T09:30:05Z")


def _epoch(a):
    return int(datetime.fromisoformat(a["start_date"].replace("Z", "+00:00")).timestamp())


def test_strava_sync_is_incremental_and_saves_progress(tmp_path):
    acts = [_strava(1), _strava(2), _strava(3)]
    state = {"strava": {"last_start_epoch": _epoch(acts[0])}}
    client = FakeStrava(acts)
    n = sync_strava(tmp_path, client, state)
    assert client.asked_after == _epoch(acts[0])
    assert n == 2
    assert state["strava"]["last_start_epoch"] == _epoch(acts[2])
    assert len(load_activities(tmp_path)) == 2


def test_strava_rate_limit_keeps_what_was_done(tmp_path):
    state = {}
    acts = [_strava(1), _strava(2)]
    client = FakeStrava(acts, fail_streams_after=1)
    try:
        sync_strava(tmp_path, client, state)
        raise AssertionError("expected RateLimited")
    except RateLimited:
        pass
    assert state["strava"]["last_start_epoch"] == _epoch(acts[0])
    assert len(load_activities(tmp_path)) == 1


class FakeGarmin:
    def __init__(self):
        self.wellness_days = []

    def activities(self, start, end):
        return [GARMIN_ACTIVITY]

    def splits(self, activity_id):
        return GARMIN_SPLITS

    def fit(self, activity_id):
        return b"PK-fake-zip"

    def wellness(self, day):
        self.wellness_days.append(day)
        return {"sleep_h": 7.0}


def test_garmin_sync_stores_activity_fit_and_wellness(tmp_path):
    state = {"garmin": {"last_activity_day": "2026-09-28", "last_wellness_day": "2026-09-28"}}
    client = FakeGarmin()
    sync_garmin(tmp_path, client, state, today=date(2026, 9, 30))
    acts = load_activities(tmp_path)
    assert len(acts) == 1 and acts[0]["fit_file"] == "data/raw/fit/2026/999.zip"
    assert (tmp_path / "data/raw/fit/2026/999.zip").read_bytes() == b"PK-fake-zip"
    # re-fetches the last day (it may have been partial) up to today
    assert client.wellness_days == ["2026-09-28", "2026-09-29", "2026-09-30"]
    assert set(load_wellness(tmp_path)) == {"2026-09-28", "2026-09-29", "2026-09-30"}
    assert state["garmin"] == {"last_activity_day": "2026-09-30", "last_wellness_day": "2026-09-30"}


def test_garmin_wellness_backfill_is_capped_to_a_year(tmp_path):
    state = {}
    client = FakeGarmin()
    sync_garmin(tmp_path, client, state, today=date(2026, 9, 30), since=date(2020, 1, 1))
    assert client.wellness_days[0] == "2025-09-30"


def test_rotated_token_is_written_only_when_changed(tmp_path):
    write_rotated_token(tmp_path, "X", old="same", new="same")
    assert not (tmp_path / "X").exists()
    write_rotated_token(tmp_path, "X", old="old", new="new")
    assert (tmp_path / "X").read_text() == "new"


def test_rotated_token_ignored_without_out_dir():
    write_rotated_token(None, "X", old="old", new="new")  # must not raise
