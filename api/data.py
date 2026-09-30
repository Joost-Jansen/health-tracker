"""Read-only access to the repo's data. Summaries stay in memory; GPS/HR streams are read from disk on demand."""

from __future__ import annotations

import json
from pathlib import Path

from tools.store import load_wellness
from tools.zones import load_zones


class DataStore:
    def __init__(self, root: Path):
        self.root = Path(root)
        self._paths: dict[str, Path] = {}
        self.activities: list[dict] = []
        for path in sorted((self.root / "data" / "activities").glob("*/*.json")):
            a = json.loads(path.read_text())
            a.pop("streams", None)
            a["id"] = path.stem
            self._paths[path.stem] = path
            self.activities.append(a)
        self.wellness = load_wellness(self.root)
        self.zones = load_zones(self.root)
        state_path = self.root / "data" / "sync_state.json"
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
        self.last_sync = state.get("last_sync_local", "nog nooit")
        if state.get("last_failed"):
            self.last_sync += f"; mislukt: {', '.join(state['last_failed'])}"

    def streams(self, activity_id: str) -> dict | None:
        path = self._paths.get(activity_id)
        if path is None:
            return None
        return json.loads(path.read_text()).get("streams") or {}
