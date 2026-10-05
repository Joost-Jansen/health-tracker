// Lopen of fietsen op de Rondjes-pagina's: vaste waarden, opmaak en links per sport. Lopen toont tempo (5:08/km),
// fietsen snelheid (28,4 km/u). De API geeft per rondje en per keer tempo in s/km; snelheid rekenen we daaruit.
// De woorden ("gelopen", "gefietst") staan in lib/i18n (routes.words).

import type { Format } from "@/lib/i18n";
import type { RouteSport, RouteSummary } from "@/lib/training";

export const ROUTE_SPORTS: RouteSport[] = ["run", "ride"];

export const asSport = (s: string | null | undefined): RouteSport => (s === "ride" ? "ride" : "run");

export const PRESETS: Record<RouteSport, { presets: number[]; minCount: number }> = {
  run: { presets: [5, 8, 10, 14, 18, 21.1, 25, 30], minCount: 3 },
  ride: { presets: [20, 30, 40, 50, 60, 80, 100], minCount: 2 },
};

export const routeHref = (id: string) => `/routes/route/?id=${encodeURIComponent(id)}`;
export const listHref = (sport: RouteSport) => (sport === "ride" ? "/routes/?sport=ride" : "/routes/");

export const kmhFromPace = (paceSPerKm?: number | null) => (paceSPerKm ? 3600 / paceSPerKm : null);

/** Tempo bij lopen, snelheid bij fietsen, uit een tempo in s/km. */
export const fmtEffort = (f: Format, sport: RouteSport, paceSPerKm?: number | null) => (sport === "ride" ? f.kmh(kmhFromPace(paceSPerKm)) : f.pace(paceSPerKm));

/** "5:08/km" of "28,4 km/u" voor een rondje. */
export const fmtTypical = (f: Format, r: Pick<RouteSummary, "sport" | "median_pace" | "median_speed_kmh">) =>
  asSport(r.sport) === "ride" ? f.kmh(r.median_speed_kmh) : r.median_pace ? `${r.median_pace}/km` : "–";
