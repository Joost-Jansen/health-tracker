# training

Privé trainingsplatform op Joosts Garmin-data: website met dashboard, schema, historie met kaarten, rondjes en trends,
plus een API, CLI en MCP-server waarmee coachende agents dezelfde data lezen en schrijven.

Site: https://your-domain.example (login). Ontwikkelaars: `docs/DEVELOPMENT.md` en `docs/WORK.md`.
Coachingsessies: `AGENTS.md`.

## Hoe het werkt

| Onderdeel | Wat |
|---|---|
| Railway `Postgres` | Alle data: activiteiten met GPS en hartslag, FIT-bestanden, slaap en herstel, zones, profiel, doelen, schema's, analyses, log |
| Railway `sync` (cron 04:00 UTC, 06:00 Amsterdam in de zomer) | Garmin naar Postgres, daarna zones per activiteit en vaste rondjes (`tools/sync.py`, `tools/derive.py`). Garmin-tokens staan versleuteld in de database en worden na elke run vernieuwd |
| Railway `web` | Site en API (`api/`, `web/`); elke push naar `main` deployt opnieuw |
| Agents | `tools/tr.py` of de MCP-server met een agent-token (aan te maken op de site onder Instellingen of met `tools/set_agent_token.py`) |

Garmin heeft geen persoonlijke API-key (het Developer Program is alleen voor bedrijven): de sync logt in met je eigen
account en bewaart alleen de sessie. Strava wordt niet gebruikt; Garmin levert alles, ook GPS uit de FIT-bestanden.

## Eenmalig ingesteld (alleen opnieuw als iets verloopt)

```bash
.venv/bin/python tools/set_dashboard_password.py   # alleen voor de allereerste beheerder; daarna wachtwoorden via de site (Instellingen)
.venv/bin/python tools/set_agent_token.py          # token voor agents (eenmalig getoond)
.venv/bin/python tools/setup_garmin.py             # Garmin-login voor de sync (opnieuw als de site "mislukt: garmin" meldt)
```

Alle drie sturen het geheim direct naar Railway; niets komt in een bestand of in git.

## Lokaal ontwikkelen

```bash
uv venv .venv && uv pip install -p .venv -r requirements-dev.txt
.venv/bin/pytest -q
cd web && npm ci && npm run build
```

Zie `docs/DEVELOPMENT.md` voor een lokale database en het starten van de site.

## Bekende beperkingen

- `garminconnect` is onofficieel en kan breken of door Garmin geblokkeerd worden; de site toont dan "mislukt: garmin" bij de laatste sync.
- HRV en Training Readiness levert Garmin voor dit horloge niet.
- Postgres en de site draaien in `us-west2`; verhuizen naar Amsterdam kan via de Railway-dashboard (volume-migratie).
- De oude bestanden (`data/`, `log/`, `profile.md`, ...) staan alleen nog in de git-geschiedenis; de database is leidend.
