import json

import bcrypt
import pytest
from fastapi.testclient import TestClient

from api.main import Settings, create_app
from tests.helpers import square_loop
from tools import db

PASSWORD = "test-wachtwoord-123"


@pytest.fixture
def engine(tmp_path):
    e = db.connect(f"sqlite:///{tmp_path / 'test.db'}")
    db.create_schema(e)
    db.upsert_activity(
        e,
        {
            "start_utc": "2026-09-29T06:00:00Z",
            "start_local": "2026-09-29T08:00:00",
            "sport": "run",
            "name": "Ochtendloop",
            "distance_km": 10.0,
            "moving_time_s": 3300,
            "avg_hr": 140,
            "streams": {"time": [0, 1], "heartrate": [140, 141], "latlng": square_loop()[:5]},
            "sources": {"garmin": {"id": 1, "raw": {}}},
        },
    )
    db.set_setting(e, "zones", {"run": {"bounds": [132, 147, 162, 176], "max_hr": 189}})
    db.set_setting(e, "sync_state", {"last_sync_local": "2026-09-30 06:02"})
    return e


def make_settings(**kw):
    return Settings(
        user="joost",
        password_hash=bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode(),
        jwt_secret="x" * 32,
        cookie_secure=False,
        **kw,
    )


@pytest.fixture
def client(engine, tmp_path):
    return TestClient(create_app(engine=engine, static_dir=tmp_path / "missing", settings=make_settings()))


def login(client, password=PASSWORD, user="joost"):
    return client.post("/api/login", json={"username": user, "password": password})


def test_health_is_open(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_data_requires_login(client):
    assert client.get("/api/dashboard").status_code == 401
    assert client.get("/api/me").status_code == 401


def test_wrong_password_is_rejected(client):
    assert login(client, password="fout").status_code == 401
    assert login(client, user="iemand", password=PASSWORD).status_code == 401


def test_login_sets_httponly_cookie_and_unlocks_data(client):
    r = login(client)
    assert r.status_code == 200
    assert "httponly" in r.headers["set-cookie"].lower()
    assert client.get("/api/me").json() == {"username": "joost"}
    d = client.get("/api/dashboard").json()
    assert d["last_sync"] == "2026-09-30 06:02"
    assert d["recent"][0]["name"] == "Ochtendloop"


def test_logout_clears_session(client):
    login(client)
    client.post("/api/logout")
    assert client.get("/api/me").status_code == 401


def test_repeated_failures_lock_the_account_for_a_while(client):
    for _ in range(5):
        login(client, password="fout")
    assert login(client).status_code == 429


def test_tampered_token_is_rejected(client):
    login(client)
    client.cookies.set("training_session", "abc.def.ghi")
    assert client.get("/api/me").status_code == 401


def test_dashboard_lists_activity_without_gps(client):
    login(client)
    assert "streams" not in client.get("/api/dashboard").json()["recent"][0]


def test_missing_settings_refuse_all_logins(engine, tmp_path):
    app = create_app(engine=engine, static_dir=tmp_path / "missing", settings=Settings(user="", password_hash="", jwt_secret="", cookie_secure=False))
    assert TestClient(app).post("/api/login", json={"username": "", "password": ""}).status_code == 401


def test_dashboard_reads_the_database_live(client, engine):
    login(client)
    db.set_setting(engine, "sync_state", {"last_sync_local": "2026-10-01 06:00"})
    assert client.get("/api/dashboard").json()["last_sync"] == "2026-10-01 06:00"


def test_history_and_trends_endpoints(client):
    for path in ("/api/activities", "/api/heatmap", "/api/trends"):
        assert client.get(path).status_code == 401
    login(client)
    items = client.get("/api/activities").json()
    assert [a["name"] for a in items] == ["Ochtendloop"]
    detail = client.get(f"/api/activities/{items[0]['id']}").json()
    assert detail["track"]["latlng"] and len(detail["track"]["zone"]) == len(detail["track"]["latlng"])
    assert client.get("/api/activities/bestaat-niet").status_code == 404
    assert len(client.get("/api/heatmap").json()["tracks"]) == 1
    assert "form" in client.get("/api/trends").json()


def test_plans_import_edit_and_match(client):
    assert client.get("/api/plans/active").status_code == 401
    login(client)
    assert client.get("/api/plans/active").json() == {"persistent": True, "plan": None}
    text = "datum,sport,km,zone\n2026-09-29,lopen,10,Z2\n2026-09-30,lopen,8,Z2"
    preview = client.post("/api/plans/import", json={"text": text, "preview": True}).json()
    assert preview["saved"] is False and len(preview["sessions"]) == 2
    res = client.post("/api/plans/import", json={"text": text, "title": "Test"}).json()
    plan = res["plan"]
    assert plan["title"] == "Test" and plan["status"] == "actief"
    assert plan["sessions"][0]["status"] == "gedaan"  # the 10 km run on 2026-09-29 in the fixture
    sessions = [{k: s[k] for k in ("date", "sport", "distance_km")} for s in plan["sessions"]][:1]
    edited = client.put(f"/api/plans/{plan['id']}/sessions", json=sessions).json()
    assert len(edited["sessions"]) == 1
    assert client.patch(f"/api/plans/{plan['id']}", json={"status": "fout"}).status_code == 422
    assert client.patch(f"/api/plans/{plan['id']}", json={"goal": "marathon"}).json()["goal"] == "marathon"


def test_plan_sessions_replaced_from_table(client):
    login(client)
    plan = client.post("/api/plans", json={"title": "Blok", "sessions": [{"date": "2026-10-01", "sport": "run"}]}).json()
    res = client.put(f"/api/plans/{plan['id']}/table", json={"text": "| Datum | Sport | Km |\n|---|---|---|\n| 2026-10-02 | lopen | 12 |\n| 2026-10-03 | rust | |"}).json()
    assert [s["date"] for s in res["plan"]["sessions"]] == ["2026-10-02", "2026-10-03"]
    assert client.put(f"/api/plans/{plan['id']}/table", json={"text": "geen tabel"}).status_code == 422
