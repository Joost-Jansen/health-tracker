"""Bridge while the GitHub Action still syncs Garmin into the repo's data/ files: import new or changed activity
and wellness files into the database, then recompute derived data.

`web` runs this on startup (every sync commit redeploys it). It never touches documents, log, plans, routes names
or zones, so edits made on the site or by agents stay. Changed files are found by content hash, kept in the setting
`file_import`. Once the Railway sync service runs and the Action is retired, the files stop changing and this is a
no-op; then remove it (see docs/WORK.md, T10).

    DATABASE_URL=... python tools/import_files.py
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools import db
from tools.derive import derive

ROOT = Path(__file__).resolve().parents[1]
KEY = "file_import"


def _digest(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()


def import_activity(engine, a: dict) -> str:
    """Same per-source re-insert as tools/migrate_files_to_db.py, so the sync's merge rules apply."""
    a = dict(a)
    a.pop("hr_zones_s", None)  # derived
    aid = None
    for i, (src, info) in enumerate((a.get("sources") or {"file": {}}).items()):
        record = {k: v for k, v in a.items() if k not in ("sources", "streams")}
        record.update(info.get("fields", {}))
        record["sources"] = {src: {k: v for k, v in info.items() if k != "fields"}}
        if i == 0 and a.get("streams"):
            record["streams"] = a["streams"]
        aid = db.upsert_activity(engine, record)
    return aid


def import_files(engine, root: Path = ROOT) -> dict:
    root = Path(root)
    data = root / "data"
    state = db.get_setting(engine, KEY) or {}
    seen: dict[str, str] = state.get("hashes", {})
    counts = {"activities": 0, "wellness": 0, "sync_state": False, "derived": None}

    for path in sorted((data / "activities").glob("*/*.json")):
        rel, h = str(path.relative_to(root)), _digest(path)
        if seen.get(rel) != h:
            import_activity(engine, json.loads(path.read_text()))
            seen[rel] = h
            counts["activities"] += 1

    for path in sorted((data / "wellness").glob("*/*.json")):
        rel, h = str(path.relative_to(root)), _digest(path)
        if seen.get(rel) != h:
            db.write_wellness(engine, path.stem, json.loads(path.read_text()))
            seen[rel] = h
            counts["wellness"] += 1

    sync_file = data / "sync_state.json"
    if sync_file.exists():
        file_state = json.loads(sync_file.read_text())
        current = db.get_setting(engine, "sync_state") or {}
        if file_state.get("last_sync_local", "") > current.get("last_sync_local", ""):
            db.set_setting(engine, "sync_state", {**current, **file_state})
            counts["sync_state"] = True

    if counts["activities"] or not state.get("derived"):
        counts["derived"] = derive(engine)
    db.set_setting(engine, KEY, {"hashes": seen, "derived": True})
    return counts


if __name__ == "__main__":
    print(import_files(db.connect(os.environ["DATABASE_URL"])))
