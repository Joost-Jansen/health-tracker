# training

Privé repo met mijn sport-, slaap- en herstelgegevens, doelen, schema's en vaste rondjes.
Een AI-sessie (laptop of Claude Code cloudsessie op mijn telefoon) leest dit via `AGENTS.md`.

## Hoe het werkt

1. Elke ochtend (06:00 zomer, 05:00 winter, Europe/Amsterdam) haalt `.github/workflows/sync.yml` nieuwe data op:
   Garmin: activiteiten, FIT-bestanden (GPS, hartslag, tempo, cadans, hoogte per seconde), slaap, HRV, rusthartslag, Body Battery, readiness.
2. `tools/build.py` maakt daarvan `summary/` en `routes/` (vaste rondjes: minimaal 3 keer dezelfde route).
3. De AI leest profiel, doelen, plan, samenvattingen en rondjes, en logt beslissingen in `log/`.

## Eenmalige setup

Alles hieronder doe je zelf; wachtwoorden en tokens gaan alleen naar Garmin en GitHub secrets.

```bash
cd ~/Local/personal/training
uv venv .venv && uv pip install -p .venv -r requirements-dev.txt
```

1. **Garmin**: er is geen persoonlijke API-key (het Garmin Connect Developer Program is alleen voor bedrijven).
   De sync logt in met je eigen account en bewaart alleen de sessietokens:
   `.venv/bin/python tools/setup_garmin.py`
2. **Strava**: niet in gebruik; Garmin levert alle data. De code blijft staan en slaat zichzelf over zonder secrets.
   Later aanzetten kan met `.venv/bin/python tools/setup_strava.py` (app op https://www.strava.com/settings/api, callback domain `localhost`).
3. **Tokens vernieuwen**: Garmin kan zijn refresh-token vervangen. Maak een fine-grained token op
   https://github.com/settings/personal-access-tokens: alleen repo `Joost-Jansen/training`, permissie *Secrets: Read and write*. Zet hem als secret:
   `GH_TOKEN=$(gh auth token --user Joost-Jansen) gh secret set SECRETS_PAT --repo Joost-Jansen/training`
4. **Eerste backfill**: GitHub → Actions → sync → Run workflow, `since` bijvoorbeeld `2023-01-01`.
   Loopt Garmin tegen een limiet aan, dan gaat de volgende run verder waar deze stopte. Slaap/HRV gaat maximaal 365 dagen terug.
5. **Telefoon**: claude.ai/code → verbind GitHub-account `Joost-Jansen` → kies repo `training`.

## Handig

```bash
.venv/bin/python tools/recommend.py --km 14            # rondje voor 14 km
.venv/bin/python tools/build.py                        # samenvattingen en rondjes opnieuw maken
.venv/bin/pytest -q                                    # tests
```

## Bekende beperkingen

- Garmin heeft geen officiële API voor particulieren; `garminconnect` kan breken of door Garmin geblokkeerd worden.
  De sync meldt dat bovenaan `summary/this-week.md` en de workflow wordt rood; herstel met `tools/setup_garmin.py`.
- Vaste rondjes gebruiken de GPS uit de Garmin FIT-bestanden.
- Max HR 187 is afgeleid van de Garmin-zones, niet gemeten.
