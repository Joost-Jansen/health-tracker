from datetime import date

from api.trends import build_trends, insights, predictions, races, records, recovery_weekly, standalone_runs, vo2max, weekly_volume, z2_pace

ZONES = {"run": {"bounds": [132, 147, 162, 176], "max_hr": 189}}


def act(aid, start, sport="run", raw=None, **kw):
    a = {"id": aid, "start_local": start, "sport": sport, "distance_km": 10.0, "moving_time_s": 3000, "avg_hr": 140, **kw}
    if raw:
        a["sources"] = {"garmin": {"raw": raw}}
    return a


def z2_streams(speed=3.0, hr=140, n=200):
    return {"time": list(range(0, n * 5, 5)), "heartrate": [hr] * n, "velocity": [speed] * n}


def test_weekly_volume_fills_empty_weeks():
    out = weekly_volume([act("a", "2026-09-01T08:00:00"), act("b", "2026-09-16T08:00:00", sport="swim", distance_km=2.0)])
    assert [w["week"] for w in out] == ["2026-08-31", "2026-09-07", "2026-09-14"]
    assert out[1]["sports"] == {}
    assert out[2]["sports"]["swim"]["km"] == 2.0


def test_run_after_swim_is_not_standalone():
    acts = [act("s", "2026-06-07T08:00:00", sport="swim"), act("r", "2026-06-07T12:00:00"), act("r2", "2026-06-08T08:00:00")]
    assert [a["id"] for a in standalone_runs(acts)] == ["r2"]


def test_z2_pace_uses_only_z2_samples():
    acts = [act("a", "2026-09-01T08:00:00"), act("b", "2026-09-02T08:00:00")]
    streams = {"a": z2_streams(3.0), "b": z2_streams(4.0, hr=165)}
    out = z2_pace(acts, streams.get, ZONES)
    assert out == [{"week": "2026-08-31", "pace_s_per_km": 333, "runs": 1, "z2_seconds": 995}]


def test_records_progression_and_vo2max():
    acts = [
        act("a", "2026-01-01T08:00:00", raw={"fastestSplit_5000": 1500.4, "vO2MaxValue": 52}),
        act("b", "2026-02-01T08:00:00", raw={"fastestSplit_5000": 1550.0}),
        act("c", "2026-03-01T08:00:00", raw={"fastestSplit_5000": 1400.0, "vO2MaxValue": 54}),
    ]
    rec = records(acts)
    assert [r["activity_id"] for r in rec["5k"]] == ["a", "c"]
    assert rec["1k"] == []
    assert vo2max(acts) == [{"date": "2026-01-01", "value": 52}, {"date": "2026-03-01", "value": 54}]


def test_races_detect_triathlon_day_and_named_races():
    acts = [
        act("s", "2026-06-07T08:00:00", sport="swim"),
        act("b", "2026-06-07T09:00:00", sport="ride"),
        act("r", "2026-06-07T12:00:00"),
        act("x", "2026-07-01T08:00:00", name="Amsterdam - Benchmark Run"),
    ]
    out = races(acts)
    assert [r["sport"] for r in out] == ["triathlon", "run"]
    assert out[0]["activity_ids"] == ["s", "b", "r"]


def test_recovery_weekly_averages():
    out = recovery_weekly({"2026-09-28": {"resting_hr": 48, "sleep_h": 6.0}, "2026-09-29": {"resting_hr": 50}})
    assert out == [{"week": "2026-09-28", "resting_hr": 49.0, "sleep_h": 6.0, "body_battery_high": None, "stress_avg": None, "hrv": None}]


def test_build_trends_shape():
    out = build_trends([act("a", "2026-09-01T08:00:00")], {}, ZONES, lambda aid: None, date(2026, 9, 3))
    assert set(out) >= {"form", "weekly", "z2_pace", "vo2max", "recovery_weekly", "records", "races"}
    assert out["form"][-1]["date"] == "2026-09-03"


def hard_run(aid, start, km=21.1, secs=6300):
    return act(aid, start, distance_km=km, moving_time_s=secs, hr_zones_s={"Z1": 0, "Z2": 0, "Z3": 300, "Z4": 5000, "Z5": 1000})


def test_hard_run_is_detected_as_race_but_tempo_run_is_not():
    tempo = act("t", "2026-09-20T08:00:00", hr_zones_s={"Z1": 600, "Z2": 600, "Z3": 600, "Z4": 1800, "Z5": 0})
    out = races([hard_run("h", "2026-09-27T11:30:00"), tempo])
    assert [r["activity_ids"] for r in out] == [["h"]] and out[0]["detected"] == "hartslag"


def test_predictions_use_riegel_from_longest_recent_effort():
    acts = [hard_run("h", "2026-09-27T11:30:00", km=21.0975, secs=6000), act("s", "2026-09-01T08:00:00", raw={"fastestSplit_5000": 1260})]
    p = predictions(acts, date(2026, 9, 30))
    assert p["42k"]["from"]["activity_id"] == "h"
    assert p["42k"]["seconds"] == round(6000 * 2 ** 1.06)
    assert p["5k"]["seconds"] == 1260 and p["5k"]["from"]["source"] == "split"
    assert predictions(acts, date(2027, 9, 30)) == {}  # nothing in the last 180 days


def test_insights_flag_low_easy_share():
    acts = [hard_run("h", "2026-09-27T11:30:00")]
    out = insights([], [], acts, date(2026, 9, 30))
    assert out[0]["level"] == "let_op" and "rustig" in out[0]["title"]


def test_predictions_skip_triathlon_runs():
    acts = [act("s", "2026-09-27T08:00:00", sport="swim"), hard_run("h", "2026-09-27T11:30:00")]
    assert predictions(acts, date(2026, 9, 30)) == {}
