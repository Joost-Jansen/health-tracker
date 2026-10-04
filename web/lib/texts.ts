// Alle uitlegteksten over gezondheid en prestaties, op één plek (T19). Niets hierin gaat over één bepaalde persoon:
// wat over de gebruiker gaat (zones, max hartslag, welke sporten geschat zijn, waarop een voorspelling is gebaseerd)
// komt als parameter uit diens eigen instellingen en data. Pagina's halen hun tekst hier, niet uit een eigen string.

import { fmtClock, fmtDate, sportLabel, type HrFlagReason, type InsightCode, type RecordKey } from "@/lib/training";

/** Getal met decimale komma, zonder ",0" aan het eind. */
const num = (n: number, digits = 1) => n.toFixed(digits).replace(".", ",").replace(/,0+$/, "");
const fmtDayNl = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const RECORD_NAME: Record<RecordKey, string> = { "1k": "1 km", "5k": "5 km", "10k": "10 km", "21k": "halve marathon" };
/** Een doelafstand in woorden: marathon, halve marathon of "15 km". */
const goalName = (km: number) => (Math.abs(km - 42.195) < 0.3 ? "marathon" : Math.abs(km - 21.0975) < 0.2 ? "halve marathon" : `${num(km)} km`);

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} en ${items[items.length - 1]}`);

export const T = {
  noMedicalAdvice: "Geen medisch advies: voel je je ziek of heb je pijn, train dan niet en vraag een arts of fysio.",

  readinessBasis: "Vergelijkt afgelopen nacht met je eigen normaal (rusthartslag, slaap) en je vorm.",

  /** Onder de zonebalken: welke zones zijn een schatting, volgens de eigen zone-instellingen. */
  zonesFootnote(estimated: string[], set: string[]): string {
    if (!set.length) return "Je hebt nog geen hartslagzones ingesteld (Instellingen, Zones en profiel).";
    const base = "Alle sporten telt elke sport met zijn eigen zones.";
    if (!estimated.length) return base;
    const names = list(estimated.map((s) => sportLabel(s).toLowerCase()));
    return `${base} Zones voor ${names} zijn een schatting.`;
  },

  zoneEstimate: (sport: string) => `Zones voor ${sportLabel(sport).toLowerCase()} zijn een schatting (Instellingen, Zones en profiel).`,

  /** Onder de status als kop ("Fris", "In balans" …), dus zonder die naam te herhalen. */
  formStatus: {
    fris: "Er is ruimte voor een zware training of een wedstrijd.",
    "in balans": "Belasting en herstel houden elkaar in evenwicht.",
    vermoeid: "Je bouwt op; plan binnenkort een rustiger dag.",
    "zeer vermoeid": "De belasting is hoog tegenover wat je gewend bent; neem rust.",
  } as Record<string, string>,

  formMethod: "Belasting per training = TRIMP uit gemiddelde hartslag, rusthartslag en je eigen max per sport. Fitheid is het 42-daags gemiddelde, vermoeidheid 7 dagen, vorm het verschil tussen die twee aan het eind van gisteren (de stand waarmee je vandaag begint).",

  /** Waarom fitheid min vermoeidheid van vandaag niet precies de vorm is. */
  formTsb: "Vorm = fitheid min vermoeidheid van gisteren: de stand aan het begin van vandaag.",

  formChartNote: "Het gemiddelde geldt voor de vorm; ruitjes zijn wedstrijden en tests.",

  /** De data is ouder dan een dag: wat de site sindsdien niet weet. */
  syncStale: (days: number) =>
    `De laatste sync is ${days} dagen oud. Trainingen en herstel van daarna ontbreken nog; fitheid, vermoeidheid en vorm blijven staan op de laatst gesyncte dag.`,

  /** Onder Volume deze week: de lopende week is nog niet af. */
  volumeWeek: (through: string) => `Deze week tot en met ${through}; het gemiddelde is over de vier hele weken ervoor.`,

  /** Een wedstrijd over (ongeveer) een recordafstand die sneller was dan de snelste split: het horloge mat de afstand net te kort. */
  recordRace: "Snelste wedstrijd over deze afstand. Het horloge mat net minder, daardoor staat hij niet bij de splits.",

  z2Pace: "Gemiddeld tempo van alle seconden in Z2 per week, alleen losse buitenruns (geen loopband, geen run na zwemmen of fietsen). Sneller bij dezelfde hartslag wijst op een betere aerobe basis.",

  vo2max: "Schatting van het horloge na buitenruns met GPS en hartslag.",

  records: "Snelste stuk binnen een run (Garmins splits), geen officiële wedstrijdtijd.",

  races: (r: { race_min_km: number; race_hard_pct: number }) =>
    `Herkend aan zwemmen, fietsen en lopen op één dag, een naam met race, wedstrijd of marathon, of een run van ${r.race_min_km}+ km met ${r.race_hard_pct}%+ van de tijd in Z4-Z5. Tijd is bewegende tijd zonder wissels.`,

  prediction: (days: number) =>
    `Riegel-formule vanaf je langste snelle inspanning van de laatste ${days} dagen. Voor de marathon optimistisch zonder lange duurlopen van 30+ km; reken dan op enkele minuten meer.`,

  afterMultisport: (before: string[]) =>
    `Deze run volgde op ${list(before.map((s) => sportLabel(s).toLowerCase()))} dezelfde dag. Vergelijk hartslag en tempo niet met een losse run.`,

  driftGood: "Tempo per hartslag bleef in de tweede helft vrijwel gelijk: de aerobe basis houdt dit tempo en deze duur.",
  driftHigh: "In de tweede helft kostte hetzelfde tempo meer hartslag (boven 5%). Oorzaak kan warmte, vocht, vermoeidheid of een te hoog starttempo zijn.",
  driftMethod: "Drift = daling van snelheid per hartslag tussen de eerste en de tweede helft (alleen bewegend).",

  easySession: (pct: number, z2Top: number) => `${pct}% in Z1-Z2 (onder ${z2Top} bpm volgens je eigen zones): de intensiteit die de basis bouwt.`,
  hardSession: (pct: number) => `${pct}% in Z4-Z5. Plan de dag erna rustig.`,

  efficiency: (sport: string) =>
    "Snelheid gedeeld door hartslag. Omhoog = meer meters per slag = fitter. " +
    (sport === "ride"
      ? "Minder gevoelig voor hoe hard je fietste dan snelheid, maar wind en groepjes tellen mee: vergelijk vooral ritten van dezelfde soort."
      : "Minder gevoelig voor hoe hard je liep dan tempo, maar niet ongevoelig: vergelijk vooral runs van dezelfde soort."),

  routeRule: (sport: "run" | "ride", minCount: number) =>
    sport === "ride"
      ? `Een fietsrondje is herkend als je minstens ${minCount} keer grotendeels dezelfde wegen fietste, ook als je de tracker op een andere plek aanzette. Dikke lijn: de meest typische keer; dun: de andere keren.`
      : `Een rondje is herkend als je minstens ${minCount} keer grotendeels dezelfde wegen liep, waar je ook startte. Dikke lijn: de meest typische keer; dun: de andere keren.`,
  routeTrend: "Trend: efficiëntie (meter per hartslag), mediaan van de laatste 5 keer tegen alle keren daarvoor.",

  /** Rondjes (T20): automatisch herkennen, varianten en de vraag of twee rondjes hetzelfde zijn. */
  routes: {
    auto: (lastSync?: string | null) =>
      `Rondjes worden na elke sync automatisch herkend${lastSync && lastSync !== "nog nooit" ? ` (laatste sync: ${lastSync})` : ""}.`,
    reviewIntro:
      "Deze lijken op elkaar, maar niet genoeg om ze zelf samen te voegen. Zelfde rondje? Dan tellen ze voortaan samen, als varianten van één rondje. Je antwoord wordt onthouden.",
    reason: {
      same: "Lijkt hetzelfde rondje.",
      other_start: "Zelfde rondje, ander startpunt.",
      extra_loop: "Zelfde rondje, de langste met een extra lus of omweg.",
      partly_other_way: "Grotendeels hetzelfde rondje, deels een andere weg.",
    } as Record<string, string>,
    pending: (n: number, sport: string) =>
      `${n === 1 ? "Eén paar" : `${n} paren`} ${sport === "ride" ? "fietsrondjes" : "rondjes"} ${n === 1 ? "lijkt" : "lijken"} op elkaar. Kijk even of het hetzelfde rondje is.`,
    nextSync: "Onthouden. Het rondje wordt bij de volgende sync bijgewerkt.",
    variants: (kms: string[]) => `${kms.length} varianten: ${list(kms)} km`,
    variantsHelp: "Hetzelfde rondje in verschillende lengtes, bijvoorbeeld met een extra lus, een omweg of een andere start.",
  },

  /** Schema (T24): uitleg bij de vergelijking van gepland en gedaan. */
  plan: {
    zoneFit: (pct: number, zone: string) => {
      const top = Math.max(...(zone.match(/[1-5]/g) ?? ["5"]).map(Number));
      return top <= 2 ? `${pct}% op of onder ${zone}` : `${pct}% in ${zone}`;
    },
    zoneFitMethod:
      "Tijd per hartslagzone volgens je eigen zones. Rustige sessies (tot en met Z2): de tijd op of onder de doelzone telt, want rustiger is niet erg. Kwaliteit (Z3 en hoger): de tijd binnen de doelzone telt.",
    matching:
      "Een sessie telt als gedaan zodra er die dag een activiteit van dezelfde sport is. Een run in stukken (minder dan 30 minuten pauze) telt als één sessie.",
    volume: "Kilometers per week: gepland tegen gedaan. Sessies zonder afstand (alleen een duur) tellen hier niet mee.",
  },

  /** Onboarding (T23): de uitleg over gezondheid en prestaties in de rondleiding, de checklist en Help. */
  onboarding: {
    zonesWhy:
      "Alles op de site rekent met je eigen hartslagzones per sport: de tijd per zone, de belasting en je vorm, en de kleuren op de kaart. Een zone is een percentage van je maximale hartslag; de grenzen rekent de site uit.",
    zonesHow:
      "Weet je je max niet uit een test, begin dan met de hoogste hartslag die je horloge bij een harde inspanning mat. Voor fietsen en zwemmen ligt de max meestal lager dan bij lopen; zonder eigen waarde schat de site die en zegt dat erbij.",
    maxSuggestion: (sport: string, bpm: number) =>
      `Voorstel uit je eigen data: de hoogste hartslag bij ${sportLabel(sport).toLowerCase()} is ${bpm} bpm (losse pieken van de polssensor niet meegeteld).`,
    zonesSet: (sports: string[], estimated: string[]) =>
      `Ingesteld voor ${list(sports.map((s) => sportLabel(s).toLowerCase()))}.` +
      (estimated.length ? ` ${list(estimated.map((s) => sportLabel(s).toLowerCase()))}: schatting.` : ""),
    profileWhy:
      "Geboortejaar, gewicht, lengte en rusthartslag. De rusthartslag gebruikt de site voor de belasting per training op dagen zonder slaapdata van je horloge.",
    firstSync: (days: number) =>
      `De eerste keer haalt de site de trainingen en het herstel (slaap, rusthartslag, Body Battery) van de afgelopen ${days} dagen op. Daarna elke ochtend vanzelf wat er nieuw is.`,
    wristHr: "Hartslag komt meestal van de pols: bij een vreemde piek of dip in een training is het de moeite waard het verloop te bekijken voor je conclusies trekt.",
  },

  /** Vandaag (dashboard). De API geeft codes en getallen; de zinnen staan hier. */
  vandaag: {
    readiness: {
      title: "Klaar voor vandaag?",
      verdict: { klaar: "Klaar voor training", "rustig aan": "Rustig aan", herstel: "Herstel eerst", onbekend: "Geen nachtdata" } as Record<string, string>,
      advice: {
        herstel: "Meerdere signalen van vermoeidheid. Maak er een rustdag of heel rustige training van.",
        "rustig aan": "Eén of twee signalen wijken af. Train gerust, maar houd het rustig (Z1-Z2) of kort.",
        klaar: "Herstel ziet er normaal uit. Geplande training kan zoals bedoeld.",
      } as Record<string, string>,
      /** Zonder nachtdata en zonder afwijkende signalen: wat er wel is, is in orde. */
      unknown: (labels: string[]) => `${list(labels)} ${labels.length > 1 ? "zijn" : "is"} in orde; zonder nachtdata is herstel lastig te beoordelen.`,
      noNight: "Geen slaap of rusthartslag van afgelopen nacht (horloge niet gedragen of nog niet gesynct).",
      label: { resting_hr: "Rusthartslag", sleep_h: "Slaap", body_battery: "Body Battery", tsb: "Vorm" } as Record<string, string>,
      value(key: string, v: number): string {
        if (key === "resting_hr") return `${v} bpm`;
        if (key === "sleep_h") return `${v.toFixed(1).replace(".", ",")} u`;
        if (key === "tsb") return `${v > 0 ? "+" : ""}${Math.round(v)}`;
        return String(v);
      },
      note(code: string, p: { delta?: number; baseline?: number; score?: number; date?: string; days_ago?: number }): string {
        if (code === "vs_baseline") return `${(p.delta ?? 0) >= 0 ? "+" : ""}${p.delta ?? 0} t.o.v. normaal (${p.baseline})`;
        if (code === "sleep")
          return [p.score ? `score ${p.score}` : "", p.baseline ? `normaal ${p.baseline.toFixed(1).replace(".", ",")} u` : ""].filter(Boolean).join(", ");
        if (code === "highest") return p.days_ago === 0 ? "hoogste vandaag" : p.days_ago === 1 ? "hoogste gisteren" : `hoogste op ${fmtDate(p.date ?? "")}`;
        if (code === "form_yesterday") return "fitheid min vermoeidheid van gisteren";
        return "";
      },
    },

    /** Belasting: vermoeidheid (7 dagen) tegenover fitheid (42 dagen), zie api/dashboard.py load_indicator. */
    load: {
      title: "Belasting",
      info: "Uitleg belasting",
      band: { low: "Rustig", build: "Opbouw", high: "Pas op", unknown: "Nog onbekend" } as Record<string, string>,
      explain: {
        low: "Je laatste week was lichter dan je gewend bent: ruimte om te herstellen, of je fitheid zakt langzaam.",
        build: "Je laatste week past bij wat je gewend bent: een goede basis om rustig op te bouwen.",
        unknown: "Na ongeveer vier weken training met hartslag is te zien hoe je laatste week zich verhoudt tot wat je gewend bent.",
      } as Record<string, string>,
      highRatio: (high: string) => `Je laatste week was flink zwaarder dan je gewend bent (boven ${high}). Bouw rustiger op of plan een lichte dag.`,
      highRamp: (ramp: string) => `Je fitheid stijgt snel (+${ramp} in 7 dagen). Bouw rustiger op of plan een lichte dag.`,
      ratio: "Laatste week tegenover gewend",
      ramp: "Fitheid in 7 dagen",
      scale: { low: "rustig", build: "opbouw", high: "pas op" },
      method: (low: string, high: string, rampHigh: string) =>
        `Vermoeidheid (7 dagen) gedeeld door fitheid (42 dagen). Tussen ${low} en ${high} past de belasting bij wat je gewend bent; die grenzen komen uit sportonderzoek naar trainingsbelasting. Fitheid die meer dan ${rampHigh} per week stijgt, is snelle opbouw. Een richtlijn, geen voorspelling.`,
    },

    /** Schema deze week: gepland tegenover gedaan. */
    planWeek: {
      title: "Schema deze week",
      info: "Uitleg schema deze week",
      more: "Schema",
      empty: "Geen sessies gepland deze week.",
      done: (done: number, total: number) => `${done} van ${total} ${total === 1 ? "sessie" : "sessies"} gedaan`,
      missed: (n: number) => `${n} gemist`,
      upcoming: (n: number) => `${n} te gaan`,
      unsynced: (n: number) => `${n} nog niet gesynct`,
      ofPlanned: (done: string, planned: string) => `${done} van ${planned}`,
      method: "Gedaan telt alleen activiteiten die bij een sessie van het schema horen (zelfde sport, zelfde dag).",
    },

    /** Aftellen naar de eerstvolgende wedstrijd van het schema. */
    race: {
      today: "Vandaag",
      days: (n: number) => (n === 1 ? "dag" : "dagen"),
      until: (name: string | null) => `tot ${name ?? "de wedstrijd"}`,
      todayIs: (name: string | null) => `is het zover: ${name ?? "de wedstrijd"}`,
    },

    upcoming: {
      title: "Komende trainingen",
      more: "Schema",
      none: "Geen sessies meer in het schema.",
      today: "Vandaag",
      rest: "Rust",
      done: "gedaan",
    },

    recent: {
      title: "Laatste activiteiten",
      more: "Historie",
      empty: "Nog geen activiteiten. Ze verschijnen hier na de eerste sync.",
      parts: (n: number) => `${n} delen`,
      partsHelp: "Opgeslagen in stukken met minder dan 30 minuten pauze; telt als één training.",
      race: "Wedstrijd",
    },

    /** Vorm-kaart als de reeks stopt bij een sync van eergisteren of ouder. */
    formStopped: (day: string) =>
      `Stand op ${day}, de laatst gesyncte dag. De dagen daarna tellen niet als rustdagen maar komen mee met de volgende sync.`,
  },

  /** Trends-pagina: tijdbalk, sportfilter, inzichten (codes uit api/trends.py), grafieken en uitleg. */
  trends: {
    loading: "Laden…",
    loadError: "Kon de trends niet laden.",

    periods: { "4W": "4W", "3M": "3M", "6M": "6M", YTD: "Dit jaar", "1J": "1J", Alles: "Alles", Eigen: "Eigen" } as Record<string, string>,
    timeFilter: {
      group: "Periode voor alle grafieken",
      adjust: "Aanpassen",
      panel: "Periode aanpassen",
      period: "Periode",
      days: (n: number) => `${n} ${n === 1 ? "dag" : "dagen"}`,
      from: "Vanaf",
      to: "Tot en met",
      moveGroup: "Tijdlijn zoomen en verschuiven",
      previous: "Vorige periode",
      next: "Volgende periode",
      zoomIn: "Inzoomen",
      zoomOut: "Uitzoomen",
      backTo: (preset: string) => `Terug naar ${preset}`,
      removeCustom: (window: string, preset: string) => `Eigen periode ${window} weghalen, terug naar ${preset}`,
      help: "In elke grafiek: slepen verschuift, Ctrl/⌘ + scrollen of knijpen zoomt, dubbelklik zet de periode terug. Op een telefoon lees je af met één vinger en zoom je met twee.",
      close: "Sluiten",
    },

    sport: { label: "Sport", all: "Alle sporten", runOnly: "Tempo in Z2, VO2max, langste run, records en voorspellingen gaan alleen over hardlopen: kies Alle sporten of Hardlopen om ze te zien." },

    insights: {
      title: "Inzichten",
      none: "Niets bijzonders.",
      empty: "Nog geen inzichten: daar zijn eerst een paar weken trainingen voor nodig.",
      goal: (text: string) => `Doel uit je actieve schema: ${text}.`,
      noGoal: "Zet een wedstrijd of doel met afstand in je schema, dan gaan de inzichten daarover.",
    },

    /** Titel en uitleg per inzichtcode. */
    insight(i: InsightCode): { title: string; text: string } {
      switch (i.code) {
        case "record_set": {
          const p = i.params;
          return { title: `Nieuw record op ${RECORD_NAME[p.key]}: ${fmtClock(p.seconds)}`, text: `${fmtClock(p.previous_seconds - p.seconds)} sneller dan je vorige beste (${fmtClock(p.previous_seconds)}), op ${fmtDayNl(p.date)}.` };
        }
        case "acwr_high":
          return { title: "Belasting loopt snel op", text: `Vermoeidheid (${i.params.atl}) is ${num(i.params.ratio)}× je fitheid (${i.params.ctl}). Boven 1,5 stijgt het blessurerisico; plan een rustiger dag.` };
        case "ramp_fast":
          return { title: "Snelle opbouw", text: `Fitheid +${num(i.params.ramp)} in 7 dagen. Meer dan ongeveer 5 tot 7 per week houdt je lichaam lastig bij.` };
        case "fresh":
          return { title: "Fris", text: `Vorm +${i.params.tsb}: goed moment voor een wedstrijd of een zware sessie.` };
        case "easy_share": {
          const p = i.params;
          const low = i.level !== "goed";
          return {
            title: `${p.easy_pct}% rustig (Z1-Z2) de laatste 4 weken`,
            text: `Z3 ${p.grey_pct}%, Z4-Z5 ${p.hard_pct}%. Voor duurtraining is ongeveer 80% rustig de gangbare richtlijn.` + (low ? " Wedstrijden tellen mee; zonder wedstrijd hoort het grootste deel in Z1-Z2 te liggen." : ""),
          };
        }
        case "longest_run":
          return { title: `Langste run laatste 4 weken: ${num(i.params.km)} km`, text: "Stukken met minder dan 30 minuten pauze tellen als één run." };
        case "long_run_goal": {
          const p = i.params;
          return {
            title: `Langste run laatste 4 weken: ${num(p.km)} km`,
            text: p.km >= p.target_km
              ? `Lange duurloop op het niveau van je doel (${goalName(p.goal_km)}).`
              : `Voor een ${goalName(p.goal_km)} is een lange duurloop tot ongeveer ${p.target_km} km de gangbare opbouw, een paar weken voor de wedstrijd.`,
          };
        }
        case "goal_prediction": {
          const p = i.params;
          const diff = p.predicted_seconds - p.goal_seconds;
          const where = Math.abs(diff) < 30 ? "ligt op je doel" : `ligt ${fmtClock(Math.abs(diff))} ${diff < 0 ? "onder" : "boven"} je doel`;
          return {
            title: `Voorspelling ${goalName(p.goal_km)}: ${fmtClock(p.predicted_seconds)}`,
            text: `Doel ${fmtClock(p.goal_seconds)}; de voorspelling ${where}. Gerekend uit ${num(p.from_km, 2)} km op ${fmtDayNl(p.from_date)}.`,
          };
        }
        case "run_volume":
          return { title: `Loopvolume ${num(i.params.avg_km, 0)} km/week (gem. 4 weken)`, text: `Deze week tot nu ${num(i.params.week_km)} km.` };
      }
    },

    predictions: {
      title: "Voorspelde wedstrijdtijden",
      none: (days: number) => `Geen snelle inspanning in de laatste ${days} dagen om van uit te gaan.`,
      label: { "5k": "5 km", "10k": "10 km", "21k": "Halve marathon", "42k": "Marathon" } as Record<string, string>,
      from: (km: string) => `uit ${km}`,
      fromTitle: (km: string, time: string, day: string) => `${km} in ${time} op ${day}`,
      basedOn: "Gebaseerd op",
    },

    form: {
      title: "Fitheid, vermoeidheid en vorm",
      fitness: "Fitheid",
      fitnessNow: "Fitheid nu",
      fatigue: "Vermoeidheid",
      form: "Vorm",
      peak: (v: number, day: string) => `Piek fitheid in periode ${v} op ${day}`,
      /** De vormreeks stopt bij een sync van eergisteren of ouder. */
      stopped: (day: string) =>
        `Fitheid, vermoeidheid en vorm lopen tot ${day}, de laatst gesyncte dag. De dagen daarna tellen niet als rustdagen maar komen mee met de volgende sync.`,
    },

    volume: {
      title: "Volume per week",
      hours: "Uren",
      km: "Km",
      unit: "Eenheid",
      aria: "Volume per week per sport",
      other: "Overig",
      total: "Totaal",
      avg: (value: string, weeks: number) => `Gemiddeld ${value} per week over ${weeks} hele ${weeks === 1 ? "week" : "weken"} (de lopende week telt niet mee)`,
      noWholeWeek: "Nog geen hele week in deze periode.",
    },

    z2: {
      title: "Tempo in Z2 (hardlopen)",
      label: "Tempo in Z2",
      excluded: (n: number) => `${n} ${n === 1 ? "run" : "runs"} in deze periode niet meegeteld: de polshartslag leek onbetrouwbaar (ruitjes in de grafiek).`,
      marker: (reasons: string) => `Polshartslag onbetrouwbaar: ${reasons}`,
    },

    hrReason: {
      low_start: "in de eerste km veel lager dan je tempo doet verwachten",
      flat: "minutenlang precies gelijk",
      dropout: "een minuut of langer weggevallen",
    } as Record<HrFlagReason, string>,
    hrMethod: "Vergeleken met je eigen verband tussen tempo en hartslag uit je andere runs. Zo'n run telt niet mee voor het tempo in Z2.",

    vo2: { title: "VO2max (Garmin)", label: "VO2max" },

    longest: {
      title: "Langste run per week",
      label: "Langste run",
      note: "Per week de langste run; stukken met minder dan 30 minuten pauze tellen als één run.",
    },

    recovery: {
      titleDay: "Herstel per dag",
      titleWeek: "Herstel per week",
      rhr: "Rusthartslag",
      sleep: "Slaap",
      bb: "Body Battery (hoogste van de dag)",
      bbShort: "Body Battery",
      stress: "Stress",
      hrv: "HRV (nacht)",
      hrvNote: "Gemiddelde hartslagvariabiliteit tijdens de nacht, gemeten door het horloge. Vergelijk met je eigen verloop, niet met dat van anderen.",
    },

    sleepLoad: {
      title: "Slaap en rusthartslag tegen belasting",
      perDay: "Per dag",
      perWeek: "Per week",
      view: "Per dag of per week",
      load: "Belasting",
      loadAxis: "Belasting (TRIMP) →",
      sleepTitle: "Slaap (u)",
      rhrTitle: "Rusthartslag (bpm)",
      hours: " u",
      bpm: " bpm",
      explainDay: "Elk punt is een dag: de belasting van die dag (TRIMP) tegen de slaap en rusthartslag van de nacht erna.",
      explainWeek: "Elk punt is een week: de opgetelde belasting (TRIMP) tegen je gemiddelde slaap en rusthartslag in die week.",
      neutral: "Een verband zegt niets over oorzaak: slaap en rusthartslag hangen ook af van werk, ziekte, alcohol en warmte.",
      compare: (unit: "dag" | "week", heavySleep: string, lightSleep: string) =>
        `Op de zwaarste helft van de ${unit === "dag" ? "dagen" : "weken"} sliep je gemiddeld ${heavySleep} u, op de lichtste helft ${lightSleep} u.`,
      compareRhr: (heavy: string, light: string) => `Rusthartslag: ${heavy} tegen ${light} bpm.`,
      tooFew: "Te weinig dagen met zowel slaap als training in deze periode.",
      point: (label: string, load: string, value: string) => `${label}: belasting ${load}, ${value}`,
    },

    records: {
      title: "Records",
      colDistance: "Afstand",
      colTime: "Tijd",
      colPace: "Tempo",
      colDate: "Datum",
      colProgress: "Verloop in periode",
      empty: "Nog geen records: die komen uit hardloopactiviteiten met snelste splits of wedstrijden.",
      method: "Snelste stuk binnen een run (Garmins splits) of een hele wedstrijd; geen officiële wedstrijdtijd.",
      raceRule: (pct: number) => `Een wedstrijd die het horloge tot ${pct}% te kort mat, telt mee voor die afstand.`,
      fromRace: (km: string) => `wedstrijd, ${km} gemeten`,
      pr: "PR",
      prTitle: (days: number) => `Verbeterd in de laatste ${days} dagen`,
      prNotice: (what: string, day: string) => `Nieuw record op ${what} (${day}).`,
      improved: (n: number) => (n === 0 ? "geen verbetering in deze periode" : `${n}× verbeterd in deze periode`),
      before: (time: string) => `daarvoor ${time}`,
      progressNote: "Het lijntje loopt over de gekozen periode: elk bolletje is een verbetering, daartussen bleef het record staan.",
      name: RECORD_NAME,
      label: { "1k": "1 km", "5k": "5 km", "10k": "10 km", "21k": "Halve marathon" } as Record<RecordKey, string>,
    },

    races: {
      title: "Wedstrijden en tests",
      none: "Nog geen wedstrijden herkend.",
      triathlon: "Triathlon",
      byHeartRate: (name: string) => `Wedstrijd of test (${name || "run"})`,
    },
  },
};
