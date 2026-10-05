"""The admin page's overview and the log of admin actions."""

from tests.test_api import engine  # noqa: F401  (fixture)
from tests.test_multiuser_api import app, as_admin, register  # noqa: F401  (app is a fixture)
from tools import db


def test_overview_counts_and_logs_admin_actions(app, engine):  # noqa: F811
    admin = as_admin(app)
    admin.patch("/api/admin/settings", json={"registration": "open"})
    anna, _ = register(app)
    anna_id = anna.get("/api/me").json()["id"]
    db.put_fit(db.Scope(engine, anna_id), "upload/x", b"0" * 1000)
    anna.post("/api/feedback", json={"kind": "idea", "message": "Donkere kaart"})

    admin.patch(f"/api/admin/users/{anna_id}", json={"suspended": True})
    admin.post(f"/api/admin/users/{anna_id}/reset-password")
    admin.post("/api/admin/invites", json={"days": 7})

    o = admin.get("/api/admin/overview").json()
    assert (o["accounts"], o["admins"], o["suspended"], o["open_feedback"]) == (2, 1, 1, 1)
    assert o["files_bytes"] == 1000
    actions = [(e["actor"], e["action"], e["target"]) for e in o["audit"]]
    assert actions[:4] == [("alice", "invite", None), ("alice", "reset_password", "anna"), ("alice", "block", "anna"), ("alice", "registration", None)]
    assert next(u for u in admin.get("/api/admin/users").json() if u["username"] == "anna")["files_bytes"] == 1000

    admin.delete(f"/api/admin/users/{anna_id}", params={"confirm": "anna"})
    assert admin.get("/api/admin/overview").json()["audit"][0]["action"] == "delete_user"


def test_overview_is_for_admins_only(app):  # noqa: F811
    as_admin(app).patch("/api/admin/settings", json={"registration": "open"})
    anna, _ = register(app)
    assert anna.get("/api/admin/overview").status_code == 403
