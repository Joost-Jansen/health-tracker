// Gedeelde hulpjes voor de Schema-pagina en de schema-editor (T24): datums in de eigen tijdzone, weken en dagen,
// de wedstrijd uit het schema, kleuren per sport en status.

import type { Format } from "@/lib/i18n";
import type { PlanSession, SessionStatus } from "@/lib/training";

/** Wat de API als sport accepteert (api/plans.py SPORTS). */
export const PLAN_SPORTS = ["run", "ride", "swim", "strength_training", "rest"] as const;
export type PlanSport = (typeof PLAN_SPORTS)[number];

/** Dezelfde sportkleuren als op Trends. */
export const SPORT_COLOUR: Record<string, string> = {
  run: "var(--chart-1)",
  ride: "var(--chart-4)",
  swim: "var(--chart-3)",
  strength_training: "var(--chart-5)",
  rest: "var(--text-faint)",
};
export const sportColour = (s: string) => SPORT_COLOUR[s] ?? "var(--chart-6)";

/** Zones die de API begrijpt (parse_zone): één zone of een bereik. */
export const ZONE_OPTIONS = ["Z1", "Z2", "Z3", "Z4", "Z5", "Z1-Z2", "Z2-Z3", "Z3-Z4", "Z4-Z5"];

/** Kleur per status; de namen staan in lib/i18n (plan.statuses), soorten training als suggestie in plan.kinds. */
export const STATUS_TONE: Record<SessionStatus, "gain" | "loss" | "brand" | "neutral"> = {
  gedaan: "gain",
  gemist: "loss",
  vandaag: "brand",
  gepland: "neutral",
  rust: "neutral",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD in de tijdzone van de browser (niet UTC: om 00:30 is het al de nieuwe dag). */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayIso = () => isoLocal(new Date());

export function parseIso(day: string): Date {
  return new Date(day.slice(0, 10) + "T12:00:00");
}

export function addDays(day: string, n: number): string {
  const d = parseIso(day);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
}

/** Maandag van de week van `day`. */
export function weekOf(day: string): string {
  const d = parseIso(day);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoLocal(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

export const isValidIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseIso(s).getTime()) && isoLocal(parseIso(s)) === s;

/** Dutch long date for pages not translated yet (components/dashboard); translated pages use useFormat().long. */
export const fmtLong = (day: string) => parseIso(day).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });

/** "28 sep – 4 okt" / "28 Sep – 4 Oct" */
export function fmtWeekRange(monday: string, f: Format): string {
  return `${f.dayMonth(monday)} – ${f.dayMonth(addDays(monday, 6))}`;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mrt: 3, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, dec: 12 };

/** Datum uit vrije tekst: 2026-10-18, 18-10-2026, 18/10 of 18 okt (2026). */
export function findDate(text: string, year: number): { iso: string; match: string } | null {
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return { iso: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`, match: m[0] };
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?\b/);
  if (m) {
    const y = m[3] ? (+m[3] < 100 ? +m[3] + 2000 : +m[3]) : year;
    return { iso: `${y}-${pad(+m[2])}-${pad(+m[1])}`, match: m[0] };
  }
  m = text.toLowerCase().match(/\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?(?:\s+(\d{4}))?/);
  if (m && MONTHS[m[2]]) return { iso: `${m[3] ?? year}-${pad(MONTHS[m[2]])}-${pad(+m[1])}`, match: m[0] };
  return null;
}

/** Wedstrijdnaam en datum uit het vrije veld `race` ("Marathon, 2026-10-18"). */
export function splitRace(race: string | null | undefined, year = new Date().getFullYear()): { name: string; date: string | null } {
  const text = (race ?? "").trim();
  if (!text) return { name: "", date: null };
  const found = findDate(text, year);
  if (!found || !isValidIso(found.iso)) return { name: text, date: null };
  const name = text.replace(found.match, "").replace(/\s*[,·–-]\s*$/, "").replace(/^\s*[,·–-]\s*/, "").replace(/\s{2,}/g, " ").trim();
  return { name, date: found.iso };
}

/** Terug naar één veld, zoals agents het ook schrijven. */
export function joinRace(name: string, date: string): string {
  return [name.trim(), date].filter(Boolean).join(", ");
}

const RACE_KIND = /wedstrijd|race|marathon|triathlon/i;

/** De wedstrijd van het schema: datum uit het race-veld, anders de laatste sessie van het soort wedstrijd (naam leeg:
 *  de pagina zegt dan "de wedstrijd" in de eigen taal). */
export function planRace(race: string | null | undefined, sessions: PlanSession[]): { name: string; date: string | null } {
  const year = sessions[0] ? parseIso(sessions[0].date).getFullYear() : new Date().getFullYear();
  const r = splitRace(race, year);
  if (r.date) return r;
  const s = [...sessions].reverse().find((x) => RACE_KIND.test(x.kind ?? ""));
  return { name: r.name, date: s?.date ?? null };
}

/** `outside`: voor de eerste of na de laatste sessie van het schema (geen rustdag, het schema loopt dan niet). */
export type Day = { date: string; sessions: PlanSession[]; outside?: boolean };
export type Week = { monday: string; days: Day[]; sessions: PlanSession[] };

/** Alle weken van het schema, elke week met zeven dagen (ook lege), sessies per dag in volgorde. */
export function buildWeeks(sessions: PlanSession[]): Week[] {
  if (!sessions.length) return [];
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const first = weekOf(sorted[0].date);
  const last = weekOf(sorted[sorted.length - 1].date);
  const weeks: Week[] = [];
  for (let monday = first; monday <= last; monday = addDays(monday, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return { date, sessions: sorted.filter((s) => s.date === date), outside: date < sorted[0].date || date > sorted[sorted.length - 1].date };
    });
    weeks.push({ monday, days, sessions: days.flatMap((d) => d.sessions) });
  }
  return weeks;
}

/** Kilometers per sport, gepland en gedaan. Sessies zonder afstand tellen niet mee. */
export function kmBySport(sessions: PlanSession[]): Record<string, { planned: number; done: number }> {
  const out: Record<string, { planned: number; done: number }> = {};
  for (const s of sessions) {
    if (s.sport === "rest") continue;
    const row = (out[s.sport] ??= { planned: 0, done: 0 });
    row.planned += s.distance_km ?? 0;
    if (s.status === "gedaan") row.done += s.done?.distance_km ?? 0;
  }
  return out;
}

export const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
