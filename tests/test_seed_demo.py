from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from api.main import Settings, create_app
from scripts.seed_demo import seed
from tools import db

# Today, like the real seed default: the dashboard hides readiness when the last sync is older than yesterday,
# so a fixed date would make this test fail as soon as the calendar moves on.
END = datetime.now(ZoneInfo("Europe/Amsterdam")).date()


@pytest.fixture(scope="module")
def seeded(tmp_path_factory):
    engine = db.connect(f"sqlite:///{tmp_path_factory.mktemp('demo') / 'demo.db'}")
    out = seed(engine, END, days=56, password="demo-password-1")
    return engine, out


def test_seed_creates_demo_admin_with_data(seeded):
    engine, out = seeded
    user = db.get_user_by_name(engine, "demo")
    assert user["is_admin"] and out["admin"]
    s = db.Scope(engine, user["id"])
    acts = db.load_activities(s)
    assert len(acts) == out["activities"] > 20
    assert {a["sport"] for a in acts} == {"run", "ride", "swim"}
    assert all(a.get("hr_zones_s") for a in acts)  # derive ran
    assert max(a["start_local"] for a in acts) < END.isoformat()  # nothing done yet today
    assert db.load_routes(s) and db.active_plan(s)["sessions"]
    assert len(db.load_wellness(s)) == 57


def test_seed_refuses_existing_user_without_reset(seeded):
    engine, _ = seeded
    with pytest.raises(SystemExit):
        seed(engine, END, days=7)


def test_demo_user_can_log_in_and_see_dashboard(seeded):
    engine, _ = seeded
    app = create_app(engine=engine, static_dir=None, settings=Settings(jwt_secret="x" * 32, cookie_secure=False))
    c = TestClient(app)
    assert c.post("/api/login", json={"username": "demo", "password": "demo-password-1"}).status_code == 200
    dash = c.get("/api/dashboard").json()
    assert dash["upcoming"] and dash["readiness"]
