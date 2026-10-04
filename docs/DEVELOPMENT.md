# Development

How the code is organised, how to run it, and the rules the code follows. Deployment and environment variables are in
the README ("Deploy your own"). UI language is Dutch; code, comments and commits are English or Dutch, keep what the file
already uses.

## Architecture

```
web (Dockerfile in repo root)   Next.js static export (web/out) served by FastAPI (api/)
                                 auth: session cookie (browser) or Bearer agent token (scripts, MCP clients)
                                 in-process daily Garmin sync for every connected user (api/sync_runner.py)
Postgres                         single source of truth (tools/db.py schema); SQLite works for local runs and tests
sync (optional cron)             Dockerfile.sync: tools/sync.py run_all_users, same work as the in-process sync
```

Garmin sessions are stored per user, encrypted with `TOKEN_ENCRYPTION_KEY` (fallback: derived from `TRAINING_JWT_SECRET`);
give `web` and `sync` the same key. If Garmin invalidates a session, the user reconnects under Settings, Connections.

## Repo layout

| Path | What |
|---|---|
| `api/` | FastAPI app (`create_app` factory), auth, dashboard aggregation |
| `web/` | Next.js 16 + Tailwind, static export. Own design system, sage theme |
| `tools/db.py` | Database schema and all reads/writes (SQLAlchemy Core; Postgres in prod, SQLite in tests) |
| `tools/sync.py`, `tools/fit.py`, `tools/store.py` | Garmin sync, FIT stream parsing, record normalisation and merge rules |
| `tools/zones.py`, `tools/analytics.py`, `tools/summarize.py`, `tools/routes.py`, `tools/recommend.py` | Zones, training load (CTL/ATL/TSB), sessions, route recognition, route suggestions |
| `scripts/seed_demo.py` | Demo user with six months of synthetic data |
| `tests/` | pytest, one file per module |

## Working on it

```bash
uv venv .venv && uv pip install -p .venv -r requirements-dev.txt
.venv/bin/pytest -q                      # must stay green, no warnings
cd web && npm ci && npm run build        # static export to web/out
```

Local run: `DATABASE_URL=sqlite:///dev.db .venv/bin/python scripts/seed_demo.py` (demo data; `dev.db` is git-ignored), create
`.env.dev` (git-ignored) with `DATABASE_URL=sqlite:///<absolute path>/dev.db`, a random `TRAINING_JWT_SECRET` and
`COOKIE_SECURE=false`, then `set -a; . ./.env.dev; set +a; .venv/bin/uvicorn api.main:create_app --factory --port 8765` and open
http://localhost:8765.
For frontend work with hot reload: run the API on port 8000 and `cd web && npm run dev` (dev rewrites `/api/*` to :8000).

Docker check before touching the Dockerfile: `docker build -t health-tracker:test . && docker run --rm -p 18000:8000 health-tracker:test`, then `curl localhost:18000/api/health`.

### Rules

1. **Tests first** for backend logic (pytest). Run the full suite before every push.
2. **Secrets never in files or commits.** `.env.dev` and `.dev-credentials` are git-ignored and local only.
3. **Health data is private.** Every API route except `/api/health`, `/api/auth/config`, `/api/login` and `/api/register`
   requires auth and returns only the caller's data. Never add a public route that returns activities, GPS or wellness.
4. **Zones** always come from the user's zones setting (`settings` key `zones`), never from Garmin's `hrTimeInZone_*`.
   Each activity carries `hr_zones_s` computed with its own sport's zones.
5. **Split runs**: runs with <= 30 min gap are one session (`run_sessions` in `tools/summarize.py`). A run after swim/bike
   (triathlon/brick) is not comparable to a standalone run.
6. **No personal text in the UI**: explanations about health and performance live in `web/lib/texts.ts` and take the
   user's own numbers as parameters.
7. **Frontend**: reuse `web/components/ds`, `Card`, `charts/*` and the CSS tokens in `web/app/globals.css` (`--sage-*`,
   `--zone-1..5`, `--chart-*`). Light and dark mode must both work, and phone width without horizontal scroll.
8. **Commits**: small and descriptive.

## API contract

Every route except `/api/health`, `/api/auth/config`, `/api/login`,
`/api/register` needs the session cookie or `Authorization: Bearer <agent token>`, and sees only the caller's data.
`current_user` (api/users.py) returns a `User` (id, username, is_admin, via cookie|agent, `store` = that user's `DataStore`,
`scope` = `db.Scope`); routers read from it, never from a global store. Every `tools/db.py` function for user data takes a
`Scope(engine, user_id)`.

| Method | Path | What |
|---|---|---|
| GET | `/api/auth/config` | `{registration: closed\|invite\|open, first_user}` (public) |
| POST | `/api/register` | `{username, password, display_name?, invite?}`; first user on an empty install becomes admin |
| GET | `/api/me` | `{id, username, display_name, is_admin, via}` |
| PATCH | `/api/account` | `{display_name}` |
| POST | `/api/account/password` | `{current, new}` |
| GET/PATCH/POST/DELETE | `/api/admin/users`, `/api/admin/users/{id}` (`{is_admin?, suspended?}`), `/api/admin/users/{id}/reset-password`, `DELETE /api/admin/users/{id}?confirm=<username>` | admins only (cookie) |
| GET/PATCH | `/api/admin/settings` | `{registration, invites[]}` |
| POST/DELETE | `/api/admin/invites`, `/api/admin/invites/{code}` | invite codes (`{days}`) |
| GET | `/api/connections` | `{garmin: {connected, readable, connected_at, last_sync, last_failed, syncing}}` |
| POST | `/api/connections/garmin` | `{email, password}` -> `{status: connected\|mfa}`; password only goes to Garmin, the session is stored encrypted |
| POST | `/api/connections/garmin/mfa` | `{code}` (within 10 min) |
| DELETE | `/api/connections/garmin` | disconnect (data stays) |
| POST | `/api/connections/sync` | sync now in the background |
| GET/PUT | `/api/settings/zones` | `{percent[4], sports: {run\|ride\|swim: {max_hr, estimate}}}`; bounds computed, derive re-runs; GET adds `suggested_max` from the user's data |
| GET/PUT | `/api/settings/profile` | `{birth_year?, weight_kg?, height_cm?, resting_hr?}` |
| GET/PUT | `/api/onboarding` | `{choice: site\|claude\|null, done, step, hidden[], visited[], status, steps: {garmin, sync, zones, profile, explore, agent, goals, plan}, required_done}`; PUT takes only what changes: `{choice?, done?, step?, hide?: checklist\|data, visit?: dashboard\|trends\|rondjes\|historie}` |

Sync: `web` runs a daily sync for every connected user after 06:00 Europe/Amsterdam (`api/sync_runner.py`, off with `SYNC_IN_WEB=false`); the optional cron `sync` (`tools/sync.py run_all_users`) does the same.

Existing:

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{"status":"ok"}` |
| POST | `/api/login` | body `{username,password}`; sets httpOnly cookie `training_session` |
| POST | `/api/logout` | clears cookie |
| GET | `/api/me` | `{username}` |
| GET | `/api/dashboard` | see `web/lib/training.ts` type `Dashboard` Also: `form.until`, `form.stopped_at_sync` (series ends at the last synced day when the sync is older than yesterday), `form.load {band: low\|build\|high\|unknown, acwr, ramp, reason, thresholds}`; `recent[]` may carry `parts`, `activity_ids`, `race`; with an active plan `plan_week {start, end, sports, sessions}` and `race {date, days, name, distance_km, sport}`; `readiness {verdict, date, no_night, signals: [{key, value, level, note: {code, params}}]}` (codes, no sentences). |
| GET | `/api/activities?sport=&from=&to=` | `ActivitySummary[]`, newest first; runs with implausible wrist HR carry `hr_flags: [low_start\|flat\|dropout]` |
| GET | `/api/activities/{id}` | summary + `laps` + `track {latlng, zone}` + `series {time, heartrate, velocity, altitude}` (≤ 1500 points) |
| GET | `/api/heatmap?sport=run` | `{tracks: [lat,lon][][]}` (≤ 300 points per track) |
| GET/PUT | `/api/docs/{profile,goals}` | `{key, body, updated_at, updated_by}` |
| GET/POST | `/api/entries?kind=log,analysis` | list / create `{kind, title, body, day?}` |
| GET/POST/PATCH/PUT | `/api/plans`, `/api/plans/active` (`{persistent, plan}`), `/api/plans/{id}`, `/api/plans/{id}/sessions`, POST `/api/plans/import` | plans with matched sessions, see `api/plans.py` and `web/lib/training.ts` `Plan`; a session whose `route_id` is one of the user's loops gets `route: {id, name, distance_km}` instead of `route_suggestion` |
| GET | `/api/zones?period=week\|month&offset=0` | `{period, offset, start, end, label, is_current, zones: {all?, <sport>: {seconds, total_s, pct}}, bounds}`; offset 0 = current period |
| GET | `/api/zones/history?period=week\|month&count=12&sport=all` | `{period, sport, sports, items: [{start, end, label, seconds, total_s, pct}]}` oldest to newest, last = current; count ≤ 104 weeks / 36 months |
| GET | `/api/context` | bundle for AI assistants (profile, goals, zones, active plan, dashboard, routes, recent log/analyses) |

More (types in `web/lib/training.ts`):

| Method | Path | Returns |
|---|---|---|
| GET | `/api/trends` (also `recovery_daily: {date, resting_hr, sleep_h, body_battery_high, stress_avg, hrv}[]`, one row per day, oldest first) | `{form: FormRow[], weekly: {week, sports: Record<sport,{km,seconds,count}>}[], z2_pace: {week, pace_s_per_km, runs}[], vo2max: {date, value}[], recovery_weekly: {week, resting_hr, sleep_h, body_battery_high, stress_avg}[], records: Record<"1k"|"5k"|"10k"|"21k", {date, seconds, activity_id}[]>, races: {date, name, sport, seconds, distance_km}[]}` Also: `recent_records`, `goal {km, seconds, date, text}` (from the active plan; null without one), `longest_runs`, `hr_flags [{id, date, name, reasons}]`, `form_until`, `stopped_at_sync`; `records[*].source: split\|race`; `insights [{level, code, params}]` (codes, no sentences). |
| GET | `/api/routes?sport=run\|ride`, `/api/routes/suggest?km=&sport=&tolerance=&start=`, GET/PATCH `/api/routes/{id}` | routes (`r<n>` runs, `f<n>` rides; `median_pace` for runs, `median_speed_kmh` for rides) and suggestions of one sport (`km` ≤ 300); summaries include `distance_variants` |
| GET | `/api/routes/candidates?sport=run\|ride` | `{candidates: [{sport, outcome: same\|candidate, confidence, reason_code, reason, a, b}], last_sync}`; each side `{id, kind: route\|activity, name, distance_km, runs, last_run?\|date?, track (≤ 150 points)}`; answered pairs are left out |
| POST | `/api/routes/candidates` | body `{a, b, same}`; records the decision (setting `route_decisions`), applies a merge right away; returns `{applied, applied_on_next_sync, route, remaining}`; 404 if the pair is not open |

### MCP

`api/mcp.py`: Model Context Protocol over streamable HTTP (stateless, JSON responses, no SSE). `POST /api/mcp` with
`Authorization: Bearer <agent token>`, or `POST /api/mcp/<agent token>` for clients that cannot send headers.
Tools: `get_context`, `list_activities`, `get_activity`, `get_trends`, `get_plan`, `create_plan` and `replace_plan_sessions`
(markdown/CSV table, `preview`), `set_plan_status`, `add_log`, `list_log`, `get_doc`, `update_doc`, `suggest_route`.
Results are markdown text (trends as JSON). Writes are authored `agent`.

Connect: see "Connect an AI assistant" in the README. The token can sit in the connector URL; treat that URL as a
password and delete the token under Settings, Agents if it leaks.

Tested with the official `mcp` Python SDK client (initialize, tools/list, tools/call) and in `tests/test_mcp.py`.

If a contract changes, update this table in the same commit.
