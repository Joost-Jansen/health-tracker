"""Routes that agents and Joost both use: documents (profile, goals), log and analyses, plans, and the agent context."""

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


class SessionIn(BaseModel):
    date: str
    sport: str
    kind: str | None = None
    distance_km: float | None = None
    duration_min: int | None = None
    target_zone: str | None = None
    description: str | None = None
    route_id: str | None = None


class PlanIn(BaseModel):
    title: str
    goal: str | None = None
    race: str | None = None
    notes: str | None = None
    sessions: list[SessionIn] = []


class StatusIn(BaseModel):
    status: Literal["actief", "afgerond", "gestopt"]


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

    @r.get("/plans")
    def plans(user: str = Depends(current_user)):
        return db.list_plans(engine)

    @r.get("/plans/active")
    def active(user: str = Depends(current_user)):
        return db.active_plan(engine)

    @r.get("/plans/{plan_id}")
    def plan(plan_id: int, user: str = Depends(current_user)):
        p = db.get_plan(engine, plan_id)
        if not p:
            raise HTTPException(404, "schema bestaat niet")
        return p

    @r.post("/plans")
    def create_plan(p: PlanIn, user: str = Depends(current_user)):
        pid = db.create_plan(engine, title=p.title, goal=p.goal, race=p.race, notes=p.notes, author=author_of(user))
        db.add_sessions(engine, pid, [s.model_dump() for s in p.sessions])
        return db.get_plan(engine, pid)

    @r.put("/plans/{plan_id}/sessions")
    def replace_sessions(plan_id: int, items: list[SessionIn], user: str = Depends(current_user)):
        if not db.get_plan(engine, plan_id):
            raise HTTPException(404, "schema bestaat niet")
        db.replace_sessions(engine, plan_id, [s.model_dump() for s in items])
        return db.get_plan(engine, plan_id)

    @r.post("/plans/{plan_id}/status")
    def set_status(plan_id: int, s: StatusIn, user: str = Depends(current_user)):
        db.set_plan_status(engine, plan_id, s.status)
        return db.get_plan(engine, plan_id)

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
