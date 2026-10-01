import json

from tests.helpers import square_loop
from tools import db
from tools.import_files import import_files


def write(root, rel, data):
    p = root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data))


def run_file(start="2026-09-29T08:00:00", hr=140):
    n = 50
    return {
        "start_utc": start[:10] + "T06:00:00Z",
        "start_local": start,
        "sport": "run",
        "name": "Ochtendloop",
        "distance_km": 5.0,
        "moving_time_s": 1500,
        "avg_hr": hr,
        "streams": {"time": list(range(0, n * 5, 5)), "heartrate": [hr] * n, "latlng": square_loop()[:n]},
        "sources": {"garmin": {"id": 1, "raw": {}}},
    }


def setup(tmp_path):
    e = db.connect(f"sqlite:///{tmp_path / 't.db'}")
    db.create_schema(e)
    db.set_setting(e, "zones", {"run": {"bounds": [132, 147, 162, 176], "max_hr": 189}})
    db.set_setting(e, "sync_state", {"last_sync_local": "2026-09-30 06:00"})
    db.put_document(e, "goals", "door Joost op de site", author="joost")
    return e


def test_imports_new_files_derives_and_leaves_docs_alone(tmp_path):
    e = setup(tmp_path)
    root = tmp_path / "repo"
    write(root, "data/activities/2026/2026-09-29_0800_run.json", run_file())
    write(root, "data/wellness/2026/2026-09-30.json", {"resting_hr": 47})
    write(root, "data/sync_state.json", {"last_sync_local": "2026-10-01 06:10"})
    (root / "goals.md").write_text("oude versie uit de repo")

    out = import_files(e, root)
    assert out["activities"] == 1 and out["wellness"] == 1 and out["sync_state"] and out["derived"]
    acts = db.load_activities(e)
    assert len(acts) == 1 and acts[0]["hr_zones_s"]["Z2"] > 0
    assert db.load_wellness(e)["2026-09-30"] == {"resting_hr": 47}
    assert db.get_setting(e, "sync_state")["last_sync_local"] == "2026-10-01 06:10"
    assert db.get_document(e, "goals")["body"] == "door Joost op de site"


def test_second_run_is_a_no_op_and_changed_files_are_merged(tmp_path):
    e = setup(tmp_path)
    root = tmp_path / "repo"
    write(root, "data/activities/2026/2026-09-29_0800_run.json", run_file())
    import_files(e, root)
    assert import_files(e, root) == {"activities": 0, "wellness": 0, "sync_state": False, "derived": None}

    write(root, "data/activities/2026/2026-09-29_0800_run.json", run_file(hr=150))
    write(root, "data/activities/2026/2026-09-30_0800_run.json", run_file(start="2026-09-30T08:00:00"))
    out = import_files(e, root)
    assert out["activities"] == 2
    acts = db.load_activities(e)
    assert sorted((a["start_local"][:10], a["avg_hr"]) for a in acts) == [("2026-09-29", 150), ("2026-09-30", 140)]


def test_older_file_sync_state_does_not_win(tmp_path):
    e = setup(tmp_path)
    root = tmp_path / "repo"
    write(root, "data/sync_state.json", {"last_sync_local": "2026-09-01 06:00"})
    import_files(e, root)
    assert db.get_setting(e, "sync_state")["last_sync_local"] == "2026-09-30 06:00"
