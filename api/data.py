"""Read access for the API. Every call reads the database, so a sync or an agent write shows up immediately."""

from __future__ import annotations

from sqlalchemy.engine import Engine

from tools import db


class DataStore:
    def __init__(self, engine: Engine):
        self.engine = engine

    @property
    def activities(self) -> list[dict]:
        return db.load_activities(self.engine)

    @property
    def wellness(self) -> dict:
        return db.load_wellness(self.engine)

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
