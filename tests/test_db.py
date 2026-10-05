from tests.test_store import GARMIN_ACTIVITY, GARMIN_SPLITS, STRAVA_ACTIVITY, STRAVA_STREAMS
from tools import db
from tools.store import from_garmin, from_strava


def fresh():
    engine = db.connect("sqlite://")
    db.create_schema(engine)
    return db.Scope(engine, 1)


def test_upsert_merges_same_activity_from_two_sources():
    e = fresh()
    a = db.upsert_activity(e, from_strava(STRAVA_ACTIVITY, STRAVA_STREAMS))
    b = db.upsert_activity(e, from_garmin(GARMIN_ACTIVITY, GARMIN_SPLITS))
    assert a == b == "2026-09-28_0930_run"
    acts = db.load_activities(e)
    assert len(acts) == 1
    assert acts[0]["avg_hr"] == 150 and acts[0]["name"] == "Ochtendloop"
    assert set(acts[0]["sources"]) == {"garmin", "strava"}


def test_streams_are_stored_separately_and_loaded_on_demand():
    e = fresh()
    aid = db.upsert_activity(e, from_strava(STRAVA_ACTIVITY, STRAVA_STREAMS))
    assert "streams" not in db.load_activities(e)[0]
    assert db.load_streams(e, aid)["latlng"][0] == [52.09, 5.12]
    assert db.load_activities(e, with_streams=True)[0]["streams"]["heartrate"] == [120, 121, 122]


def test_activities_far_apart_stay_separate():
    e = fresh()
    later = dict(STRAVA_ACTIVITY, id=112, start_date="2026-09-28T17:00:00Z", start_date_local="2026-09-28T19:00:00Z")
    db.upsert_activity(e, from_strava(STRAVA_ACTIVITY, None))
    db.upsert_activity(e, from_strava(later, None))
    assert len(db.load_activities(e)) == 2


def test_derived_fields_can_be_updated():
    e = fresh()
    aid = db.upsert_activity(e, from_strava(STRAVA_ACTIVITY, None))
    db.set_derived(e, aid, hr_zones_s={"Z1": 1, "Z2": 2, "Z3": 0, "Z4": 0, "Z5": 0})
    assert db.load_activities(e)[0]["hr_zones_s"]["Z2"] == 2


def test_wellness_replaces_the_day_and_empty_removes_it():
    e = fresh()
    db.write_wellness(e, "2026-09-28", {"resting_hr": 131})
    db.write_wellness(e, "2026-09-28", {"steps": 500})
    assert db.load_wellness(e) == {"2026-09-28": {"steps": 500}}
    db.write_wellness(e, "2026-09-28", {})
    assert db.load_wellness(e) == {}


def test_settings_roundtrip():
    e = fresh()
    assert db.get_setting(e, "zones") is None
    db.set_setting(e, "zones", {"run": {"bounds": [1, 2, 3, 4]}})
    db.set_setting(e, "zones", {"run": {"bounds": [5, 6, 7, 8]}})
    assert db.get_setting(e, "zones") == {"run": {"bounds": [5, 6, 7, 8]}}


def test_documents_keep_body_and_author():
    e = fresh()
    db.put_document(e, "profile", "# Profiel", author="alice")
    doc = db.get_document(e, "profile")
    assert doc["body"] == "# Profiel" and doc["updated_by"] == "alice"
    assert db.get_document(e, "missing") is None


def test_entries_newest_first_and_filtered_by_kind():
    e = fresh()
    db.add_entry(e, kind="log", title="HM", body="1:50:00", author="agent", day="2026-09-27")
    db.add_entry(e, kind="analysis", title="Fitheid", body="...", author="agent", day="2026-09-30")
    db.add_entry(e, kind="log", title="Rust", body="...", author="alice", day="2026-09-30")
    logs = db.list_entries(e, kind="log")
    assert [x["title"] for x in logs] == ["Rust", "HM"]
    assert len(db.list_entries(e)) == 3


def test_plan_with_sessions():
    e = fresh()
    pid = db.create_plan(e, title="Marathon 3:45", goal="marathon onder 3:45", race="Rotterdam 2027-04-11", author="agent")
    db.add_sessions(e, pid, [
        {"date": "2026-10-06", "sport": "run", "kind": "duurloop", "distance_km": 16, "target_zone": "Z2"},
        {"date": "2026-10-04", "sport": "run", "kind": "recover", "duration_min": 40, "target_zone": "Z1"},
    ])
    plan = db.get_plan(e, pid)
    assert plan["status"] == "active"
    assert [s["date"] for s in plan["sessions"]] == ["2026-10-04", "2026-10-06"]
    assert db.active_plan(e)["id"] == pid


def test_new_active_plan_retires_the_previous_one():
    e = fresh()
    first = db.create_plan(e, title="A", author="agent")
    second = db.create_plan(e, title="B", author="agent")
    assert db.get_plan(e, first)["status"] == "finished"
    assert db.active_plan(e)["id"] == second


def test_routes_replace_all():
    e = fresh()
    db.save_routes(e, [{"id": "r1", "sport": "run", "name": "Park", "distance_km": 6.2}])
    db.save_routes(e, [{"id": "r2", "sport": "run", "name": "Dijk", "distance_km": 10.6}])
    assert [r["id"] for r in db.load_routes(e)] == ["r2"]
