# training

Privé repo met mijn sport-, slaap- en herstelgegevens, doelen, schema's en vaste rondjes.
Een AI-sessie (laptop of Claude Code cloudsessie op mijn telefoon) leest dit via `AGENTS.md`.

## Hoe het werkt

1. Elke ochtend (06:00 zomer, 05:00 winter, Europe/Amsterdam) haalt `.github/workflows/sync.yml` nieuwe data op:
   Garmin (activiteiten, FIT-bestanden, slaap, HRV, rusthartslag, Body Battery, readiness) en Strava (activiteiten met GPS-streams).
2. `tools/build.py` maakt daarvan `summary/` en `routes/` (vaste rondjes: minimaal 3 keer dezelfde route).
3. De AI leest profiel, doelen, plan, samenvattingen en rondjes, en logt beslissingen in `log/`.

## Eenmalige setup

Alles hieronder doe je zelf; wachtwoorden en tokens gaan alleen naar Garmin, Strava en GitHub secrets.

```bash
cd ~/Local/personal/training
uv venv .venv && uv pip install -p .venv -r requirements-dev.txt
```

1. **Garmin**: er is geen persoonlijke API-key (het Garmin Connect Developer Program is alleen voor bedrijven).
   De sync logt in met je eigen account en bewaart alleen de sessietokens:
   `.venv/bin/python tools/setup_garmin.py`
2. **Strava**: gratis API (geen MCP nodig). Maak een app op https://www.strava.com/settings/api
   (naam vrij, website `http://localhost`, Authorization Callback Domain `localhost`), daarna:
   `.venv/bin/python tools/setup_strava.py`
3. **Tokens vernieuwen**: Garmin en Strava kunnen hun refresh-token vervangen. Maak een fine-grained token op
   https://github.com/settings/personal-access-tokens: alleen repo `Joost-Jansen/training`, permissie *Secrets: Read and write*. Zet hem als secret:
   `GH_TOKEN=$(gh auth token --user Joost-Jansen) gh secret set SECRETS_PAT --repo Joost-Jansen/training`
4. **Eerste backfill**: GitHub → Actions → sync → Run workflow, `since` bijvoorbeeld `2023-01-01`.
   Strava heeft een limiet (100 verzoeken per 15 min, 1000 per dag); een grote backfill loopt vanzelf over meerdere runs door.
5. **Telefoon**: claude.ai/code → verbind GitHub-account `Joost-Jansen` → kies repo `training`.

## Handig

```bash
.venv/bin/python tools/recommend.py --km 14            # rondje voor 14 km
.venv/bin/python tools/build.py                        # samenvattingen en rondjes opnieuw maken
.venv/bin/pytest -q                                    # tests
```

## Bekende beperkingen

- Garmin heeft geen officiële API voor particulieren; `garminconnect` kan breken of door Garmin geblokkeerd worden.
  De sync meldt dat bovenaan `summary/this-week.md`; Strava blijft dan de bron voor activiteiten en GPS.
- Vaste rondjes gebruiken de GPS-streams van Strava.
- Max HR 187 is afgeleid van de Garmin-zones, niet gemeten.
