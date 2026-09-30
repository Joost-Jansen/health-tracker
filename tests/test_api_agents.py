import hashlib

import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from tests.test_api import PASSWORD, engine, login, make_settings  # noqa: F401  (fixture reuse)
from tools import db

TOKEN = "agent-test-token-abcdef"


@pytest.fixture
def client(engine, tmp_path):  # noqa: F811
    settings = make_settings(agent_token_hash=hashlib.sha256(TOKEN.encode()).hexdigest())
    return TestClient(create_app(engine=engine, static_dir=tmp_path / "missing", settings=settings))


def agent(client):
    client.headers["Authorization"] = f"Bearer {TOKEN}"
    return client


def test_agent_token_grants_access(client):
    assert agent(client).get("/api/me").json() == {"username": "agent"}


def test_wrong_agent_token_is_rejected(client):
    client.headers["Authorization"] = "Bearer nope"
    assert client.get("/api/me").status_code == 401


def test_no_agent_token_configured_means_bearer_never_works(engine, tmp_path):  # noqa: F811
    c = TestClient(create_app(engine=engine, static_dir=tmp_path / "missing", settings=make_settings()))
    c.headers["Authorization"] = "Bearer "
    assert c.get("/api/me").status_code == 401


def test_documents_get_and_put_record_author(client, engine):  # noqa: F811
    assert agent(client).get("/api/docs/profile").status_code == 404
    r = client.put("/api/docs/profile", json={"body": "# Profiel\nMax HR 189"})
    assert r.status_code == 200
    doc = client.get("/api/docs/profile").json()
    assert doc["body"].startswith("# Profiel") and doc["updated_by"] == "agent"


def test_unknown_document_key_is_rejected(client):
    assert agent(client).put("/api/docs/whatever", json={"body": "x"}).status_code == 404


def test_entries_by_joost_via_cookie_and_by_agent(client):
    login(client)
    client.post("/api/entries", json={"kind": "log", "title": "Gevoel", "body": "Zware benen", "day": "2026-09-29"})
    agent(client).post("/api/entries", json={"kind": "analysis", "title": "Fitheid", "body": "## Piek\nmei 2026"})
    items = client.get("/api/entries").json()
    assert {(e["title"], e["author"]) for e in items} == {("Gevoel", "joost"), ("Fitheid", "agent")}
    assert [e["title"] for e in client.get("/api/entries?kind=log").json()] == ["Gevoel"]


def test_entry_kind_is_validated(client):
    assert agent(client).post("/api/entries", json={"kind": "spam", "title": "x", "body": "y"}).status_code == 422


def test_create_plan_with_sessions_and_read_active(client):
    agent(client)
    r = client.post("/api/plans", json={
        "title": "Marathon 3:45", "goal": "sub 3:45", "race": "Rotterdam, 2027-04-11",
        "sessions": [
            {"date": "2026-10-04", "sport": "run", "kind": "duurloop", "distance_km": 18, "target_zone": "Z2"},
            {"date": "2026-10-02", "sport": "run", "kind": "herstel", "duration_min": 40, "target_zone": "Z1"},
        ],
    })
    assert r.status_code == 200
    active = client.get("/api/plans/active").json()
    assert active["title"] == "Marathon 3:45" and active["author"] == "agent"
    assert [s["date"] for s in active["sessions"]] == ["2026-10-02", "2026-10-04"]


def test_replace_sessions_of_a_plan(client):
    agent(client)
    pid = client.post("/api/plans", json={"title": "A", "sessions": [{"date": "2026-10-02", "sport": "run"}]}).json()["id"]
    client.put(f"/api/plans/{pid}/sessions", json=[{"date": "2026-10-09", "sport": "ride", "duration_min": 90}])
    assert [s["sport"] for s in client.get(f"/api/plans/{pid}").json()["sessions"]] == ["ride"]


def test_no_active_plan_is_null(client):
    assert agent(client).get("/api/plans/active").json() is None


def test_context_bundles_what_an_agent_needs(client, engine):  # noqa: F811
    db.put_document(engine, "profile", "# Profiel", author="joost")
    db.put_document(engine, "goals", "# Doelen", author="joost")
    db.add_entry(engine, kind="log", title="HM", body="1:43:31", author="agent", day="2026-09-27")
    ctx = agent(client).get("/api/context").json()
    assert ctx["profile"] == "# Profiel" and ctx["goals"] == "# Doelen"
    assert ctx["last_sync"] == "2026-09-30 06:02"
    assert ctx["recent_log"][0]["title"] == "HM"
    assert "zones" in ctx and "week" in ctx["dashboard"]["zones"]
    assert ctx["active_plan"] is None
    assert isinstance(ctx["routes"], list)
