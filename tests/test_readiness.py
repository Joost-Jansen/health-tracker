from datetime import date, timedelta

from api.readiness import readiness

TODAY = date(2026, 9, 30)


def history(rhr=48, sleep=7.5, days=30):
    return {(TODAY - timedelta(days=i)).isoformat(): {"resting_hr": rhr, "sleep_h": sleep} for i in range(1, days + 1)}


def test_normal_night_is_ready():
    w = history()
    w[TODAY.isoformat()] = {"resting_hr": 48, "sleep_h": 7.4, "body_battery_high": 80}
    r = readiness(w, TODAY, tsb=-5)
    assert r["verdict"] == "klaar" and r["date"] == TODAY.isoformat()
    assert {s["key"] for s in r["signals"]} == {"resting_hr", "sleep_h", "body_battery", "tsb"}


def test_high_resting_hr_and_short_sleep_means_recovery():
    w = history()
    w[TODAY.isoformat()] = {"resting_hr": 55, "sleep_h": 4.5}
    assert readiness(w, TODAY)["verdict"] == "herstel"


def test_one_signal_means_easy():
    w = history()
    w[TODAY.isoformat()] = {"resting_hr": 51, "sleep_h": 7.5}
    assert readiness(w, TODAY)["verdict"] == "rustig aan"


def test_stale_data_is_not_used_but_form_still_counts():
    w = {(TODAY - timedelta(days=5)).isoformat(): {"resting_hr": 60, "sleep_h": 4}}
    r = readiness(w, TODAY, tsb=-35)
    assert r["date"] is None and r["verdict"] == "rustig aan" and "niet gedragen" in r["text"]
    assert readiness({}, TODAY) is None


def test_without_night_data_the_verdict_is_unknown():
    r = readiness({TODAY.isoformat(): {"body_battery_high": 66}}, TODAY, tsb=-5)
    assert r["verdict"] == "onbekend" and r["date"] is None
