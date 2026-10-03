// Alle uitlegteksten over gezondheid en prestaties, op één plek (T19). Niets hierin gaat over één bepaalde persoon:
// wat over de gebruiker gaat (zones, max hartslag, welke sporten geschat zijn, waarop een voorspelling is gebaseerd)
// komt als parameter uit diens eigen instellingen en data. Pagina's halen hun tekst hier, niet uit een eigen string.

import { sportLabel } from "@/lib/training";

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

  formStatus: {
    fris: "Fris: er is ruimte voor een zware training of een wedstrijd.",
    "in balans": "In balans: belasting en herstel houden elkaar in evenwicht.",
    vermoeid: "Vermoeid: je bouwt op; plan binnenkort een rustiger dag.",
    "zeer vermoeid": "Zeer vermoeid: de belasting is hoog tegenover wat je gewend bent; neem rust.",
  } as Record<string, string>,

  formMethod: "Belasting per training = TRIMP uit gemiddelde hartslag, rusthartslag en je eigen max per sport. Fitheid is het 42-daags gemiddelde, vermoeidheid 7 dagen, vorm het verschil.",

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
};
