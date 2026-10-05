"""Training plans: import from a CSV or markdown table, edit, and match planned sessions to what was done.

Plans live in the database (tools/db.py). Matching and route suggestions are pure functions so agents and
tests can use them without the web app.
"""

from __future__ import annotations

import csv
import io
import re
from collections import defaultdict
from datetime import date, timedelta
from typing import Callable

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.errors import ApiError
from tools import db
from tools.recommend import recommend
from tools.zones import NAMES

HEADERS = {
    "date": ("date", "datum", "dag", "day"),
    "sport": ("sport", "activiteit", "activity"),
    "kind": ("kind", "type", "soort", "training", "sessie", "session", "workout"),
    "distance_km": ("distance_km", "km", "afstand", "distance", "afstand (km)", "afstand_km"),
    "duration_min": ("duration_min", "duur", "min", "minuten", "duration", "tijd", "duur (min)"),
    "target_zone": ("target_zone", "zone", "hr-zone", "hr zone", "hartslagzone", "intensiteit"),
    "description": ("description", "omschrijving", "beschrijving", "notes", "notitie", "details", "uitleg"),
    "route_id": ("route_id", "rondje", "route"),
}
SPORTS = {
    "run": ("run", "running", "lopen", "hardlopen", "loop", "duurloop", "hardloop"),
    "ride": ("ride", "bike", "cycling", "fietsen", "fiets", "wielrennen"),
    "swim": ("swim", "swimming", "zwemmen", "zwem"),
    "e_bike": ("e-bike", "ebike", "e_bike", "elektrische fiets"),
    "strength_training": ("strength", "strength_training", "kracht", "krachttraining", "gym"),
    "walking": ("walk", "walking", "wandelen", "wandeling"),
    "hiking": ("hike", "hiking", "hiken", "bergwandeling"),
    "indoor_rowing": ("indoor rowing", "indoor_rowing", "roeimachine", "ergometer"),
    "rowing": ("rowing", "roeien"),
    "yoga": ("yoga",),
    "pilates": ("pilates",),
    "mobility": ("mobility", "mobiliteit", "stretching", "rekken"),
    "hiit": ("hiit",),
    "indoor_cardio": ("cardio", "indoor_cardio"),
    "cross_country_skiing": ("cross-country skiing", "langlaufen", "langlauf"),
    "resort_skiing": ("skiing", "skien", "skiën"),
    "rest": ("rest", "rust", "rustdag", "vrij", "off"),
}
MONTHS = {"jan": 1, "feb": 2, "mrt": 3, "mar": 3, "apr": 4, "mei": 5, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "okt": 10, "oct": 10, "nov": 11, "dec": 12}
STATUSES = ("active", "finished", "stopped")


# --- parsing ------------------------------------------------------------------------------


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _header_key(h: str) -> str | None:
    h = _norm(h).strip("* ")
    for key, names in HEADERS.items():
        if h in names:
            return key
    return None


def parse_date(value: str, year: int) -> str | None:
    v = _norm(value)
    if not v:
        return None
    m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", v)
    if m:
        return date(int(m[1]), int(m[2]), int(m[3])).isoformat()
    m = re.search(r"(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?", v)
    if m:
        y = int(m[3]) if m[3] else year
        return date(y + 2000 if y < 100 else y, int(m[2]), int(m[1])).isoformat()
    m = re.search(r"(\d{1,2})\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?", v)
    if m and m[2] in MONTHS:
        return date(int(m[3]) if m[3] else year, MONTHS[m[2]], int(m[1])).isoformat()
    return None


def parse_sport(value: str, kind: str = "") -> str:
    v = _norm(value) or _norm(kind)
    for sport, names in SPORTS.items():
        if any(v == n or v.startswith(n + " ") for n in names):
            return sport
    for sport, names in SPORTS.items():  # "Duurloop 14 km" in the kind column
        if any(n in v for n in names):
            return sport
    return v or "run"


def parse_number(value: str) -> float | None:
    m = re.search(r"\d+(?:[.,]\d+)?", value or "")
    return float(m[0].replace(",", ".")) if m else None


def parse_minutes(value: str) -> int | None:
    v = _norm(value)
    if not v:
        return None
    m = re.fullmatch(r"(\d+):(\d{2})(?::(\d{2}))?", v)
    if m:  # 1:10 = 70 min, 1:10:00 as well
        return int(m[1]) * 60 + int(m[2])
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(u|uur|h)\b", v)
    if m:
        return round(float(m[1].replace(",", ".")) * 60)
    n = parse_number(v)
    return round(n) if n is not None else None


def parse_zone(value: str) -> str | None:
    zones = sorted(set(re.findall(r"[1-5]", _norm(value))))
    if not zones:
        return None
    return f"Z{zones[0]}" if len(zones) == 1 else f"Z{zones[0]}-Z{zones[-1]}"


def _rows(text: str) -> list[list[str]]:
    lines = [ln for ln in text.strip().splitlines() if ln.strip()]
    if lines and lines[0].lstrip().startswith("|"):
        rows = []
        for ln in lines:
            if not ln.lstrip().startswith("|"):
                continue
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
                continue  # separator row
            rows.append(cells)
        return rows
    sample = "\n".join(lines[:5])
    delim = max(";,\t", key=sample.count)
    return [r for r in csv.reader(io.StringIO("\n".join(lines)), delimiter=delim)]


WARNINGS = {
    "no_table": "Geen tabel gevonden.",
    "no_date_column": "Geen kolom met de datum gevonden. Kolommen: {columns}",
    "row_skipped_date": "Rij {row} overgeslagen: datum '{value}' niet herkend.",
}


def warning_text(w: dict) -> str:
    """The Dutch text of a coded warning (what agents and the MCP tools read)."""
    params = {k: ", ".join(v) if isinstance(v, list) else v for k, v in w["params"].items()}
    return WARNINGS[w["code"]].format(**params)


def parse_table(text: str, year: int | None = None) -> tuple[list[dict], list[str]]:
    """Sessions from a CSV (comma, semicolon or tab) or markdown table with a header row. Returns the sessions
    and a list of warnings (rows skipped and why). Dutch and English headers, dates as 2026-10-06, 6-10-2026,
    6/10 or 6 okt."""
    items, warnings = parse_table_coded(text, year)
    return items, [warning_text(w) for w in warnings]


def parse_table_coded(text: str, year: int | None = None) -> tuple[list[dict], list[dict]]:
    """As `parse_table`, with each warning as `{code, params}` (codes in WARNINGS) so the site can translate it."""
    year = year or date.today().year
    rows = _rows(text)
    if not rows:
        return [], [{"code": "no_table", "params": {}}]
    keys = [_header_key(h) for h in rows[0]]
    if "date" not in keys:
        return [], [{"code": "no_date_column", "params": {"columns": list(rows[0])}}]
    out, warnings = [], []
    for n, row in enumerate(rows[1:], start=2):
        cell = {k: (row[i] if i < len(row) else "") for i, k in enumerate(keys) if k}
        day = parse_date(cell.get("date", ""), year)
        if not day:
            warnings.append({"code": "row_skipped_date", "params": {"row": n, "value": cell.get("date", "")}})
            continue
        kind = cell.get("kind", "").strip()
        sport = parse_sport(cell.get("sport", ""), kind)
        out.append(
            {
                "date": day,
                "sport": sport,
                "kind": kind or None,
                "distance_km": parse_number(cell.get("distance_km", "")),
                "duration_min": parse_minutes(cell.get("duration_min", "")),
                "target_zone": parse_zone(cell.get("target_zone", "")),
                "description": cell.get("description", "").strip() or None,
                "route_id": cell.get("route_id", "").strip() or None,
            }
        )
    out.sort(key=lambda s: s["date"])
    return out, warnings


# --- matching -----------------------------------------------------------------------------


def _zone_range(target: str | None) -> list[str]:
    zones = re.findall(r"[1-5]", target or "")
    if not zones:
        return []
    lo, hi = int(min(zones)), int(max(zones))
    return [f"Z{i}" for i in range(lo, hi + 1)]


def zone_compliance(activity: dict, target: str | None) -> float | None:
    """Share of heart-rate time at or below the top of the target zone (easy sessions: not harder than planned),
    or inside the target range for quality sessions (Z3 and up)."""
    zones = _zone_range(target)
    secs = activity.get("hr_zones_s") or {}
    total = sum(secs.values())
    if not zones or not total:
        return None
    top = int(zones[-1][1])
    ok = [z for z in NAMES if int(z[1]) <= top] if top <= 2 else zones
    return round(sum(secs.get(z, 0) for z in ok) / total * 100)


def match_sessions(sessions: list[dict], activities: list[dict], today: date) -> list[dict]:
    """Every session with a status: gedaan (activity of that sport on that day), gemist (past, none), vandaag,
    gepland or rust. One activity is matched to at most one session; with several candidates the closest in
    distance wins. Split runs on one day are summed."""
    by_day: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for a in activities:
        by_day[(a["start_local"][:10], a["sport"])].append(a)
    used: set[str] = set()
    out = []
    for s in sorted(sessions, key=lambda s: (s["date"], s.get("id") or 0)):
        row = dict(s)
        if s["sport"] == "rest":
            row["status"] = "rest"
            out.append(row)
            continue
        cands = [a for a in by_day.get((s["date"], s["sport"]), []) if a["id"] not in used]
        if cands:
            if s.get("distance_km"):
                cands.sort(key=lambda a: abs((a.get("distance_km") or 0) - s["distance_km"]))
            same_sport_left = [a for a in cands if a is not cands[0]]
            others_planned = sum(1 for x in sessions if x is not s and x["date"] == s["date"] and x["sport"] == s["sport"])
            chosen = [cands[0]] + (same_sport_left if not others_planned else [])  # split run: the pieces are one session
            used.update(a["id"] for a in chosen)
            km = round(sum(a.get("distance_km") or 0 for a in chosen), 2)
            secs = sum(a.get("moving_time_s") or 0 for a in chosen)
            merged = {"hr_zones_s": {z: sum((a.get("hr_zones_s") or {}).get(z, 0) for a in chosen) for z in NAMES}}
            row.update(
                status="done",
                activity_ids=[a["id"] for a in chosen],
                done={"distance_km": km, "moving_time_s": secs, "avg_hr": chosen[0].get("avg_hr"), "zone_pct": zone_compliance(merged, s.get("target_zone"))},
            )
        else:
            day = date.fromisoformat(s["date"])
            row["status"] = "missed" if day < today else "today" if day == today else "planned"
        out.append(row)
    return out


def suggest_routes(sessions: list[dict], routes: list[dict], today: date) -> None:
    """Adds `route` ({id, name, distance_km}) to sessions whose `route_id` names one of the user's loops, and
    `route_suggestion` to the other open run and ride sessions with a distance: the best fitting (combination of)
    loops of the session's own sport."""
    by_id = {r["id"]: r for r in routes}
    for s in sessions:
        r = by_id.get(s.get("route_id") or "")
        if r:
            s["route"] = {"id": r["id"], "name": r.get("name") or r["id"], "distance_km": r.get("distance_km")}
    usable = [r for r in routes if r.get("start")]
    if not usable:
        return
    names = {r["id"]: r.get("name") or r["id"] for r in usable}
    for s in sessions:
        if s.get("route"):
            continue
        if s["sport"] not in ("run", "ride") or not s.get("distance_km") or s.get("status") in ("done", "missed"):
            continue
        recs = recommend(usable, s["distance_km"], today, limit=1, sport=s["sport"])
        if recs:
            r = recs[0]
            s["route_suggestion"] = {**r, "names": [names[p] for p in r["parts"]]}


def weekly_summary(sessions: list[dict]) -> list[dict]:
    weeks: dict[str, dict] = {}
    for s in sessions:
        d = date.fromisoformat(s["date"])
        wk = (d - timedelta(days=d.weekday())).isoformat()
        w = weeks.setdefault(wk, {"week": wk, "planned_km": 0.0, "done_km": 0.0, "planned": 0, "done": 0, "missed": 0})
        if s["sport"] == "rest":
            continue
        w["planned"] += 1
        w["planned_km"] += s.get("distance_km") or 0
        if s.get("status") == "done":
            w["done"] += 1
            w["done_km"] += s["done"]["distance_km"]
        elif s.get("status") == "missed":
            w["missed"] += 1
    return [{**w, "planned_km": round(w["planned_km"], 1), "done_km": round(w["done_km"], 1)} for w in sorted(weeks.values(), key=lambda w: w["week"])]


def enrich(plan: dict, activities: list[dict], routes: list[dict], today: date) -> dict:
    sessions = match_sessions(plan.get("sessions") or [], activities, today)
    suggest_routes(sessions, routes, today)
    return {**plan, "sessions": sessions, "weeks": weekly_summary(sessions)}


# --- API ----------------------------------------------------------------------------------


class SessionIn(BaseModel):
    date: str
    sport: str = "run"
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


class PlanPatch(BaseModel):
    title: str | None = None
    goal: str | None = None
    race: str | None = None
    notes: str | None = None
    status: str | None = None


class ImportIn(BaseModel):
    text: str
    title: str | None = None
    goal: str | None = None
    race: str | None = None
    preview: bool = False


def _check_session(s: dict) -> dict:
    try:
        date.fromisoformat(s["date"])
    except ValueError:
        raise ApiError(422, "invalid_date", date=s["date"])
    s["sport"] = parse_sport(s["sport"]) if s["sport"] not in SPORTS else s["sport"]
    s["target_zone"] = parse_zone(s["target_zone"]) if s.get("target_zone") else None
    return s


def make_router(today: Callable[[], date], current_user: Callable) -> APIRouter:
    """Every route works on the caller's own plans (`current_user` returns an api.users.User)."""
    r = APIRouter()

    def full(u, plan: dict | None) -> dict | None:
        return enrich(plan, u.store.activities, u.store.routes, today()) if plan else None

    def must(u, plan_id: int) -> dict:
        plan = db.get_plan(u.scope, plan_id)
        if not plan:
            raise ApiError(404, "plan_not_found")
        return plan

    @r.get("/api/plans")
    def list_plans(u=Depends(current_user)):
        return {"persistent": True, "plans": db.list_plans(u.scope)}

    @r.get("/api/plans/active")
    def active(u=Depends(current_user)):
        return {"persistent": True, "plan": full(u, db.active_plan(u.scope))}

    @r.get("/api/plans/{plan_id}")
    def get(plan_id: int, u=Depends(current_user)):
        return full(u, must(u, plan_id))

    @r.post("/api/plans")
    def create(body: PlanIn, u=Depends(current_user)):
        items = [_check_session(s.model_dump()) for s in body.sessions]
        pid = db.create_plan(u.scope, body.title, u.author, body.goal, body.race, body.notes)
        db.add_sessions(u.scope, pid, items)
        return full(u, db.get_plan(u.scope, pid))

    @r.post("/api/plans/import")
    def import_plan(body: ImportIn, u=Depends(current_user)):
        items, coded = parse_table_coded(body.text, today().year)
        warnings = {"warnings": [warning_text(w) for w in coded], "warning_codes": coded}
        if body.preview or not items:
            return {"sessions": items, **warnings, "saved": False}
        pid = db.create_plan(u.scope, body.title or f"Schema vanaf {items[0]['date']}", u.author, body.goal, body.race)
        db.add_sessions(u.scope, pid, items)
        return {"sessions": items, **warnings, "saved": True, "plan": full(u, db.get_plan(u.scope, pid))}

    @r.patch("/api/plans/{plan_id}")
    def patch(plan_id: int, body: PlanPatch, u=Depends(current_user)):
        must(u, plan_id)
        values = body.model_dump(exclude_none=True)
        if "status" in values and values["status"] not in STATUSES:
            raise ApiError(422, "invalid_plan_status", options=list(STATUSES))
        db.update_plan(u.scope, plan_id, **values)
        return full(u, must(u, plan_id))

    @r.put("/api/plans/{plan_id}/sessions")
    def put_sessions(plan_id: int, body: list[SessionIn], u=Depends(current_user)):
        must(u, plan_id)
        db.replace_sessions(u.scope, plan_id, [_check_session(s.model_dump()) for s in body])
        return full(u, must(u, plan_id))

    @r.put("/api/plans/{plan_id}/table")
    def put_table(plan_id: int, body: ImportIn, u=Depends(current_user)):
        """Replace all sessions from a markdown/CSV table (what agents edit most easily)."""
        must(u, plan_id)
        items, warnings = parse_table(body.text, today().year)
        if not items:
            raise ApiError(422, "no_sessions", detail="; ".join(warnings) or None)
        if not body.preview:
            db.replace_sessions(u.scope, plan_id, items)
        return {"sessions": items, "warnings": warnings, "saved": not body.preview, "plan": full(u, must(u, plan_id))}

    return r
