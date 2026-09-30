"""Routes that agents and Joost both use: documents (profile, goals), log and analyses, and the agent context.

Plans live in api/plans.py."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dashboard import build_dashboard
from api.data import DataStore
from tools import db

TZ = ZoneInfo("Europe/Amsterdam")
DOC_KEYS = {"profile", "goals"}


class DocBody(BaseModel):
    body: str


class EntryIn(BaseModel):
    kind: Literal["log", "analysis"]
    title: str
    body: str
    day: str | None = None


def author_of(user: str) -> str:
    return "agent" if user == "agent" else "joost"


def content_router(store: DataStore, current_user) -> APIRouter:
    r = APIRouter(prefix="/api")
    engine = store.engine

    @r.get("/docs/{key}")
    def get_doc(key: str, user: str = Depends(current_user)):
        doc = db.get_document(engine, key) if key in DOC_KEYS else None
        if not doc:
            raise HTTPException(404, "document bestaat niet")
        return doc

    @r.put("/docs/{key}")
    def put_doc(key: str, doc: DocBody, user: str = Depends(current_user)):
        if key not in DOC_KEYS:
            raise HTTPException(404, "onbekend document")
        db.put_document(engine, key, doc.body, author=author_of(user))
        return db.get_document(engine, key)

    @r.get("/entries")
    def entries(kind: str | None = None, limit: int = 100, user: str = Depends(current_user)):
        return db.list_entries(engine, kind=kind, limit=min(limit, 500))

    @r.post("/entries")
    def add_entry(entry: EntryIn, user: str = Depends(current_user)):
        day = entry.day or datetime.now(TZ).date().isoformat()
        eid = db.add_entry(engine, kind=entry.kind, title=entry.title, body=entry.body, author=author_of(user), day=day)
        return {"id": eid}

    @r.get("/context")
    def context(user: str = Depends(current_user)):
        """Everything a coaching agent reads at the start of a session."""
        profile, goals = db.get_document(engine, "profile"), db.get_document(engine, "goals")
        return {
            "last_sync": store.last_sync,
            "profile": profile["body"] if profile else None,
            "goals": goals["body"] if goals else None,
            "zones": store.zones,
            "active_plan": db.active_plan(engine),
            "dashboard": build_dashboard(store.activities, store.wellness, store.zones, datetime.now(TZ).date(), store.last_sync),
            "routes": db.load_routes(engine),
            "recent_log": db.list_entries(engine, kind="log", limit=5),
            "recent_analyses": db.list_entries(engine, kind="analysis", limit=3),
        }

    return r
