# Development handoff

For any coding agent (Claude, Codex, Copilot, ...) working on this repo. Read this and `docs/WORK.md` before changing anything.
Coaching sessions (talking with Joost about training) follow `AGENTS.md` instead.

Owner: Joost (personal project, not IKEA). Timezone Europe/Amsterdam. UI language: Dutch. Code, comments and commits: English or Dutch, keep what the file already uses.

## What this is

A personal training platform on top of Joost's Garmin data:

- **Data**: Garmin activities (with per-second GPS/HR streams from FIT files), sleep/resting HR/Body Battery/stress, heart-rate zones per sport, goals, training plans, analyses and a log.
- **Website** (leading): dashboard, plan (upload/edit), history with maps, regular routes ("rondjes") with suggestions, trends and records.
- **Agents**: coaching agents read and write the same data (plans, analyses, log) through the API.

Design decisions and their reasons: `docs/2026-09-30-dashboard-design.md` (phase 1) and `docs/2026-09-30-training-repo-design.md` (sync, routes).

## Architecture

Target (being built now, see `docs/WORK.md`):

```
Railway project "training" (EU, europe-west4)
 ├─ Postgres            single source of truth (tools/db.py schema)
 ├─ web                 Dockerfile in repo root: Next.js static export (web/out) served by FastAPI (api/)
 │                       auth: cookie (Joost, browser) or Bearer agent token (agents)
 └─ sync (cron, daily)  tools/sync.py: Garmin -> Postgres, then derived data (zones per activity, routes)
GitHub Joost-Jansen/training (private): code only; every push to main redeploys web
```

Current state (2026-10-01): everything runs on Railway. `sync` (cron) writes Garmin data into Postgres and runs derive; `web` serves the site and API from Postgres. The GitHub Action and the repo's data files are gone (T12); they remain in git history. File-mode code (`FileSink`, `tools/build.py`, `tools/summarize.py` markdown, `tools/migrate_files_to_db.py`) is kept for tests and for rebuilding a database from history.

Region: `web` and `Postgres` run in `us-west2` because the Postgres volume did not move with a region change; moving the volume to `europe-west4` is an open item for Joost (see `docs/WORK.md`).

### Garmin opnieuw koppelen

The sync tries the encrypted tokens in `settings.garmin_tokens` (rotated after every run) first and falls back to `GARMINTOKENS`. If Garmin invalidates the session, the run logs `MISLUKT: garmin` and the site shows it; Joost runs `tools/setup_garmin.py` (sets a fresh `GARMINTOKENS` on `sync`) and the next run uses it and stores its rotation.

### Agents

Coaching agents use `tools/tr.py` with `TRAINING_API_URL` and `TRAINING_API_TOKEN` (Bearer). The token is created by Joost with `tools/set_agent_token.py`; only its SHA-256 hash is stored on Railway (`TRAINING_AGENT_TOKEN_HASH`). Writes by the token are recorded with author `agent`, writes from the browser with author `joost`.

### Railway (no secrets here)

| Item | Value |
|---|---|
| Project | `training`, id `<project-id>`, workspace "Joost Jansen's Projects" |
| Environment | `production`, id `<environment-id>` |
| Service `web` | id `<service-id>`, source `Joost-Jansen/training@main`, healthcheck `/api/health` |
| Service `Postgres` | id `<service-id>` (template `postgres`, volume, us-west2, private network only) |
| Service `sync` | id `<service-id>`, `Dockerfile.sync`, cron `0 4 * * *` (UTC), variables `DATABASE_URL`, `TOKEN_ENCRYPTION_KEY`, `GARMINTOKENS` (initial only; the database keeps the rotated copy, encrypted) |
| Domain | https://your-domain.example |
| Variables on `web` | `PORT=8000`, `HOST=0.0.0.0`, `TZ`, `TRAINING_JWT_SECRET` (signs sessions), `TRAINING_USER` + `TRAINING_PASSWORD_HASH` (only used once: they create the first admin on an empty `users` table; after that logins live in the database), `TOKEN_ENCRYPTION_KEY` (same value as on `sync`; encrypts Garmin sessions), `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `TRAINING_AGENT_TOKEN_HASH` (via `tools/set_agent_token.py`) |

Lessons carried over from `DEPLOY.md`: `HOST` must be `0.0.0.0` (not `::`), set `PORT` explicitly, service config lives on the service (no railway.toml).

## Repo layout

| Path | What |
|---|---|
| `api/` | FastAPI app (`create_app` factory), auth, dashboard aggregation |
| `web/` | Next.js 16 + Tailwind, static export. Layout and design system copied from een eerder project, sage theme |
| `tools/db.py` | Database schema and all reads/writes (SQLAlchemy Core; Postgres in prod, SQLite in tests) |
| `tools/sync.py`, `tools/fit.py`, `tools/store.py` | Garmin sync, FIT stream parsing, record normalisation and merge rules |
| `tools/zones.py`, `tools/analytics.py`, `tools/summarize.py`, `tools/routes.py`, `tools/recommend.py` | Zones, training load (CTL/ATL/TSB), sessions, route recognition, route suggestions |
| `tools/migrate_files_to_db.py` | One-time move of `data/` and the markdown files into the database |
| `tests/` | pytest, one file per module |
| `zones.json` | Seed for the zones setting of a fresh database; the live zones are in the `settings` table |

## Working on it

```bash
cd ~/Local/personal/training
uv venv .venv && uv pip install -p .venv -r requirements-dev.txt
.venv/bin/pytest -q                      # must stay green, no warnings
cd web && npm ci && npm run build        # static export to web/out
```

Local run: build a local database from the repo files with `DATABASE_URL=sqlite:///dev.db .venv/bin/python tools/migrate_files_to_db.py && DATABASE_URL=sqlite:///dev.db .venv/bin/python tools/derive.py` (`dev.db` is git-ignored), create `.env.dev` (git-ignored) with `DATABASE_URL=sqlite:///<absolute path>/dev.db`, `TRAINING_USER`, a bcrypt `TRAINING_PASSWORD_HASH`, a random `TRAINING_JWT_SECRET` and `COOKIE_SECURE=false`, then
`set -a; . ./.env.dev; set +a; .venv/bin/uvicorn api.main:create_app --factory --port 8765` and open http://localhost:8765.
For frontend work with hot reload: run the API on port 8000 and `cd web && npm run dev` (dev rewrites `/api/*` to :8000).

Docker check before touching the Dockerfile: `docker build -t training:test . && docker run --rm -p 18000:8000 training:test`, then `curl localhost:18000/api/health`.

### Rules

1. **Tests first** for backend logic (pytest). Run the full suite before every push.
2. **Secrets never in files, commits or chat.** Passwords/tokens are set by Joost with the scripts in `tools/` (they pipe values straight to Railway/GitHub). `.env.dev` and `.dev-credentials` are git-ignored and local only.
3. **Health data is private.** The repo stays private; every API route except `/api/health` requires auth. Never add a public route that returns activities, GPS or wellness.
4. **Zones** always come from the zones config (`zones.json`, later the `settings` table key `zones`), never from Garmin's `hrTimeInZone_*`. Each activity carries `hr_zones_s` computed with its own sport's zones.
5. **Split runs**: runs with <= 30 min gap are one session (`run_sessions` in `tools/summarize.py`). A run after swim/bike (triathlon/brick) is not comparable to a standalone run.
6. **Frontend**: reuse `web/components/ds`, `Card`, `charts/*` and the CSS tokens in `web/app/globals.css` (`--sage-*`, `--zone-1..5`, `--chart-*`). Soft theme; light and dark mode must both work. Dutch labels.
7. **Commits**: small, descriptive, no AI attribution trailers. Never force-push `main`.
8. Ask Joost (via `docs/WORK.md` or in your own chat) before destructive actions, Railway changes, or anything that deletes data.

## API contract

Multi-user (T19, `docs/2026-10-03-multi-user-design.md`): every route except `/api/health`, `/api/auth/config`, `/api/login`,
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

Sync: `web` runs a daily sync for every connected user after 06:00 Europe/Amsterdam (`api/sync_runner.py`, off with `SYNC_IN_WEB=false`); the Railway cron `sync` (`tools/sync.py run_all_users`) does the same. Garmin sessions are encrypted with `TOKEN_ENCRYPTION_KEY` (fallback: derived from `TRAINING_JWT_SECRET`); give `web` and `sync` the same key.

Existing:

| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{"status":"ok"}` |
| POST | `/api/login` | body `{username,password}`; sets httpOnly cookie `training_session` |
| POST | `/api/logout` | clears cookie |
| GET | `/api/me` | `{username}` |
| GET | `/api/dashboard` | see `web/lib/training.ts` type `Dashboard` |
| GET | `/api/activities?sport=&from=&to=` | `ActivitySummary[]`, newest first |
| GET | `/api/activities/{id}` | summary + `laps` + `track {latlng, zone}` + `series {time, heartrate, velocity, altitude}` (≤ 1500 points) |
| GET | `/api/heatmap?sport=run` | `{tracks: [lat,lon][][]}` (≤ 300 points per track) |
| GET/PUT | `/api/docs/{profile,goals}` | `{key, body, updated_at, updated_by}` |
| GET/POST | `/api/entries?kind=log,analysis` | list / create `{kind, title, body, day?}` |
| GET/POST/PATCH/PUT | `/api/plans`, `/api/plans/active` (`{persistent, plan}`), `/api/plans/{id}`, `/api/plans/{id}/sessions`, POST `/api/plans/import` | plans with matched sessions, see `api/plans.py` and `web/lib/training.ts` `Plan` |
| GET | `/api/zones?period=week\|month&offset=0` | `{period, offset, start, end, label, is_current, zones: {all?, <sport>: {seconds, total_s, pct}}, bounds}`; offset 0 = current period |
| GET | `/api/zones/history?period=week\|month&count=12&sport=all` | `{period, sport, sports, items: [{start, end, label, seconds, total_s, pct}]}` oldest to newest, last = current; count ≤ 104 weeks / 36 months |
| GET | `/api/context` | bundle for coaching agents (profile, goals, zones, active plan, dashboard, routes, recent log/analyses) |

Planned (types go in `web/lib/training.ts`):

| Method | Path | Returns | Task |
|---|---|---|---|
| GET | `/api/trends` (also `recovery_daily: {date, resting_hr, sleep_h, body_battery_high, stress_avg, hrv}[]`, one row per day, oldest first) | `{form: FormRow[], weekly: {week, sports: Record<sport,{km,seconds,count}>}[], z2_pace: {week, pace_s_per_km, runs}[], vo2max: {date, value}[], recovery_weekly: {week, resting_hr, sleep_h, body_battery_high, stress_avg}[], records: Record<"1k"|"5k"|"10k"|"21k", {date, seconds, activity_id}[]>, races: {date, name, sport, seconds, distance_km}[]}` | T5 |
| GET | `/api/routes?sport=run\|ride`, `/api/routes/suggest?km=&sport=&tolerance=&start=`, GET/PATCH `/api/routes/{id}` | routes (`r<n>` runs, `f<n>` rides; `median_pace` for runs, `median_speed_kmh` for rides) and suggestions of one sport (`km` ≤ 300) | live |

### MCP (T9)

`api/mcp.py`: Model Context Protocol over streamable HTTP (stateless, JSON responses, no SSE). `POST /api/mcp` with
`Authorization: Bearer <agent token>`, or `POST /api/mcp/<agent token>` for clients that cannot send headers.
Tools: `get_context`, `list_activities`, `get_activity`, `get_trends`, `get_plan`, `create_plan` and `replace_plan_sessions`
(markdown/CSV table, `preview`), `set_plan_status`, `add_log`, `list_log`, `get_doc`, `update_doc`, `suggest_route`.
Results are markdown text (trends as JSON). Writes are authored `agent`.

Connect:

- Claude Code (laptop): `claude mcp add --transport http training https://your-domain.example/api/mcp --header "Authorization: Bearer $TRAINING_API_TOKEN"`.
- claude.ai / Claude app: Settings, Connectors, Add custom connector, URL `https://your-domain.example/api/mcp/<token>`.
  The token then sits in the connector URL; treat that URL as a password (it is stored in your claude.ai account only).
  Rotate with `tools/set_agent_token.py` if it leaks.

Tested with the official `mcp` Python SDK client (initialize, tools/list, tools/call) and in `tests/test_mcp.py`.

If a contract needs to change, write it in `docs/WORK.md` under Messages and update this table in the same commit.
