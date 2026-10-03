// Lopen of fietsen op de Rondjes-pagina's: woorden, opmaak en links per sport. Lopen toont tempo (5:08/km),
// fietsen snelheid (28,4 km/u). De API geeft per rondje en per keer tempo in s/km; snelheid rekenen we daaruit.

import { type RouteSport, type RouteSummary, fmtPaceS } from "@/lib/training";

export const SPORT_TABS: { id: RouteSport; label: string }[] = [
  { id: "run", label: "Lopen" },
  { id: "ride", label: "Fietsen" },
];

export const asSport = (s: string | null | undefined): RouteSport => (s === "ride" ? "ride" : "run");

export const WORDS: Record<RouteSport, { done: string; notDone: string; suggestTitle: string; presets: number[]; minCount: number }> = {
  run: { done: "gelopen", notDone: "niet gelopen", suggestTitle: "Rondje voor een afstand", presets: [5, 8, 10, 14, 18, 21.1, 25, 30], minCount: 3 },
  ride: { done: "gefietst", notDone: "niet gefietst", suggestTitle: "Fietsrondje voor een afstand", presets: [20, 30, 40, 50, 60, 80, 100], minCount: 2 },
};

export const routeHref = (id: string) => `/rondjes/rondje/?id=${encodeURIComponent(id)}`;
export const listHref = (sport: RouteSport) => (sport === "ride" ? "/rondjes/?sport=ride" : "/rondjes/");

export const fmtKmh = (v?: number | null) => (v ? `${v.toFixed(1).replace(".", ",")} km/u` : "–");
export const kmhFromPace = (paceSPerKm?: number | null) => (paceSPerKm ? 3600 / paceSPerKm : null);

/** Tempo bij lopen, snelheid bij fietsen, uit een tempo in s/km. */
export const fmtEffort = (sport: RouteSport, paceSPerKm?: number | null) => (sport === "ride" ? fmtKmh(kmhFromPace(paceSPerKm)) : fmtPaceS(paceSPerKm));

/** "typisch 5:08/km" of "typisch 28,4 km/u" voor een rondje. */
export const fmtTypical = (r: Pick<RouteSummary, "sport" | "median_pace" | "median_speed_kmh">) =>
  asSport(r.sport) === "ride" ? fmtKmh(r.median_speed_kmh) : r.median_pace ? `${r.median_pace}/km` : "–";
