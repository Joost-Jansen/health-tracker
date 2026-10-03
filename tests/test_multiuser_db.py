import os
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import insert

from tests.test_store import GARMIN_ACTIVITY, GARMIN_SPLITS
from tools import db
from tools.store import from_garmin


def fresh():
    e = db.connect("sqlite://")
    db.create_schema(e)
    return e


def test_same_activity_id_lives_separately_per_user():
    e = fresh()
    a, b = db.Scope(e, 1), db.Scope(e, 2)
    rec = from_garmin(GARMIN_ACTIVITY, GARMIN_SPLITS)
    assert db.upsert_activity(a, rec) == db.upsert_activity(b, rec)  # same id, no collision
    db.set_derived(a, db.load_activities(a)[0]["id"], hr_zones_s={"Z1": 1})
    assert db.load_activities(a)[0]["hr_zones_s"] == {"Z1": 1}
    assert "hr_zones_s" not in db.load_activities(b)[0]
    db.write_wellness(a, "2026-09-30", {"resting_hr": 48})
    db.set_setting(a, "zones", {"run": {}})
    db.put_document(a, "goals", "A", "joost")
    db.add_entry(a, "log", "t", "b", "joost")
    db.save_routes(a, [{"id": "r1", "sport": "run"}])
    assert db.load_wellness(b) == {} and db.get_setting(b, "zones") is None and db.get_document(b, "goals") is None
    assert db.list_entries(b) == [] and db.load_routes(b) == []


def test_plans_are_private_per_user():
    e = fresh()
    a, b = db.Scope(e, 1), db.Scope(e, 2)
    pa = db.create_plan(a, "A", "joost")
    pb = db.create_plan(b, "B", "anna")
    assert db.active_plan(a)["id"] == pa and db.active_plan(b)["id"] == pb  # creating B did not close A
    assert db.get_plan(b, pa) is None
    with pytest.raises(KeyError):
        db.replace_sessions(b, pa, [{"date": "2026-10-01", "sport": "run"}])
    db.set_plan_status(b, pa, "gestopt")
    assert db.get_plan(a, pa)["status"] == "actief"


def test_users_invites_and_delete_with_all_data():
    e = fresh()
    joost = db.create_user(e, "Joost", "hash", is_admin=True)
    anna = db.create_user(e, "anna", "hash2")
    assert db.get_user_by_name(e, " JOOST ")["id"] == joost and "password_hash" not in db.get_user(e, joost)
    assert db.get_user(e, joost, with_hash=True)["password_hash"] == "hash"

    db.create_invite(e, "abc", joost)
    db.create_invite(e, "old", joost, expires_at=datetime.now(timezone.utc) - timedelta(days=1))
    assert db.invite_usable(e, "abc") and not db.invite_usable(e, "old") and not db.invite_usable(e, "nope")
    assert db.use_invite(e, "abc", anna) and not db.use_invite(e, "abc", anna)

    s = db.Scope(e, anna)
    db.upsert_activity(s, from_garmin(GARMIN_ACTIVITY, GARMIN_SPLITS))
    db.add_sessions(s, db.create_plan(s, "p", "anna"), [{"date": "2026-10-01", "sport": "run"}])
    db.add_agent_token(s, "t1", "laptop", "f" * 64)
    db.set_setting(s, "sync_state", {"last_sync_local": "2026-10-01 06:00"})
    listed = {u["username"]: u for u in db.list_users(e)}
    assert listed["anna"]["activities"] == 1 and listed["anna"]["last_sync"] == "2026-10-01 06:00"
    assert db.user_for_token_hash(e, "f" * 64) == anna

    db.delete_user(e, anna)
    assert db.get_user(e, anna) is None and db.load_activities(s) == [] and db.list_plans(s) == []
    assert db.user_for_token_hash(e, "f" * 64) is None
    assert db.count_users(e) == 1


def _v1_database(url):
    """A database as it was before multi-user (single-user tables), with some data."""
    e = db.connect(url)
    v1_meta, t = db._v1_meta()
    v1_meta.create_all(e)
    now = datetime(2026, 9, 30, tzinfo=timezone.utc)
    with e.begin() as c:
        c.execute(insert(t["activities"]).values(id="2026-09-27_1130_run", start_local="2026-09-27T11:30:00", start_utc="2026-09-27T09:30:00Z", sport="run", data={"name": "HM", "start_local": "2026-09-27T11:30:00"}))
        c.execute(insert(t["activity_streams"]).values(activity_id="2026-09-27_1130_run", data={"latlng": [[52.0, 5.0]]}))
        c.execute(insert(t["fit_files"]).values(activity_id="garmin-1", data=b"PK"))
        c.execute(insert(t["wellness"]).values(day="2026-09-30", data={"resting_hr": 48}))
        c.execute(insert(t["settings"]).values(key="zones", value={"run": {"bounds": [132, 147, 162, 176]}}))
        c.execute(insert(t["settings"]).values(key="agent_tokens", value=[{"id": "ab12", "name": "Claude", "hash": "e" * 64, "created_at": "2026-10-01T08:00:00+00:00"}]))
        c.execute(insert(t["documents"]).values(key="goals", body="Marathon", updated_at=now, updated_by="joost"))
        c.execute(insert(t["entries"]).values(id=7, kind="log", day="2026-09-30", title="Log", body="b", author="agent", created_at=now))
        c.execute(insert(t["plans"]).values(id=3, title="Blok", status="actief", author="agent", created_at=now))
        c.execute(insert(t["plan_sessions"]).values(id=5, plan_id=3, date="2026-10-02", sport="run", distance_km=10.0))
        c.execute(insert(t["routes"]).values(id="r1", sport="run", data={"id": "r1", "name": "Park"}))
    return e


def _check_migrated(e):
    counts = db.create_schema(e)
    assert counts["activities"] == 1 and counts["plan_sessions"] == 1
    s = db.Scope(e, 1)
    acts = db.load_activities(s, with_streams=True)
    assert acts[0]["name"] == "HM" and acts[0]["streams"]["latlng"]
    assert db.get_fit(s, "garmin-1") == b"PK" and db.load_wellness(s) == {"2026-09-30": {"resting_hr": 48}}
    assert db.get_setting(s, "zones")["run"]["bounds"][0] == 132 and db.get_setting(s, "agent_tokens") is None
    assert db.user_for_token_hash(e, "e" * 64) == 1
    assert db.get_document(s, "goals")["body"] == "Marathon" and db.list_entries(s)[0]["id"] == 7
    plan = db.active_plan(s)
    assert plan["id"] == 3 and plan["sessions"][0]["distance_km"] == 10.0
    assert db.load_routes(s)[0]["name"] == "Park"
    # new rows after the migration get fresh ids (Postgres sequences moved past the copied ids)
    assert db.add_entry(s, "log", "nieuw", "b", "joost") == 8
    assert db.create_plan(s, "nieuw", "joost") == 4
    assert db.create_schema(e) is None  # second start: nothing to migrate
    assert db.get_app_setting(e, "schema_version") == db.SCHEMA_VERSION


def test_migration_from_single_user_sqlite(tmp_path):
    _check_migrated(_v1_database(f"sqlite:///{tmp_path / 'v1.db'}"))


@pytest.mark.skipif(not os.environ.get("TEST_POSTGRES_URL"), reason="set TEST_POSTGRES_URL to run against Postgres")
def test_migration_from_single_user_postgres():
    url = os.environ["TEST_POSTGRES_URL"]
    e = db.connect(url)
    db.meta.drop_all(e)
    db._v1_meta()[0].drop_all(e)
    _check_migrated(_v1_database(url))
    db.meta.drop_all(e)


def test_run_all_users_syncs_connected_users_only(monkeypatch):
    from tools import sync

    e = fresh()
    admin = db.create_user(e, "joost", "h", is_admin=True)
    anna = db.create_user(e, "anna", "h")
    bob = db.create_user(e, "bob", "h")
    carl = db.create_user(e, "carl", "h")
    db.set_setting(db.Scope(e, anna), "garmin_tokens", "x")
    db.set_setting(db.Scope(e, carl), "garmin_tokens", "x")
    db.update_user(e, carl, suspended=True)
    seen = []
    monkeypatch.setattr(sync, "run_db_sync", lambda s, key, tokens, **kw: seen.append((s.user_id, tokens)) or 0)
    assert sync.run_all_users(e, "k", env_tokens="ENV") == 0
    assert seen == [(admin, "ENV"), (anna, None)]  # bob has no connection, carl is suspended
