from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes_api import make_router, route_detail, route_summary, suggest
from tests.helpers import HOME, square_loop

ROUTES = [
    {"id": "r1", "name": "Park", "distance_km": 4.0, "is_loop": True, "runs": 2, "last_run": "2026-09-10", "start": list(HOME), "end": list(HOME), "median_pace": "5:00", "median_hr": 140, "activity_ids": ["2026-09-01T08:00:00", "b"]},
    {"id": "r2", "name": "Lang", "distance_km": 8.0, "is_loop": True, "runs": 1, "last_run": "2026-08-01", "start": list(HOME), "end": list(HOME), "median_pace": "5:10", "median_hr": 142, "activity_ids": ["c"]},
]
ACTS = [
    {"id": "a", "start_local": "2026-09-01T08:00:00", "sport": "run", "distance_km": 4.0, "moving_time_s": 1300, "avg_hr": 142},
    {"id": "b", "start_local": "2026-09-10T08:00:00", "sport": "run", "distance_km": 4.0, "moving_time_s": 1200, "avg_hr": 138},
    {"id": "c", "start_local": "2026-08-01T08:00:00", "sport": "run", "distance_km": 8.0, "moving_time_s": 2500},
]


def streams(aid):
    return {"latlng": square_loop()} if aid != "c" else None


def test_summary_best_run_and_track_from_latest_run():
    s = route_summary(ROUTES[0], ACTS, streams, points=20)
    assert s["best"]["activity_id"] == "b" and s["best"]["pace_s_per_km"] == 300
    assert len(s["track"]) == 20


def test_detail_history_oldest_first():
    d = route_detail(ROUTES[0], ACTS, streams)
    assert [h["id"] for h in d["history"]] == ["a", "b"]


def test_suggest_prefers_single_route_and_adds_tracks():
    opts = suggest(ROUTES, ACTS, streams, 8.0, date(2026, 9, 30))
    assert opts[0]["parts"] == ["r2"] and opts[0]["names"] == ["Lang"]
    assert any(o["parts"] == ["r1", "r1"] for o in opts)
    assert opts[0]["tracks"]["r2"] == []  # no GPS for that run


@pytest.fixture
def client():
    saved = {}
    app = FastAPI()
    app.include_router(make_router(lambda: [dict(r) for r in ROUTES], lambda: ACTS, streams, lambda: date(2026, 9, 30), lambda: "joost", save=lambda items: saved.update(items=items)))
    c = TestClient(app)
    c.saved = saved
    return c


def test_endpoints(client):
    assert [r["id"] for r in client.get("/api/routes").json()] == ["r1", "r2"]
    assert client.get("/api/routes/suggest?km=4").json()["options"][0]["parts"] == ["r1"]
    assert client.get("/api/routes/suggest?km=0").status_code == 422
    assert client.get("/api/routes/r9").status_code == 404
    assert client.patch("/api/routes/r1", json={"name": "Vondelpark"}).json()["name"] == "Vondelpark"
    assert client.saved["items"][0]["name"] == "Vondelpark"
