import pytest
from fastapi.testclient import TestClient

from api import auth
from api.main import create_app
from tests.test_api import PASSWORD, engine, login, make_settings  # noqa: F401  (engine is a fixture)
from tools import db

ANNA_PW = "anna-wachtwoord-1"


@pytest.fixture
def app(engine, tmp_path):  # noqa: F811
    return create_app(engine=engine, static_dir=tmp_path / "missing", settings=make_settings())


def as_joost(app):
    c = TestClient(app)
    login(c)
    return c


def register(app, username="anna", password=ANNA_PW, **kw):
    c = TestClient(app)
    return c, c.post("/api/register", json={"username": username, "password": password, **kw})


def test_first_env_user_is_admin_and_registration_is_closed(app):
    joost = as_joost(app)
    assert joost.get("/api/me").json()["is_admin"] is True
    assert TestClient(app).get("/api/auth/config").json() == {"registration": "closed", "first_user": False}
    _, r = register(app)
    assert r.status_code == 403


def test_open_registration_and_data_isolation(app, engine):  # noqa: F811
    joost = as_joost(app)
    assert joost.patch("/api/admin/settings", json={"registration": "open"}).json()["registration"] == "open"
    anna, r = register(app, display_name="Anna")
    assert r.status_code == 200 and r.json()["is_admin"] is False
    me = anna.get("/api/me").json()
    assert me["username"] == "anna" and me["display_name"] == "Anna"

    # Joost's run is not Anna's
    assert [a["name"] for a in joost.get("/api/activities").json()] == ["Ochtendloop"]
    aid = joost.get("/api/activities").json()[0]["id"]
    assert anna.get("/api/activities").json() == []
    assert anna.get(f"/api/activities/{aid}").status_code == 404
    assert anna.get("/api/heatmap").json() == {"tracks": []}
    assert anna.get("/api/dashboard").json()["recent"] == []

    # plans, log, docs: each their own
    pid = joost.post("/api/plans", json={"title": "Marathon", "sessions": [{"date": "2026-10-04", "sport": "run"}]}).json()["id"]
    assert anna.get(f"/api/plans/{pid}").status_code == 404
    assert anna.patch(f"/api/plans/{pid}", json={"status": "gestopt"}).status_code == 404
    assert anna.put(f"/api/plans/{pid}/sessions", json=[]).status_code == 404
    assert anna.get("/api/plans/active").json()["plan"] is None
    joost.post("/api/entries", json={"kind": "log", "title": "Joost-log", "body": "b"})
    anna.post("/api/entries", json={"kind": "log", "title": "Anna-log", "body": "b"})
    assert [e["title"] for e in anna.get("/api/entries").json()] == ["Anna-log"]
    assert [e["author"] for e in anna.get("/api/entries").json()] == ["anna"]
    joost.put("/api/docs/goals", json={"body": "Marathon 3:45"})
    assert anna.get("/api/docs/goals").status_code == 404
    assert anna.get("/api/context").json()["goals"] is None

    # agent tokens act as their own user
    tok = anna.post("/api/agent-tokens", json={"name": "Claude"}).json()["token"]
    agent = TestClient(app, headers={"Authorization": f"Bearer {tok}"})
    assert agent.get("/api/me").json()["username"] == "anna"
    assert agent.get("/api/activities").json() == []
    assert [t["name"] for t in joost.get("/api/agent-tokens").json()] == []
    mcp = agent.post("/api/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "list_activities", "arguments": {}}}).json()
    assert "Ochtendloop" not in mcp["result"]["content"][0]["text"]


def test_invite_registration(app):
    joost = as_joost(app)
    joost.patch("/api/admin/settings", json={"registration": "invite"})
    _, r = register(app)
    assert r.status_code == 403
    code = joost.post("/api/admin/invites", json={"days": 7}).json()["code"]
    _, r = register(app, invite=code)
    assert r.status_code == 200
    _, r = register(app, username="bob", invite=code)
    assert r.status_code == 403  # used
    invite = joost.get("/api/admin/settings").json()["invites"][0]
    assert invite["code"] == code and invite["used_by"] is not None


def test_registration_rules(app):
    joost = as_joost(app)
    joost.patch("/api/admin/settings", json={"registration": "open"})
    assert register(app, username="a")[1].status_code == 422
    assert register(app, password="kort")[1].status_code == 422
    assert register(app, username="Joost")[1].status_code == 409
    assert joost.patch("/api/admin/settings", json={"registration": "iedereen"}).status_code == 422


def test_admin_manages_users(app):
    joost = as_joost(app)
    joost.patch("/api/admin/settings", json={"registration": "open"})
    anna, _ = register(app)
    anna_id = anna.get("/api/me").json()["id"]
    assert anna.get("/api/admin/users").status_code == 403
    assert {u["username"] for u in joost.get("/api/admin/users").json()} == {"joost", "anna"}

    # suspend: no more access, no login
    joost.patch(f"/api/admin/users/{anna_id}", json={"suspended": True})
    assert anna.get("/api/me").status_code == 401
    assert TestClient(app).post("/api/login", json={"username": "anna", "password": ANNA_PW}).status_code == 403
    joost.patch(f"/api/admin/users/{anna_id}", json={"suspended": False})

    # reset password: the temporary one works, the old one not
    temp = joost.post(f"/api/admin/users/{anna_id}/reset-password").json()["password"]
    assert TestClient(app).post("/api/login", json={"username": "anna", "password": ANNA_PW}).status_code == 401
    assert TestClient(app).post("/api/login", json={"username": "anna", "password": temp}).status_code == 200

    # an admin cannot lock themselves out
    assert joost.patch("/api/admin/users/1", json={"is_admin": False}).status_code == 422
    assert joost.delete("/api/admin/users/1?confirm=joost").status_code == 422
    # delete needs the username typed
    assert joost.delete(f"/api/admin/users/{anna_id}?confirm=nee").status_code == 422
    assert joost.delete(f"/api/admin/users/{anna_id}?confirm=anna").json() == {"ok": True}
    assert {u["username"] for u in joost.get("/api/admin/users").json()} == {"joost"}


def test_account_password_change(app):
    joost = as_joost(app)
    assert joost.post("/api/account/password", json={"current": "fout", "new": "nieuw-wachtwoord-99"}).status_code == 403
    assert joost.post("/api/account/password", json={"current": PASSWORD, "new": "kort"}).status_code == 422
    assert joost.post("/api/account/password", json={"current": PASSWORD, "new": "nieuw-wachtwoord-99"}).json() == {"ok": True}
    assert login(TestClient(app)).status_code == 401
    assert login(TestClient(app), password="nieuw-wachtwoord-99").status_code == 200
    assert joost.patch("/api/account", json={"display_name": "Joost J."}).json()["display_name"] == "Joost J."


def test_cookie_from_before_multi_user_still_works(app):
    old = auth.create_token("joost", "x" * 32, 30)  # single-user cookies carried the username
    c = TestClient(app, cookies={auth.COOKIE: old})
    assert c.get("/api/me").json()["username"] == "joost"


def test_first_person_to_register_is_admin_on_an_empty_install(tmp_path):
    e = db.connect(f"sqlite:///{tmp_path / 'new.db'}")
    settings = make_settings()
    settings.user, settings.password_hash = "", ""
    app = create_app(engine=e, static_dir=tmp_path / "missing", settings=settings)
    assert TestClient(app).get("/api/auth/config").json() == {"registration": "open", "first_user": True}
    c, r = register(app, username="eerste")
    assert r.json()["is_admin"] is True
    assert TestClient(app).get("/api/auth/config").json()["registration"] == "closed"
