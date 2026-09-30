from tests.helpers import square_loop
from tools import db
from tools.derive import derive

ZONES = {"run": {"bounds": [132, 147, 162, 176], "max_hr": 189}}


def run(day, seed, hr=(140, 150, 150)):
    return {
        "start_utc": f"{day}T06:00:00Z",
        "start_local": f"{day}T08:00:00",
        "sport": "run",
        "name": "Ochtendloop",
        "distance_km": 4.0,
        "moving_time_s": 1300,
        "avg_hr": 148,
        "streams": {"time": [0, 10, 20], "heartrate": list(hr), "latlng": square_loop(noise_m=5, seed=seed)},
        "sources": {"garmin": {"id": seed, "raw": {}}},
    }


def setup():
    e = db.connect("sqlite://")
    db.create_schema(e)
    db.set_setting(e, "zones", ZONES)
    return e


def test_derive_stores_zone_seconds_with_own_zones():
    e = setup()
    aid = db.upsert_activity(e, run("2026-09-20", 1))
    derive(e)
    act = next(a for a in db.load_activities(e) if a["id"] == aid)
    # 140 bpm is Z2 (132-146), 150 bpm is Z3 (147-161)
    assert act["hr_zones_s"] == {"Z1": 0, "Z2": 10, "Z3": 10, "Z4": 0, "Z5": 0}


def test_derive_builds_routes_and_keeps_user_names():
    e = setup()
    for i, day in enumerate(["2026-09-20", "2026-09-24", "2026-09-28"]):
        db.upsert_activity(e, run(day, i))
    derive(e)
    routes = db.load_routes(e)
    assert len(routes) == 1 and routes[0]["runs"] == 3 and routes[0]["sport"] == "run"
    routes[0]["name"] = "Parkrondje"
    db.save_routes(e, routes)
    derive(e)
    assert db.load_routes(e)[0]["name"] == "Parkrondje"


def test_derive_without_zones_setting_leaves_activities_untouched():
    e = db.connect("sqlite://")
    db.create_schema(e)
    db.upsert_activity(e, run("2026-09-20", 1))
    derive(e)
    assert "hr_zones_s" not in db.load_activities(e)[0]
