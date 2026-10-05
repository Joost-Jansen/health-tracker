# health-tracker

**A self-hosted training platform on top of your Garmin data, built so that both you and an AI coach (Claude, over MCP) work from the same numbers.**

![Dashboard ("Vandaag") with readiness, upcoming sessions, form and time per heart-rate zone](docs/screenshots/dashboard.jpg)

<sub>All screenshots show the synthetic demo account from [`scripts/seed_demo.py`](scripts/seed_demo.py); no real person's data. The UI is in Dutch and English; these screenshots show the Dutch version.</sub>

health-tracker syncs runs, rides, swims, sleep and recovery from Garmin Connect into Postgres, computes what the watch
app does not (your own heart-rate zones per sport, training load, recurring routes, race predictions) and shows it in a
fast web app. The same data is exposed as an API, a small CLI and a **Model Context Protocol server**, so a coaching agent
can read your training, write a plan or an analysis, and you see it on the site straight away. It is multi-user: anyone
can run their own instance, invite friends, and each account only ever sees its own data.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Notable engineering decisions](#notable-engineering-decisions)
- [Deploy your own](#deploy-your-own)
- [Try it locally with demo data](#try-it-locally-with-demo-data)
- [Development](#development)
- [Connect an AI agent (MCP)](#connect-an-ai-agent-mcp)
- [Project structure](#project-structure)
- [Disclaimer](#disclaimer)
- [License](#license)

## Features

**Today (Vandaag).** A readiness check that compares last night's resting heart rate, sleep and Body Battery with *your own*
baseline and your current form, the next sessions from the active plan (with a suggested route), form (fitness, fatigue,
freshness), time per heart-rate zone per week or month for all sports and per sport, and this week's volume next to the
four-week average.

**Activity detail with map and streams.** Every activity has its GPS track coloured by heart-rate zone, a linked
heart-rate / pace / altitude chart (hover the chart, see the spot on the map), km splits, laps, aerobic decoupling and how
this run compares with earlier runs on the same route. A heatmap tab draws every route you ever ran.

![Activity detail: route coloured by zone, time in zones, insights and the heart-rate, pace and altitude chart](docs/screenshots/activity.jpg)

**Trends.** Fitness/fatigue/form (CTL/ATL/TSB) with race markers, weekly volume per sport, Z2 pace, VO2max, daily and
weekly recovery, record progression, detected races and predicted race times (Riegel). Every chart has a time filter
(4W to all time, custom range), pan and zoom, moving averages, trend lines and peak markers.

![Trends: insights, predicted race times and the form chart](docs/screenshots/trends.jpg)

**Routes (Rondjes).** Recurring routes are recognised automatically, independent of where you started the watch, for runs
and rides. Each route shows its most typical track, every other run drawn lightly underneath, and pace and efficiency
(metres per heartbeat) over time. "A loop of X km" combines known routes into a suggestion for a given distance.

| | |
|---|---|
| ![Route overview with a map per recurring route](docs/screenshots/rondjes.jpg) | ![One route with its pace and efficiency trend](docs/screenshots/rondje.jpg) |

**Training plan (Schema).** Create a plan in the editor, paste a markdown/CSV table, or let an agent write it. Planned
sessions are matched to what you actually did (done, missed, today, planned), with zone compliance per session, weekly
planned-versus-done kilometres, a race countdown and a suggested route for every run or ride.

![Training plan: this week, with each session matched to the activity that was done](docs/screenshots/plan.jpg)

**History, log and analyses.** A filterable activity list per month, a log and an analyses section (markdown), goals and
profile documents. Agents write here too; every entry records who wrote it.

**Settings.** Heart-rate zones per sport as a percentage of max HR (with a suggestion from your own data), profile facts,
the Garmin connection (including MFA), agent tokens with copy-ready MCP instructions, and an admin panel (users, roles,
suspend, reset password, invite codes, registration mode).

| | |
|---|---|
| ![Heart-rate zones per sport and profile](docs/screenshots/zones.jpg) | ![Agent tokens with the MCP connector URL and the claude mcp add command](docs/screenshots/agents.jpg) |

Light and dark mode both work:

![The dashboard in dark mode](docs/screenshots/dashboard-dark.jpg)

## Architecture

| Layer | Stack |
|---|---|
| Web | Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind, TanStack Query, Leaflet with OpenStreetMap tiles, hand-written SVG charts |
| API | Python 3.12, FastAPI, Pydantic, SQLAlchemy Core, bcrypt, PyJWT |
| Data | PostgreSQL in production, SQLite for tests and local runs (same code) |
| Sync | [`garminconnect`](https://github.com/cyberjunky/python-garminconnect) (unofficial) for activities and wellness, `fitdecode` for per-second streams from the original FIT files |
| Agents | MCP over streamable HTTP (`api/mcp.py`), a REST API and a dependency-free CLI (`tools/tr.py`) |
| Hosting | One Docker image (web + API) on Railway with a Postgres service; an optional cron service for the sync |

```mermaid
flowchart LR
    G[Garmin Connect] -->|garminconnect + FIT files| S[sync<br/>tools/sync.py]
    S -->|activities, streams, wellness| DB[(PostgreSQL)]
    S --> D[derive<br/>zones per activity, routes]
    D --> DB
    DB --> API[FastAPI<br/>api/]
    API -->|/api/* JSON| WEB[Next.js static site<br/>served by FastAPI]
    API -->|/api/mcp| MCP[Claude / any MCP client]
    API -->|Bearer token| CLI[tools/tr.py]
    B[Browser] -->|session cookie| WEB
```

**Data flow.** Once a day (and on demand with "Nu synchroniseren") the sync logs in to Garmin with the user's stored
session, fetches new activities, downloads the original FIT file, parses per-second GPS, heart rate, speed, altitude and
cadence, and merges everything into one record per activity (activities from different sources that start within two
minutes of each other are the same activity). Sleep, resting HR, Body Battery, stress and steps are stored per day. Then
`tools/derive.py` recomputes the derived data: time per heart-rate zone with the user's own zones, and the recurring routes.
The API computes everything else (form, trends, plan matching, readiness) from that data on request, with a small per-user
cache that is invalidated after a sync.

The web app is a static export (`web/out`) served by the same FastAPI process, so there is one service, one origin and no
CORS. In development `next dev` proxies `/api/*` to the API.

**Auth and multi-user.** Accounts live in a `users` table (bcrypt password hashes, admin flag, suspended flag). The browser
gets an httpOnly, `SameSite` session cookie carrying a signed JWT (HS256, `TRAINING_JWT_SECRET`); logins are throttled per
username. Agents use personal access tokens created on the site; only their SHA-256 hash is stored. Every data table has a
`user_id` column (with composite primary keys where ids are natural, like activity ids), and every function in
`tools/db.py` that touches user data takes a `Scope(engine, user_id)` instead of an engine, so a query cannot forget the
user. The single auth dependency `current_user` returns the caller with their own data store; routers never see another
user's data. Registration has three modes, set by an admin: `closed` (default), `invite` (one-time codes) and `open`.
On an empty install the first person to register becomes the admin.

**Secrets.** The Garmin password is only used once, to log in; it is never stored. What is stored is Garmin's session
token, encrypted with Fernet (AES-128-CBC + HMAC-SHA256) using `TOKEN_ENCRYPTION_KEY` (`tools/secretbox.py`). Encrypted
values carry a short key id, so a process with a different key reports "reconnect Garmin" instead of failing with a
decryption error. Garmin rotates the session; the rotated copy is re-encrypted after every sync. Without
`TOKEN_ENCRYPTION_KEY` a key is derived from `TRAINING_JWT_SECRET`, which works for a single service but is less clean.

## Notable engineering decisions

- **Own zones, not the watch's.** Time in zone is computed from the raw heart-rate stream with the user's zones per sport
  (percent of max HR, with an "estimated" flag for cycling and swimming), never from Garmin's precomputed zone times, which
  use whatever the watch was set to at the time.
- **Route recognition without a start point.** Tracks are rasterised into grid cells and compared on cell overlap and
  distance, so the same loop matches even when the watch was started somewhere else; each cluster keeps its medoid as the
  "typical" track.
- **Context-aware comparisons.** Runs with 30 minutes or less between them are one session, and a run after a swim or a
  ride (a triathlon or brick) is excluded from pace trends and race predictions instead of being compared with a fresh run.
- **One codebase, two databases.** SQLAlchemy Core with JSON columns runs unchanged on Postgres and SQLite, so the whole
  test suite (270+ tests) runs in seconds against throwaway SQLite files, and the app runs locally without Docker.
- **Schema migration in one transaction.** The move from a single-user to a multi-user schema happens at startup, in one
  transaction, and is idempotent; it was tested on a full copy of production data before it shipped.
- **Agents are first-class users of the API.** The MCP tools return compact markdown designed for a language model
  (a plan as a table with done/missed per session, trends trimmed to what matters), and writes are attributed to `agent`
  so the site shows what the coach changed.
- **Personal values are never hardcoded.** Everything about a person (max HR, PRs, estimated zones, races, readiness
  thresholds) comes from their own data and settings; explanatory copy lives in one text catalog.

## Deploy your own

You need a Garmin Connect account with a watch that records heart rate. Everything else is free-tier friendly.

### Railway

1. **Fork this repository** on GitHub.
2. In [Railway](https://railway.com), create a new project and add a **PostgreSQL** database (New, Database, PostgreSQL).
3. Add a service from your fork (New, GitHub Repo). Railway finds the `Dockerfile` in the root; leave the root directory
   empty. Name the service `web`.
4. On `web`, set the variables from the table below. At minimum:
   `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `TRAINING_JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `PORT=8000`, `HOST=0.0.0.0`.
5. Under Settings, set the healthcheck path to `/api/health`, and under Networking generate a public domain.
6. Deploy. Open the domain and follow **Maak het eerste (beheerder)** (create the first, admin account) on the login page: on an empty database the first
   account becomes the admin. Registration then switches to `closed`; open it or create invite codes under
   Instellingen, Beheer.
7. Connect Garmin under Instellingen, Koppelingen (email, password and the MFA code if Garmin asks). The first sync starts
   right away; after that `web` syncs every connected user daily after 06:00 Europe/Amsterdam.
8. Set your heart-rate zones under Instellingen, Zones en profiel (the page suggests a max HR from your own data).

Optional: a separate **cron service** for the sync, if you prefer it outside the web process. Add a second service from the
same repo with `Dockerfile.sync`, cron schedule `0 4 * * *`, and the same `DATABASE_URL` and `TOKEN_ENCRYPTION_KEY`; then
set `SYNC_IN_WEB=false` on `web`.

Every push to your fork's `main` redeploys `web`.

### Environment variables

| Variable | Service | Required | What it does | How to get a value |
|---|---|---|---|---|
| `DATABASE_URL` | web, sync | yes | SQLAlchemy URL of the database. `postgresql://...` (Railway: `${{Postgres.DATABASE_URL}}`) or `sqlite:///path/to/file.db` | from your database |
| `TRAINING_JWT_SECRET` | web | yes | Signs session cookies. Changing it logs everyone out | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `TOKEN_ENCRYPTION_KEY` | web, sync | recommended | Fernet key that encrypts stored Garmin sessions. Use the same value on every service. Changing it means every user reconnects Garmin | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `PORT` | web | Railway: yes | Port uvicorn listens on (default 8000) | `8000` |
| `HOST` | web | no | Bind address (default `0.0.0.0`). Keep it IPv4; `::` breaks Railway's healthcheck in new environments | `0.0.0.0` |
| `TZ` | web, sync | no | Container time zone (the image defaults to `Europe/Amsterdam`) | e.g. `Europe/Amsterdam` |
| `COOKIE_SECURE` | web | no | `false` allows the session cookie over plain http (local development only). Default `true` | `false` locally |
| `SYNC_IN_WEB` | web | no | `false` turns off the daily sync inside `web` (when you run the cron service instead) | `false` |
| `TRAINING_USER`, `TRAINING_PASSWORD_HASH` | web | no | Alternative bootstrap: creates this admin on an empty database at startup, instead of registering in the browser. Ignored once any user exists | a bcrypt hash: `python -c "import bcrypt, getpass; print(bcrypt.hashpw(getpass.getpass().encode(), bcrypt.gensalt()).decode())"` |
| `TRAINING_AGENT_TOKEN_HASH` | web | no | Legacy: SHA-256 of one agent token for the first admin. Prefer tokens created on the site | `tools/set_agent_token.py` |
| `GARMINTOKENS` | sync | no | Legacy: an initial Garmin session for the first admin, used by the cron service if the stored one is missing or stale. Prefer connecting on the site | `tools/setup_garmin.py` |

Never commit any of these; set them in Railway (or a git-ignored `.env.dev` locally).

### Docker (any host)

```bash
docker build -t health-tracker .
docker run -d -p 8000:8000 \
  -e DATABASE_URL=postgresql://user:password@db-host:5432/health \
  -e TRAINING_JWT_SECRET=<random hex> \
  -e TOKEN_ENCRYPTION_KEY=<fernet key> \
  health-tracker
curl localhost:8000/api/health   # {"status":"ok"}
```

For a quick try without Postgres, `-e DATABASE_URL=sqlite:////tmp/health.db` works too (the data is gone with the
container). Put a TLS-terminating proxy in front for anything public; the cookie is `Secure` by default.

## Try it locally with demo data

```bash
git clone https://github.com/Joost-Jansen/health-tracker && cd health-tracker
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
(cd web && npm ci && npm run build)          # static site into web/out

# a fresh SQLite database with the synthetic "demo" user (about six months of training)
DATABASE_URL=sqlite:///demo.db .venv/bin/python scripts/seed_demo.py   # prints the demo password

TRAINING_JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))") \
COOKIE_SECURE=false SYNC_IN_WEB=false DATABASE_URL=sqlite:///demo.db \
.venv/bin/uvicorn api.main:create_app --factory --port 8000
```

Open http://localhost:8000 and log in as `demo`. The seed script creates runs, rides and pool swims with per-second
streams along a few invented loops east of Utrecht, daily sleep and recovery values, zones, a 16-week marathon plan, log
entries and an analysis, and then runs the same derive step as a real sync. Options: `--days`, `--end`, `--password`
(or `DEMO_PASSWORD`), `--reset`. Every value is generated from a fixed random seed; nothing comes from a real person.

## Development

```bash
.venv/bin/python -m pytest -q          # backend: API, database, sync, zones, routes, plans, MCP (SQLite, no network)
cd web && npx tsc --noEmit             # frontend type check
cd web && npm run build                # static export, also run by the Docker build
cd web && npm run dev                  # hot reload on :3000, proxies /api/* to the API on :8000
```

Garmin is never called in tests: the sync takes an injectable client and FIT reader. Developer notes are in
[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md); design documents are in [`docs/`](docs).

## Connect an AI agent (MCP)

The site is an MCP server at `/api/mcp` (streamable HTTP, stateless, JSON responses). Create a token under
Instellingen, Agents; it is shown once. Tools: `get_context`, `list_activities`, `get_activity`, `get_trends`, `get_plan`,
`create_plan`, `replace_plan_sessions`, `set_plan_status`, `add_log`, `list_log`, `get_doc`, `update_doc`, `suggest_route`.

- **Claude app / claude.ai:** Settings, Connectors, Add custom connector, URL `https://<your-domain>/api/mcp/<token>`.
  The token is part of that URL, so treat the URL as a password; revoke the token on the site if it leaks.
- **Claude Code:**

  ```bash
  claude mcp add --transport http --scope user health-tracker https://<your-domain>/api/mcp \
    --header "Authorization: Bearer <token>"
  ```

- **CLI / scripts:** `TRAINING_API_URL=https://<your-domain> TRAINING_API_TOKEN=<token> python tools/tr.py context`
  (standard library only). See `python tools/tr.py --help` for plans, log entries, analyses and documents.

The MCP server sends its own instructions to the assistant (see `instructions()` in `api/mcp.py`): start a session with
`get_context`, separate observation, interpretation and advice, compute instead of estimate, and end with a log entry.

## Project structure

```
api/                 FastAPI app (create_app factory): auth and users, dashboard, history, trends, plans, routes,
                     zones, onboarding, Garmin connection and in-process sync scheduler, MCP server
tools/               database schema and queries (db.py), Garmin sync (sync.py, fit.py, store.py), derived data
                     (derive.py, zones.py, routes.py, recommend.py, analytics.py), encryption (secretbox.py), CLI (tr.py)
web/                 Next.js app: app/(app)/<page> per screen (app/(redirects) for old Dutch paths), components
                     (design system, charts, maps, plan, zones)
scripts/seed_demo.py synthetic demo account
tests/               pytest, one file per module
docs/                developer notes, design documents, screenshots
Dockerfile           web + API image (Node build stage, Python runtime)
Dockerfile.sync      optional cron image for the sync
```

## Disclaimer

health-tracker is a personal project, **not a medical device and not medical advice**. Readiness, form, zones and race
predictions are estimates from wrist-based sensor data and simple models. If you are ill, injured or notice an unusual
heart rate, see a doctor or physiotherapist.

The Garmin sync uses [`garminconnect`](https://github.com/cyberjunky/python-garminconnect), an **unofficial** library
that logs in like the Garmin Connect app. It is not affiliated with or endorsed by Garmin, can break when Garmin changes
its service, and you use it with your own account at your own risk. Garmin, Garmin Connect and Body Battery are
trademarks of Garmin Ltd.

## License

[MIT](LICENSE) (c) 2026 Joost Jansen.
