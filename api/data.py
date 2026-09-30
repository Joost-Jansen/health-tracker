"""Read access for the API.

Activities and wellness (large, change only on a sync) are cached for TTL seconds; everything else is read live,
so an agent write shows up immediately."""

from __future__ import annotations

import time

from sqlalchemy.engine import Engine

from tools import db


TTL = 60


class DataStore:
    def __init__(self, engine: Engine, ttl: float = TTL):
        self.engine = engine
        self.ttl = ttl
        self._cache: dict = {}

    def _cached(self, key: str, load):
        hit = self._cache.get(key)
        if hit and time.monotonic() - hit[0] < self.ttl:
            return hit[1]
        value = load()
        self._cache[key] = (time.monotonic(), value)
        return value

    @property
    def activities(self) -> list[dict]:
        return self._cached("activities", lambda: db.load_activities(self.engine))

    @property
    def wellness(self) -> dict:
        return self._cached("wellness", lambda: db.load_wellness(self.engine))

    @property
    def routes(self) -> list[dict]:
        return db.load_routes(self.engine)

    @property
    def zones(self) -> dict:
        return db.get_setting(self.engine, "zones") or {}

    @property
    def last_sync(self) -> str:
        state = db.get_setting(self.engine, "sync_state") or {}
        text = state.get("last_sync_local", "nog nooit")
        if state.get("last_failed"):
            text += f"; mislukt: {', '.join(state['last_failed'])}"
        return text

    def streams(self, activity_id: str) -> dict | None:
        return db.load_streams(self.engine, activity_id)
