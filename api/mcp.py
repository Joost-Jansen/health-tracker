"""MCP server (Model Context Protocol, streamable HTTP, JSON responses) so Claude can use the training data as tools.

    POST /api/mcp            Authorization: Bearer <agent token>     (Claude Code: claude mcp add --transport http ...)
    POST /api/mcp/<token>    token in the path, for clients that cannot send headers (claude.ai custom connector)

Stateless: every request is one JSON-RPC message (or a batch). No server-sent events, no sessions.
Tools read and write the same data as the website: what an agent changes, the user sees on the site.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date
from typing import Callable

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from api.dashboard import build_dashboard, summary, today_tsb
from api.history import activity_detail, list_activities
from api.plans import enrich, parse_table
from api.readiness import as_text as readiness_text, readiness
from api.routes_api import suggest
from api.trends import build_trends
from tools import db
from tools.sports import effort_kind
from tools.summarize import last_90_days_md, this_week_md

PROTOCOLS = ("2025-06-18", "2025-03-26", "2024-11-05")
INSTRUCTIONS = (
    "Trainingsdata van {name} (Garmin: lopen, fietsen, zwemmen; slaap en herstel), de doelen, het trainingsschema en het logboek. "
    "Begin een coachingsessie met get_context. Antwoord in het Nederlands, scheid observatie, interpretatie en advies, "
    "reken met de data in plaats van te schatten. Hartslagzones komen uit de eigen zones per sport, nooit uit Garmins hrTimeInZone. "
    "Een run na zwemmen of fietsen op dezelfde dag (triathlon, brick) is niet vergelijkbaar met een losse run. "
    "Schrijf aan het eind van een sessie een logentry (add_log). Geen medisch advies."
)


def instructions(user) -> str:
    return INSTRUCTIONS.format(name=user.display_name or user.username)

SESSION_TABLE_HELP = (
    "Markdown- of CSV-tabel met kopregel. Kolommen: Datum (verplicht, 2026-10-06 of 6-10), Sport (lopen/fietsen/zwemmen/kracht/rust), "
    "Type, Km, Duur (min of 1:10), Zone (Z2 of Z3-Z4), Omschrijving."
)


# Codes in the data are English; the text for the agent is Dutch (see INSTRUCTIONS).
PLAN_STATUS_NL = {"active": "actief", "finished": "afgerond", "stopped": "gestopt"}
SESSION_STATUS_NL = {"done": "gedaan", "missed": "gemist", "today": "vandaag", "planned": "gepland", "rest": "rust"}
FORM_STATUS_NL = {"fresh": "fris", "balanced": "in balans", "tired": "vermoeid", "very_tired": "zeer vermoeid"}


def _str(desc: str, **kw) -> dict:
    return {"type": "string", "description": desc, **kw}


TOOLS = [
    {"name": "get_context", "description": "Alles voor de start van een coachingsessie, als markdown: profiel, doelen, actief schema met gedaan/gemist per sessie, vorm, deze week, laatste 90 dagen, rondjes en de laatste logentries.", "inputSchema": {"type": "object", "properties": {}}},
    {
        "name": "list_activities",
        "description": "Activiteiten, nieuwste eerst, als tabel met id, datum, sport, afstand, tijd, tempo, gemiddelde hartslag en tijd per zone.",
        "inputSchema": {"type": "object", "properties": {"sport": _str("run, ride, swim, strength_training, ..."), "from": _str("vanaf datum YYYY-MM-DD"), "to": _str("tot en met datum YYYY-MM-DD"), "limit": {"type": "integer", "default": 30}}},
    },
    {
        "name": "get_activity",
        "description": "Eén activiteit met details: kilometersplits, ronden, zones, decoupling (hartslagdrift), rondje en eerdere keren daarop, andere activiteiten die dag.",
        "inputSchema": {"type": "object", "properties": {"id": _str("activity id, bv. 2026-09-27_1130_run")}, "required": ["id"]},
    },
    {"name": "get_trends", "description": "Vorm (CTL/ATL/TSB, laatste 60 dagen), volume per week, tempo in Z2, VO2max, herstel per week, records, wedstrijden, voorspelde wedstrijdtijden en inzichten.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "get_plan", "description": "Het actieve trainingsschema als tabel, per sessie met status (gedaan, gemist, vandaag, gepland, rust), wat er gedaan is en een voorgesteld rondje. Een activiteit tot 2 dagen voor of na een open sessie van dezelfde sport telt voor die sessie; Gedaan km per week telt alle activiteiten van de sporten in het schema.", "inputSchema": {"type": "object", "properties": {}}},
    {
        "name": "create_plan",
        "description": "Nieuw trainingsschema uit een tabel. Wordt het actieve schema; het vorige gaat naar afgerond. Gebruik preview=true om eerst te zien hoe de tabel gelezen wordt.",
        "inputSchema": {"type": "object", "properties": {"title": _str("titel"), "table": _str(SESSION_TABLE_HELP), "goal": _str("doel, bv. 10 km onder 50 minuten"), "race": _str("wedstrijd en datum"), "notes": _str("toelichting bij het schema"), "preview": {"type": "boolean", "default": False}}, "required": ["title", "table"]},
    },
    {
        "name": "replace_plan_sessions",
        "description": "Vervang alle sessies van het actieve schema (of plan_id) door een tabel. Haal eerst get_plan op, pas de tabel aan en stuur hem volledig terug.",
        "inputSchema": {"type": "object", "properties": {"table": _str(SESSION_TABLE_HELP), "plan_id": {"type": "integer"}, "preview": {"type": "boolean", "default": False}}, "required": ["table"]},
    },
    {
        "name": "set_plan_status",
        "description": "Zet het actieve schema (of plan_id) op afgerond, gestopt of weer actief.",
        "inputSchema": {"type": "object", "properties": {"status": {"type": "string", "enum": ["active", "finished", "stopped"], "description": "active (actief), finished (afgerond) of stopped (gestopt)"}, "plan_id": {"type": "integer"}}, "required": ["status"]},
    },
    {
        "name": "add_log",
        "description": "Schrijf een logentry (kind=log: vraag, belangrijkste data, besluit/advies van deze sessie) of een analyse (kind=analysis). Markdown.",
        "inputSchema": {"type": "object", "properties": {"title": _str("onderwerp"), "body": _str("markdown"), "kind": {"type": "string", "enum": ["log", "analysis"], "default": "log"}, "day": _str("YYYY-MM-DD, standaard vandaag")}, "required": ["title", "body"]},
    },
    {"name": "list_log", "description": "Laatste logentries of analyses.", "inputSchema": {"type": "object", "properties": {"kind": {"type": "string", "enum": ["log", "analysis"], "default": "log"}, "limit": {"type": "integer", "default": 10}}}},
    {"name": "get_doc", "description": "Profiel (zones, max HR, PR's) of doelen, als markdown.", "inputSchema": {"type": "object", "properties": {"key": {"type": "string", "enum": ["profile", "goals"]}}, "required": ["key"]}},
    {
        "name": "update_doc",
        "description": "Vervang profiel of doelen door nieuwe markdown. Haal eerst get_doc op en stuur het volledige document terug.",
        "inputSchema": {"type": "object", "properties": {"key": {"type": "string", "enum": ["profile", "goals"]}, "body": _str("volledige markdown")}, "required": ["key", "body"]},
    },
    {
        "name": "suggest_route",
        "description": "Vaste rondjes (of combinaties vanaf dezelfde start) voor een afstand, het langst niet gelopen eerst.",
        "inputSchema": {"type": "object", "properties": {"km": {"type": "number"}, "tolerance": {"type": "number", "default": 0.05}, "sport": {"type": "string", "enum": ["run", "ride"], "default": "run"}}, "required": ["km"]},
    },
]


class ToolError(Exception):
    pass


# --- formatting -----------------------------------------------------------------------------------------


def _clock(seconds) -> str:
    if not seconds:
        return "-"
    s = round(seconds)
    h, m = divmod(s // 60, 60)
    return f"{h}:{m:02d}:{s % 60:02d}" if h else f"{m}:{s % 60:02d}"


def _pace(a: dict) -> str:
    if not a.get("distance_km") or not a.get("moving_time_s"):
        return "-"
    kind = effort_kind(a["sport"])
    if kind == "speed":
        return f"{a['distance_km'] / a['moving_time_s'] * 3600:.1f} km/u"
    if kind == "swim":
        return f"{_clock(a['moving_time_s'] / a['distance_km'] / 10)}/100m"
    if kind == "row":
        return f"{_clock(a['moving_time_s'] / a['distance_km'] / 2)}/500m"
    return f"{_clock(a['moving_time_s'] / a['distance_km'])}/km"


def _distance_note(a: dict) -> str:
    if a.get("distance_doubtful"):
        return f" (GPS gaf {a.get('gps_distance_km') or 0} km: onbetrouwbaar in open water, telt niet mee)"
    if a.get("distance_manual"):
        return " (afstand door gebruiker gecorrigeerd)"
    return ""


def _zones(z: dict | None) -> str:
    total = sum((z or {}).values())
    return " ".join(f"{k} {round(v / total * 100)}%" for k, v in z.items() if v) if total else "-"


def activities_md(items: list[dict]) -> str:
    lines = ["| Id | Datum | Sport | Naam | km | Tijd | Tempo | HR | Zones |", "|---|---|---|---|---|---|---|---|---|"]
    for a in items:
        lines.append(
            f"| {a['id']} | {a['start_local'][:16].replace('T', ' ')} | {a['sport']} | {a.get('name') or ''} | {a.get('distance_km') or ('GPS?' if a.get('distance_doubtful') else '-')} | "
            f"{_clock(a.get('moving_time_s'))} | {_pace(a)} | {a.get('avg_hr') or '-'} | {_zones(a.get('hr_zones_s'))} |"
        )
    return "\n".join(lines)


def activity_md(a: dict) -> str:
    out = [
        f"# {a.get('name') or a['sport']} ({a['id']})",
        f"{a['start_local']} · {a['sport']} · {a.get('distance_km') or '-'} km{_distance_note(a)} · {_clock(a.get('moving_time_s'))} bewegend"
        + (f" ({_clock(a['elapsed_time_s'])} totaal)" if a.get("elapsed_time_s") else "")
        + f" · {_pace(a)} · HR {a.get('avg_hr') or '-'} (max {a.get('max_hr') or '-'})",
        f"Zones: {_zones(a.get('hr_zones_s'))}" + (" (zones voor deze sport zijn geschat)" if a.get("zone_estimate") else "") + (f", grenzen {a['zone_bounds']}" if a.get("zone_bounds") else ""),
    ]
    if a.get("decoupling_pct") is not None:
        out.append(f"Decoupling (Pa:HR, tweede helft t.o.v. eerste): {a['decoupling_pct']}%")
    if a.get("same_day"):
        out.append("Zelfde dag: " + ", ".join(f"{x['sport']} {x['start_local'][11:16]} ({x.get('distance_km') or '-'} km)" for x in a["same_day"]))
    if a.get("route"):
        r = a["route"]
        hist = ", ".join(f"{h['date']} {_clock(h['pace_s_per_km'])}/km HR {h.get('avg_hr') or '-'}" for h in r["history"][-8:])
        out.append(f"Rondje {r.get('name')} ({r['id']}), laatste keren: {hist}")
    if a.get("splits"):
        out += ["", "| Km | Tijd | HR | Hoogte m |", "|---|---|---|---|"]
        out += [f"| {s['km']} | {_clock(s['seconds'])} | {s.get('avg_hr') or '-'} | {s.get('elevation_m', '-')} |" for s in a["splits"]]
    if a.get("laps") and len(a["laps"]) > 1:
        out += ["", "| Ronde | km | Tijd | HR |", "|---|---|---|---|"]
        out += [f"| {i} | {lap.get('distance_km')} | {_clock(lap.get('time_s'))} | {lap.get('avg_hr') or '-'} |" for i, lap in enumerate(a["laps"], 1)]
    return "\n".join(out)


def plan_md(plan: dict | None) -> str:
    if not plan:
        return "Geen actief schema."
    out = [f"# {plan['title']} (id {plan['id']}, {PLAN_STATUS_NL.get(plan['status'], plan['status'])}, door {plan['author']})"]
    if plan.get("goal") or plan.get("race"):
        out.append(f"Doel: {plan.get('goal') or '-'} · wedstrijd: {plan.get('race') or '-'}")
    if plan.get("notes"):
        out.append(plan["notes"])
    out += ["", "| Datum | Sport | Type | Km | Duur | Zone | Omschrijving | Status | Gedaan | Rondje |", "|---|---|---|---|---|---|---|---|---|---|"]
    for s in plan["sessions"]:
        d = s.get("done")
        done = (f"{d['distance_km']} km {_clock(d['moving_time_s'])} HR {d.get('avg_hr') or '-'}" + (f", {d['zone_pct']}% volgens zone" if d.get("zone_pct") is not None else "")) if d else ""
        if d and d.get("date") != s["date"]:
            done += f", gedaan op {d['date']}"
        rs = s.get("route_suggestion")
        out.append(
            f"| {s['date']} | {s['sport']} | {s.get('kind') or ''} | {s.get('distance_km') or ''} | {s.get('duration_min') or ''} | {s.get('target_zone') or ''} | "
            f"{s.get('description') or ''} | {SESSION_STATUS_NL.get(s.get('status'), s.get('status') or '')} | {done} | {' + '.join(rs['names']) if rs else ''} |"
        )
    out += ["", "| Week | Gepland km | Gedaan km | Sessies gedaan | Gemist |", "|---|---|---|---|---|"]
    out += [f"| {w['week']} | {w['planned_km']} | {w['done_km']} | {w['done']}/{w['planned']} | {w['missed']} |" for w in plan["weeks"]]
    return "\n".join(out)


# --- the server -------------------------------------------------------------------------------------------


class Server:
    """Answers MCP messages for one user (an api.users.User): their data, written as `agent`."""

    def __init__(self, user, today: Callable[[], date]):
        self.user = user
        self.store = user.store
        self.engine = user.scope  # every db call takes the user's scope
        self.today = today

    def _plan(self, plan_id: int | None) -> dict:
        plan = db.get_plan(self.engine, plan_id) if plan_id else db.active_plan(self.engine)
        if not plan:
            raise ToolError("Geen actief schema" if not plan_id else f"Schema {plan_id} bestaat niet")
        return plan

    def _full(self, plan: dict | None) -> dict | None:
        return enrich(plan, self.store.activities, self.store.routes, self.today()) if plan else None

    def call(self, name: str, args: dict, who: str) -> str:
        s, today = self.store, self.today()
        if name == "get_context":
            profile, goals = db.get_document(self.engine, "profile"), db.get_document(self.engine, "goals")
            dash = build_dashboard(s.activities, s.wellness, s.zones, today, s.last_sync, s.rhr_fallback)
            f = dash["form"]
            parts = [f"# Trainingscontext {today.isoformat()}", f"Laatste sync: {s.last_sync}.", "", "## Profiel", profile["body"] if profile else "(leeg)", "", "## Doelen", goals["body"] if goals else "(leeg)", "", "## Actief schema", plan_md(self._full(db.active_plan(self.engine)))]
            rd = readiness(s.wellness, today, today_tsb(f))
            if rd:
                parts.append(f"\n## Klaar voor vandaag\n{readiness_text(rd)}")
            if f:
                parts.append(f"\n## Vorm\nFitheid (CTL) {f['ctl']}, vermoeidheid (ATL) {f['atl']}, vorm (TSB) {f['tsb']}: {FORM_STATUS_NL.get(f['status'], f['status'])}. Piek CTL {f['ctl_peak']} op {f['ctl_peak_date']}.")
            parts += [this_week_md(s.activities, s.wellness, today, s.last_sync, s.zones), last_90_days_md(s.activities, s.wellness, today, s.zones)]
            parts += ["## Vaste rondjes", "", "| Id | Naam | km | Keer | Laatst | Tempo/km | HR |", "|---|---|---|---|---|---|---|"]
            parts += [f"| {r['id']} | {r.get('name')} | {r.get('distance_km')} | {r.get('runs')} | {r.get('last_run')} | {r.get('median_pace') or (str(r['median_speed_kmh']) + ' km/u' if r.get('median_speed_kmh') else '-')} | {r.get('median_hr')} |" for r in s.routes]
            parts += ["", "## Laatste logentries"]
            parts += [f"### {e['day']}: {e['title']} ({e['author']})\n{e['body'].strip()}" for e in db.list_entries(self.engine, kind="log", limit=5)]
            return "\n".join(parts)
        if name == "list_activities":
            items = list_activities(s.activities, args.get("sport"), args.get("from"), args.get("to"))[: int(args.get("limit") or 30)]
            return activities_md(items) if items else "Geen activiteiten gevonden."
        if name == "get_activity":
            a = activity_detail(str(args.get("id", "")), s.activities, s.streams, s.zones, s.routes)
            if a is None:
                raise ToolError(f"Activiteit {args.get('id')} niet gevonden; gebruik list_activities voor de ids.")
            return activity_md(a)
        if name == "get_trends":
            t = build_trends(s.activities, s.wellness, s.zones, s.streams, today, s.rhr_fallback, plan=db.active_plan(self.engine), last_sync=s.last_sync)
            t["form"] = t["form"][-60:]
            t["recovery_daily"] = t.get("recovery_daily", [])[-60:]  # keeps the agent response small
            t["weekly"] = t["weekly"][-26:]
            return json.dumps(t, ensure_ascii=False)
        if name == "get_plan":
            return plan_md(self._full(db.active_plan(self.engine)))
        if name in ("create_plan", "replace_plan_sessions"):
            items, warnings = parse_table(args.get("table", ""), today.year)
            note = "".join(f"\nLet op: {w}" for w in warnings)
            if not items:
                raise ToolError("Geen sessies in de tabel." + note)
            if args.get("preview"):
                return plan_md({"id": "-", "title": args.get("title", "voorbeeld"), "status": "voorbeeld", "author": who, "sessions": items, "weeks": []}) + note
            if name == "create_plan":
                pid = db.create_plan(self.engine, args["title"], who, args.get("goal"), args.get("race"), args.get("notes"))
                db.add_sessions(self.engine, pid, items)
            else:
                pid = self._plan(args.get("plan_id"))["id"]
                db.replace_sessions(self.engine, pid, items)
            return plan_md(self._full(db.get_plan(self.engine, pid))) + note
        if name == "set_plan_status":
            status = args.get("status")
            status = {nl: code for code, nl in PLAN_STATUS_NL.items()}.get(status, status)  # the Dutch words still work
            if status not in PLAN_STATUS_NL:
                raise ToolError("status is active, finished of stopped")
            plan = self._plan(args.get("plan_id"))
            if status == "active":
                for p in db.list_plans(self.engine):
                    if p["status"] == "active" and p["id"] != plan["id"]:
                        db.set_plan_status(self.engine, p["id"], "finished")
            db.set_plan_status(self.engine, plan["id"], status)
            return f"Schema {plan['id']} ({plan['title']}) staat op {PLAN_STATUS_NL[status]}."
        if name == "add_log":
            kind = args.get("kind") or "log"
            if kind not in ("log", "analysis"):
                raise ToolError("kind is log of analysis")
            day = args.get("day") or today.isoformat()
            try:
                date.fromisoformat(day)
            except ValueError:
                raise ToolError("day als YYYY-MM-DD")
            eid = db.add_entry(self.engine, kind, args["title"], args["body"], author=who, day=day)
            return f"{'Logentry' if kind == 'log' else 'Analyse'} {eid} opgeslagen voor {day}."
        if name == "list_log":
            rows = db.list_entries(self.engine, kind=args.get("kind") or "log", limit=min(int(args.get("limit") or 10), 100))
            return "\n\n".join(f"## {e['day']}: {e['title']} ({e['author']})\n{e['body'].strip()}" for e in rows) or "Nog niets."
        if name in ("get_doc", "update_doc"):
            key = args.get("key")
            if key not in ("profile", "goals"):
                raise ToolError("key is profile of goals")
            if name == "update_doc":
                db.put_document(self.engine, key, args["body"], author=who)
                return f"{key} bijgewerkt."
            doc = db.get_document(self.engine, key)
            return doc["body"] if doc else "(leeg)"
        if name == "suggest_route":
            sport = args.get("sport") or "run"
            opts = suggest(s.routes, s.activities, lambda _: None, float(args["km"]), today, float(args.get("tolerance") or 0.05), sport=sport)
            if not opts:
                return "Geen vaste rondjes gevonden."
            verb = "gefietst" if sport == "ride" else "gelopen"
            return "\n".join(
                f"{i}. {' + '.join(o['names'])}: {o['total_km']} km ({o['deviation_km']:+.1f} km), {o['days_since']} dagen niet {verb}" for i, o in enumerate(opts, 1)
            )
        raise ToolError(f"Onbekende tool {name}")

    def handle(self, msg: dict, who: str) -> dict | None:
        mid, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
        if mid is None:  # notification (initialized, cancelled): nothing to answer
            return None

        def ok(result):
            return {"jsonrpc": "2.0", "id": mid, "result": result}

        if method == "initialize":
            asked = params.get("protocolVersion")
            return ok(
                {
                    "protocolVersion": asked if asked in PROTOCOLS else PROTOCOLS[0],
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "health-tracker", "title": "health-tracker", "version": "1.0"},
                    "instructions": instructions(self.user),
                }
            )
        if method == "ping":
            return ok({})
        if method == "tools/list":
            return ok({"tools": TOOLS})
        if method == "tools/call":
            try:
                text = self.call(params.get("name", ""), params.get("arguments") or {}, who)
                return ok({"content": [{"type": "text", "text": text}], "isError": False})
            except (ToolError, KeyError, ValueError, TypeError) as e:
                return ok({"content": [{"type": "text", "text": f"Fout: {e}"}], "isError": True})
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"method not found: {method}"}}


class RedactToken(logging.Filter):
    """Access logs print the request path; keep the token of /api/mcp/<token> out of them."""

    PATTERN = re.compile(r"(/api/mcp/)[^/?\s\"]+")

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(self.PATTERN.sub(r"\1***", a) if isinstance(a, str) else a for a in record.args)
        if isinstance(record.msg, str):
            record.msg = self.PATTERN.sub(r"\1***", record.msg)
        return True


def make_router(today: Callable[[], date], bearer_user: Callable[[Request], object], token_user: Callable[[str], object | None]) -> APIRouter:
    """`bearer_user(request)` authenticates the header (raises 401) and returns the User; `token_user(token)` checks a
    token from the path. Each request is answered for that user only."""
    r = APIRouter()
    access = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, RedactToken) for f in access.filters):
        access.addFilter(RedactToken())

    async def serve(request: Request, user) -> Response:
        server, who = Server(user, today), user.author
        try:
            body = await request.json()
        except ValueError:
            return JSONResponse({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}}, status_code=400)
        if isinstance(body, list):
            out = [x for x in (server.handle(m, who) for m in body) if x]
            return JSONResponse(out) if out else Response(status_code=202)
        res = server.handle(body, who)
        return JSONResponse(res) if res else Response(status_code=202)

    @r.post("/api/mcp")
    async def mcp(request: Request):
        return await serve(request, bearer_user(request))

    @r.post("/api/mcp/{token}")
    async def mcp_path(token: str, request: Request):
        who = token_user(token)
        if not who:
            raise HTTPException(status_code=401, detail="ongeldig token")
        return await serve(request, who)

    @r.get("/api/mcp")
    @r.get("/api/mcp/{token}")
    def no_stream():
        return Response(status_code=405, headers={"Allow": "POST"})

    return r
