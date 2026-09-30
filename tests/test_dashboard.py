from datetime import date

from api.dashboard import build_dashboard, form_status

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
