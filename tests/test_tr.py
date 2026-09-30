from tests.test_api_agents import TOKEN, agent, client, engine  # noqa: F401  (fixture reuse)
from tools import db
from tools.tr import context_markdown


def test_context_markdown_renders_real_api_payload(client, engine):  # noqa: F811
    db.put_document(engine, "profile", "Max HR 189", author="joost")
    pid = db.create_plan(engine, title="Marathon", author="agent")
    db.add_sessions(engine, pid, [{"date": "2026-10-04", "sport": "run", "kind": "duurloop", "distance_km": 18, "target_zone": "Z2"}])
    md = context_markdown(agent(client).get("/api/context").json())
    assert "# Trainingscontext (laatste sync: 2026-09-30 06:02)" in md
    assert "Max HR 189" in md
    assert "**Marathon**" in md and "2026-10-04 run duurloop 18.0 km Z2" in md
