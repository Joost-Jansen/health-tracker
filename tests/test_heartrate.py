from datetime import date, datetime, timezone

import pytest
from fastapi.testclient import TestClient

from api.heartrate import as_markdown, day_view, night_summary, normal_resting_hr
from api.main import create_app
from tests.test_api import engine, login, make_settings  # noqa: F401  (engine is a fixture)
from tests.test_mcp import TOKEN, call
from tests.test_sync import FakeGarmin
from tools import db
from tools.store import heart_rate_from_garmin
from tools.sync import DbSink, GarminClient, sync_garmin


def ms(iso_utc: str) -> int:
    return int(datetime.fromisoformat(iso_utc).replace(tzinfo=timezone.utc).timestamp() * 1000)


# Garmin's answers for 5 October 2026 (summer time, UTC+2), shaped like garminconnect 0.3 returns them.
GARMIN_HR = {
    "calendarDate": "2026-10-05",
    "startTimestampGMT": "2026-10-04T22:00:00.0",
    "startTimestampLocal": "2026-10-05T00:00:00.0",
    "restingHeartRate": 46,
    "minHeartRate": 43,
    "maxHeartRate": 151,
    "heartRateValueDescriptors": [{"key": "timestamp", "index": 0}, {"key": "heartrate", "index": 1}],
    "heartRateValues": [
        [ms("2026-10-04T22:00:00"), 47],  # 00:00 local
        [ms("2026-10-04T22:02:00"), None],  # no reading
        [ms("2026-10-05T02:00:00"), 44],  # 04:00
        [ms("2026-10-05T04:30:00"), 79],  # 06:30
        [ms("2026-10-05T16:00:00"), 151],  # 18:00
    ],
}
GARMIN_SLEEP = {
    "dailySleepDTO": {
        "calendarDate": "2026-10-05",
        "sleepTimeSeconds": 26400,
        "sleepStartTimestampGMT": ms("2026-10-04T21:10:00"),  # 23:10 local, the evening before
        "sleepEndTimestampGMT": ms("2026-10-05T04:40:00"),  # 06:40
        "sleepStartTimestampLocal": ms("2026-10-04T23:10:00"),
        "sleepEndTimestampLocal": ms("2026-10-05T06:40:00"),
    },
    "sleepLevels": [
        {"startGMT": "2026-10-04T21:10:00.0", "endGMT": "2026-10-04T21:40:00.0", "activityLevel": 1.0},
        {"startGMT": "2026-10-04T21:40:00.0", "endGMT": "2026-10-04T22:10:00.0", "activityLevel": 1.0},  # merged
        {"startGMT": "2026-10-04T22:10:00.0", "endGMT": "2026-10-04T23:00:00.0", "activityLevel": 0.0},
        {"startGMT": "2026-10-05T03:50:00.0", "endGMT": "2026-10-05T04:40:00.0", "activityLevel": 2.0},
        {"startGMT": "2026-10-05T04:40:00.0", "endGMT": "2026-10-05T04:40:00.0", "activityLevel": 3.0},  # empty: dropped
    ],
}


def test_garmin_heart_rate_becomes_minutes_after_local_midnight():
    out = heart_rate_from_garmin("2026-10-05", GARMIN_HR, GARMIN_SLEEP)
    assert out["hr"] == [[0, 47], [240, 44], [390, 79], [1080, 151]]
    assert (out["resting"], out["min"], out["max"]) == (46, 43, 151)
    assert out["sleep"] == {"start": -50, "end": 400, "stages": [[-50, 10, 1], [10, 60, 0], [350, 400, 2]]}


def test_garmin_heart_rate_without_data_is_empty_and_sleep_alone_is_kept():
    assert heart_rate_from_garmin("2026-10-05", None, None) == {}
    assert heart_rate_from_garmin("2026-10-05", {"heartRateValues": None}, {"dailySleepDTO": {}}) == {}
    # without the day's own timestamps the offset comes from the sleep (winter time here: UTC+1)
    sleep = {"dailySleepDTO": {"sleepStartTimestampGMT": ms("2026-12-01T22:00:00"), "sleepStartTimestampLocal": ms("2026-12-01T23:00:00"),
                               "sleepEndTimestampLocal": ms("2026-12-02T07:00:00")}}
    out = heart_rate_from_garmin("2026-12-02", {"heartRateValues": [[ms("2026-12-01T23:30:00"), 50]]}, sleep)
    assert out["hr"] == [[30, 50]] and out["sleep"] == {"start": -60, "end": 420, "stages": []}


class FakeGarminHr(FakeGarmin):
    def __init__(self):
        super().__init__()
        self.hr_days = []

    def heart_rate(self, day):
        self.hr_days.append(day)
        return {"hr": [[0, 50]]} if day != "2026-09-29" else {}


def scope():
    e = db.connect("sqlite://")
    db.create_schema(e)
    return db.Scope(e, 1)


def test_sync_fetches_two_weeks_of_heart_rate_the_first_time_then_continues():
    s, client = scope(), FakeGarminHr()
    state = {"garmin": {"last_activity_day": "2026-09-30", "last_wellness_day": "2026-09-30"}}
    sync_garmin(DbSink(s), client, state, today=date(2026, 9, 30), read_streams=lambda _: None)
    assert client.wellness_days == ["2026-09-30"]  # wellness stays incremental
    assert client.hr_days[0] == "2026-09-16" and client.hr_days[-1] == "2026-09-30" and len(client.hr_days) == 15
    assert state["garmin"]["last_heart_rate_day"] == "2026-09-30"
    days = db.heart_rate_days(s)
    assert "2026-09-29" not in days and len(days) == 14  # a day without data is not stored

    client = FakeGarminHr()
    sync_garmin(DbSink(s), client, state, today=date(2026, 10, 1), read_streams=lambda _: None)
    assert client.hr_days == ["2026-09-30", "2026-10-01"]  # the last day again: it was not finished yet

    client = FakeGarminHr()
    sync_garmin(DbSink(s), client, state, today=date(2026, 10, 1), since=date(2026, 8, 1), read_streams=lambda _: None)
    assert client.hr_days[0] == "2026-08-01"  # an explicit backfill goes further back


def test_sync_without_heart_rate_client_still_works(tmp_path):
    state = {"garmin": {"last_activity_day": "2026-09-30", "last_wellness_day": "2026-09-30"}}
    sync_garmin(tmp_path, FakeGarmin(), state, today=date(2026, 9, 30), read_streams=lambda _: None)
    assert "last_heart_rate_day" not in state["garmin"]


def test_garmin_client_reuses_the_sleep_of_wellness():
    calls = []

    class Api:
        def get_sleep_data(self, d):
            calls.append(("sleep", d))
            return GARMIN_SLEEP

        def get_heart_rates(self, d):
            calls.append(("hr", d))
            return GARMIN_HR

        def get_hrv_data(self, d):
            return None

        def get_user_summary(self, d):
            return {}

        def get_training_readiness(self, d):
            return []

    client = GarminClient.__new__(GarminClient)
    client.api, client.stats, client._sleep = Api(), {}, ("", None)
    client.wellness("2026-10-05")
    out = client.heart_rate("2026-10-05")
    assert out["sleep"]["start"] == -50 and calls == [("sleep", "2026-10-05"), ("hr", "2026-10-05")]
    client.heart_rate("2026-10-04")  # no wellness for this day: fetches the sleep itself
    assert calls[-2:] == [("hr", "2026-10-04"), ("sleep", "2026-10-04")]
    assert client.stats["hartslag"] == {"ok": 2}


def test_night_summary_shows_a_rise_before_waking():
    sleep = {"start": -60, "end": 420}
    points = [[m, 45] for m in range(-60, 300, 2)] + [[m, 80] for m in range(300, 422, 2)]
    n = night_summary(points, sleep)
    assert n["lowest"] == 45 and n["lowest_at"] == -60 and n["before_avg"] == 45 and n["last_avg"] == 80 and n["rise"] == 35
    assert n["minutes"] == 480
    assert night_summary(points, {"start": 0, "end": 120}) is None  # too short
    assert night_summary(points[:20], sleep) is None  # too few values
    assert night_summary(points, None) is None


def test_normal_resting_hr_is_the_60_day_median_before_the_day():
    wellness = {f"2026-09-{d:02d}": {"resting_hr": 48 + d % 3} for d in range(1, 21)}
    wellness["2026-09-21"] = {"resting_hr": 70}  # the day itself does not count
    assert normal_resting_hr(wellness, date(2026, 9, 21)) == 49
    assert normal_resting_hr({"2026-09-01": {"resting_hr": 52}}, date(2026, 9, 2)) == 52  # little history: all of it
    assert normal_resting_hr({}, date(2026, 9, 2), 55) == 55
    assert normal_resting_hr({}, date(2026, 9, 2)) is None


def test_day_view_joins_the_evening_before_and_finds_neighbours():
    s = scope()
    db.write_heart_rate(s, "2026-10-04", {"hr": [[1300, 60], [1360, 55], [1420, 50]]})
    db.write_heart_rate(s, "2026-10-05", heart_rate_from_garmin("2026-10-05", GARMIN_HR, GARMIN_SLEEP))
    db.write_heart_rate(s, "2026-10-08", {"hr": [[600, 70]], "sleep": {"start": -30, "end": 400, "stages": []}})
    v = day_view(s, {"2026-10-05": {"resting_hr": 47}}, date(2026, 10, 5))
    assert v["from"] == -120  # an hour before falling asleep at 23:10, on the hour
    assert v["points"][:3] == [[-80, 55], [-20, 50], [0, 47]]  # 22:00 (1300 - 1440 = -140) falls outside
    assert v["sleep"]["stages"][1] == {"start": 10, "end": 60, "stage": "deep"}
    assert (v["prev"], v["next"], v["latest"]) == ("2026-10-04", "2026-10-08", "2026-10-08")
    assert v["resting_hr"] == 47 and v["min"] == 44 and v["max"] == 151
    assert day_view(s, {}, None)["day"] == "2026-10-08"  # without a day: the latest
    assert day_view(s, {}, date(2026, 10, 5), today=date(2026, 10, 5))["to"] == 1140  # today: up to the last reading (18:00)
    assert day_view(s, {}, date(2026, 10, 7))["next_sleep_start"] == 1410  # the night of the 8th began at 23:30
    empty = day_view(scope(), {}, None, today=date(2026, 10, 6))
    assert empty["day"] == "2026-10-06" and empty["points"] == [] and empty["night"] is None
    assert "Geen hartslag" in as_markdown(empty)


@pytest.fixture
def client(engine, tmp_path):  # noqa: F811
    import hashlib

    settings = make_settings(agent_token_hash=hashlib.sha256(TOKEN.encode()).hexdigest())
    return TestClient(create_app(engine=engine, static_dir=tmp_path / "missing", settings=settings))


def test_endpoint_needs_login_and_returns_only_own_data(client, engine):  # noqa: F811
    assert client.get("/api/heartrate").status_code == 401
    db.write_heart_rate(db.Scope(engine, 1), "2026-10-05", heart_rate_from_garmin("2026-10-05", GARMIN_HR, GARMIN_SLEEP))
    db.write_heart_rate(db.Scope(engine, 2), "2026-10-07", {"hr": [[0, 99]]})  # someone else's
    login(client)
    out = client.get("/api/heartrate").json()
    assert out["day"] == "2026-10-05" and out["latest"] == "2026-10-05" and out["next"] is None
    assert out["sleep"]["start"] == -50 and [0, 47] in out["points"]
    assert client.get("/api/heartrate?day=2026-10-07").json()["points"] == []
    r = client.get("/api/heartrate?day=morgen")
    assert r.status_code == 422 and r.json()["code"] == "invalid_date"


def test_mcp_get_heart_rate(client, engine):  # noqa: F811
    db.write_heart_rate(db.Scope(engine, 1), "2026-10-05", heart_rate_from_garmin("2026-10-05", GARMIN_HR, GARMIN_SLEEP))
    text, err = call(client, "get_heart_rate", day="2026-10-05")
    assert not err and "# Hartslag 2026-10-05" in text and "Slaap 23:10-06:40" in text and "| 06:30 | 79 |" in text
    assert call(client, "get_heart_rate", day="gisteren")[1] is True


def test_deleting_a_user_removes_their_heart_rate():
    s = scope()
    db.write_heart_rate(s, "2026-10-05", {"hr": [[0, 50]]})
    db.delete_user(s.engine, 1)
    assert db.heart_rate_days(s) == []
