from datetime import date, timedelta

from api.dashboard import ACWR_HIGH, ACWR_LOW, LOAD_MIN_DAYS, RAMP_HIGH, build_dashboard, form_status, load_indicator, today_tsb

TODAY = date(2026, 9, 30)  # Wednesday; week = 2026-09-28 .. 2026-10-04
ZONES = {"run": {"bounds": [132, 147, 162, 176], "max_hr": 189}, "ride": {"bounds": [127, 141, 156, 169], "max_hr": 182}}


def act(day, sport="run", km=10.0, secs=3600, hr=140, z=None, name="Loop"):
    return {
        "id": f"{day}_0800_{sport}",
        "start_local": f"{day}T08:00:00",
        "sport": sport,
        "name": name,
        "distance_km": km,
        "moving_time_s": secs,
        "avg_hr": hr,
        "hr_zones_s": z or {"Z1": 0, "Z2": secs, "Z3": 0, "Z4": 0, "Z5": 0},
    }


def test_zone_share_this_week_and_month_per_sport():
    acts = [
        act("2026-09-29", z={"Z1": 600, "Z2": 1800, "Z3": 600, "Z4": 600, "Z5": 0}),
        act("2026-09-10", z={"Z1": 0, "Z2": 3600, "Z3": 0, "Z4": 0, "Z5": 0}),
        act("2026-09-30", sport="ride", z={"Z1": 3600, "Z2": 0, "Z3": 0, "Z4": 0, "Z5": 0}),
    ]
    d = build_dashboard(acts, {}, ZONES, TODAY, last_sync="x")
    assert d["zones"]["week"]["run"]["pct"]["Z2"] == 50.0
    assert d["zones"]["week"]["run"]["total_s"] == 3600
    assert d["zones"]["month"]["run"]["total_s"] == 7200
    assert d["zones"]["month"]["run"]["pct"]["Z2"] == 75.0
    assert d["zones"]["week"]["ride"]["pct"]["Z1"] == 100.0


def test_last_months_activities_are_not_in_this_month():
    d = build_dashboard([act("2026-08-31")], {}, ZONES, TODAY, last_sync="x")
    assert d["zones"]["month"] == {}


def test_volume_this_week_against_4_week_average():
    acts = [act("2026-09-29", km=10)] + [act(d, km=20) for d in ("2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22")]
    v = build_dashboard(acts, {}, ZONES, TODAY, last_sync="x")["volume"]
    assert v["week"]["run"] == {"count": 1, "km": 10.0, "seconds": 3600}
    assert v["avg4w"]["run"]["km"] == 20.0


def test_form_has_current_values_and_peak():
    acts = [act(f"2026-09-{d:02d}", hr=160) for d in range(1, 20)]
    f = build_dashboard(acts, {}, ZONES, TODAY, last_sync="x")["form"]
    assert f["ctl"] > 0 and f["atl"] > 0
    assert f["ctl_peak_date"] <= "2026-09-30"
    assert len(f["series"]) <= 91
    assert f["status"] in {"fris", "in balans", "vermoeid", "zeer vermoeid"}


def test_form_status_bands():
    assert form_status(10) == "fris"
    assert form_status(0) == "in balans"
    assert form_status(-20) == "vermoeid"
    assert form_status(-35) == "zeer vermoeid"


def test_recent_activities_newest_first_without_streams():
    acts = [act("2026-09-20"), act("2026-09-29"), dict(act("2026-09-25"), streams={"latlng": [[1, 2]]})]
    recent = build_dashboard(acts, {}, ZONES, TODAY, last_sync="x")["recent"]
    assert [r["start_local"][:10] for r in recent] == ["2026-09-29", "2026-09-25", "2026-09-20"]
    assert all("streams" not in r for r in recent)


def test_recovery_last_7_days_and_resting_hr_baseline():
    wellness = {"2026-09-20": {"resting_hr": 50}, "2026-09-29": {"resting_hr": 44, "sleep_h": 7.5}}
    d = build_dashboard([], wellness, ZONES, TODAY, last_sync="2026-09-30 06:02")
    assert [r["date"] for r in d["recovery"]["days"]] == ["2026-09-29"]
    assert d["last_sync"] == "2026-09-30 06:02"


def test_empty_data_does_not_crash():
    d = build_dashboard([], {}, ZONES, TODAY, last_sync="nog nooit")
    assert d["zones"] == {"week": {}, "month": {}}
    assert d["form"] is None


def test_all_sports_total_sums_zone_time_of_each_sport():
    # each activity's hr_zones_s is already computed with its own sport's zones; "all" adds them up
    acts = [
        act("2026-09-29", z={"Z1": 600, "Z2": 1800, "Z3": 600, "Z4": 600, "Z5": 0}),
        act("2026-09-30", sport="ride", z={"Z1": 3600, "Z2": 0, "Z3": 0, "Z4": 0, "Z5": 0}),
    ]
    week = build_dashboard(acts, {}, ZONES, TODAY, last_sync="x")["zones"]["week"]
    assert week["all"]["total_s"] == 7200
    assert week["all"]["seconds"]["Z1"] == 4200
    assert week["all"]["pct"]["Z2"] == 25.0
    assert set(week) == {"all", "run", "ride"}


def test_all_sports_absent_without_heart_rate_data():
    assert "all" not in build_dashboard([], {}, ZONES, TODAY, last_sync="x")["zones"]["week"]


# --- form after the last sync -----------------------------------------------------------------

DAILY = [act(f"2026-09-{d:02d}", hr=160) for d in range(1, 21)]


def test_form_stops_at_the_last_synced_day_when_the_sync_is_older_than_yesterday():
    f = build_dashboard(DAILY, {}, ZONES, TODAY, last_sync="2026-09-20 06:02")["form"]
    assert f["series"][-1]["date"] == "2026-09-20"
    assert f["until"] == "2026-09-20" and f["stopped_at_sync"] is True
    # the unsynced days are not counted as rest: fatigue is the value at the last synced day
    fresh = build_dashboard(DAILY, {}, ZONES, date(2026, 9, 20), last_sync="2026-09-20 06:02")["form"]
    assert f["atl"] == fresh["atl"] and f["tsb"] == fresh["tsb"]


def test_form_runs_to_today_when_the_sync_is_from_yesterday_or_today():
    for sync in ("2026-09-29 06:02", "2026-09-30 06:02"):
        f = build_dashboard(DAILY, {}, ZONES, TODAY, last_sync=sync)["form"]
        assert f["series"][-1]["date"] == "2026-09-30" and f["until"] == "2026-09-30" and f["stopped_at_sync"] is False


def test_form_ignores_a_failure_suffix_and_unknown_sync_text():
    f = build_dashboard(DAILY, {}, ZONES, TODAY, last_sync="2026-09-20 06:02; mislukt: wellness")["form"]
    assert f["until"] == "2026-09-20"
    assert build_dashboard(DAILY, {}, ZONES, TODAY, last_sync="nog nooit")["form"]["until"] == "2026-09-30"


def test_no_form_when_the_last_sync_is_before_the_first_activity():
    assert build_dashboard([act("2026-09-25", hr=160)], {}, ZONES, TODAY, last_sync="2026-09-20 06:00")["form"] is None


# --- load indicator (acute vs chronic) ----------------------------------------------------------


def rows(loads):
    """A fitness series like tools.analytics.fitness_series from a list of daily loads."""
    out, ctl, atl, day = [], 0.0, 0.0, date(2026, 1, 1)
    for x in loads:
        tsb = ctl - atl
        ctl += (x - ctl) / 42
        atl += (x - atl) / 7
        out.append({"date": day.isoformat(), "load": x, "ctl": round(ctl, 1), "atl": round(atl, 1), "tsb": round(tsb, 1)})
        day += timedelta(days=1)
    return out


def test_load_needs_four_weeks_of_history():
    load = load_indicator(rows([60] * (LOAD_MIN_DAYS - 1)))
    assert load["band"] == "unknown" and load["acwr"] is None and load["ramp"] is None


def test_steady_load_is_building():
    load = load_indicator(rows([60] * 200))
    assert load["band"] == "build" and ACWR_LOW <= load["acwr"] <= ACWR_HIGH and abs(load["ramp"]) < 1
    assert load["thresholds"] == {"low": ACWR_LOW, "high": ACWR_HIGH, "ramp_high": RAMP_HIGH}


def test_a_quiet_week_after_steady_training_is_low():
    load = load_indicator(rows([60] * 200 + [0] * 7))
    assert load["band"] == "low" and load["acwr"] < ACWR_LOW


def test_a_sudden_heavy_week_is_high_because_of_the_ratio():
    load = load_indicator(rows([40] * 200 + [120] * 7))
    assert load["band"] == "high" and load["reason"] == "ratio" and load["acwr"] > ACWR_HIGH


def test_a_fast_rise_in_fitness_is_high_because_of_the_ramp():
    # a high chronic load and a week clearly above it: the ratio stays inside the band, fitness rises fast
    load = load_indicator(rows([200] * 200 + [270] * 7))
    assert load["ramp"] > RAMP_HIGH and load["acwr"] <= ACWR_HIGH
    assert load["band"] == "high" and load["reason"] == "ramp"


def test_dashboard_form_has_the_load_indicator():
    f = build_dashboard(DAILY, {}, ZONES, TODAY, last_sync="x")["form"]
    assert f["load"]["band"] in {"unknown", "low", "build", "high"}


def test_todays_form_only_when_the_series_reaches_today():
    fresh = build_dashboard(DAILY, {}, ZONES, TODAY, last_sync="2026-09-30 06:02")["form"]
    stale = build_dashboard(DAILY, {}, ZONES, TODAY, last_sync="2026-09-20 06:02")["form"]
    assert today_tsb(fresh) == fresh["tsb"]
    assert today_tsb(stale) is None and today_tsb(None) is None
