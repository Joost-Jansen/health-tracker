from datetime import date

from tools.summarize import hr_zone_seconds, last_90_days_md, this_week_md

TODAY = date(2026, 9, 30)  # Wednesday; ISO week runs Mon 2026-09-28 .. Sun 2026-10-04


def act(day, sport="run", km=10.0, secs=3200, hr=150, name="Loop", **extra):
    return {
        "start_local": f"{day}T08:00:00",
        "sport": sport,
        "name": name,
        "distance_km": km,
        "moving_time_s": secs,
        "avg_hr": hr,
        **extra,
    }


def test_hr_zone_seconds_counts_time_between_samples():
    # 10 s at 120 (Z1), 10 s at 150 (Z3), last sample has no duration
    got = hr_zone_seconds(heartrate=[120, 150, 170], time=[0, 10, 20])
    assert got == {"Z1": 10, "Z2": 0, "Z3": 10, "Z4": 0, "Z5": 0}


def test_this_week_counts_only_current_iso_week():
    acts = [act("2026-09-27", km=20), act("2026-09-28", km=10), act("2026-09-30", km=8, secs=2560)]
    md = this_week_md(acts, {}, TODAY, last_sync="2026-09-30 06:02")
    assert "Laatste sync: 2026-09-30 06:02 (Europe/Amsterdam)" in md
    assert "| run | 2 | 18.0 | 1:36 |" in md
    assert "2026-09-27" not in md


def test_this_week_lists_activity_with_pace():
    md = this_week_md([act("2026-09-29", km=10, secs=3200, hr=149, name="Duurloop")], {}, TODAY, last_sync="x")
    assert "| 2026-09-29 | run | Duurloop | 10.0 | 5:20 | 149 |" in md


def test_this_week_shows_last_7_days_wellness():
    wellness = {"2026-09-22": {"sleep_h": 6.0}, "2026-09-29": {"sleep_h": 7.5, "hrv_last_night": 58, "resting_hr": 48}}
    md = this_week_md([], wellness, TODAY, last_sync="x")
    assert "| 2026-09-29 | 7.5 |" in md
    assert "2026-09-22" not in md


def test_90_days_has_weekly_run_volume_and_long_run():
    acts = [act("2026-09-29", km=10), act("2026-09-20", km=30, secs=10200), act("2026-06-01", km=50)]
    md = last_90_days_md(acts, {}, TODAY)
    assert "| 2026-09-28 | 10.0 |" in md
    assert "| 2026-09-14 | 30.0 |" in md
    assert "Langste run: 30.0 km op 2026-09-20" in md
    assert "50.0" not in md


def test_90_days_tracks_pace_at_aerobic_heart_rate():
    acts = [act("2026-09-29", km=10, secs=3200, hr=150), act("2026-09-25", km=10, secs=3300, hr=152), act("2026-09-26", km=5, secs=1300, hr=170)]
    md = last_90_days_md(acts, {}, TODAY)
    assert "Tempo bij 145-155 bpm" in md
    assert "5:25" in md  # median of 5:20 and 5:30; the 170 bpm run is excluded


def test_split_run_counts_as_one_session_for_longest_run_and_count():
    # a long run saved as pieces with short stops (seen: 29 km in 5 parts on 2026-01-25)
    parts = [
        dict(act("2026-09-20", km=10, secs=3000), start_local="2026-09-20T08:00:00", elapsed_time_s=3000),
        dict(act("2026-09-20", km=12, secs=3600), start_local="2026-09-20T08:52:00", elapsed_time_s=3600),
    ]
    md = last_90_days_md(parts, {}, TODAY)
    assert "Langste run: 22.0 km op 2026-09-20" in md
    assert "| 2026-09-14 | 22.0 | 1 |" in md


def test_runs_hours_apart_stay_separate_sessions():
    runs = [
        dict(act("2026-09-20", km=10), start_local="2026-09-20T08:00:00", elapsed_time_s=3200),
        dict(act("2026-09-20", km=5), start_local="2026-09-20T18:00:00", elapsed_time_s=1600),
    ]
    assert "| 2026-09-14 | 15.0 | 2 |" in last_90_days_md(runs, {}, TODAY)
