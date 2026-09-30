// Types en opmaak voor trainingsdata. Tijden als 1:05 (u:mm), tempo als 5:20/km.

export const ZONES = ["Z1", "Z2", "Z3", "Z4", "Z5"] as const;
export type Zone = (typeof ZONES)[number];
export type ZoneSeconds = Record<Zone, number>;

export const ZONE_COLOUR: Record<Zone, string> = {
  Z1: "var(--zone-1)",
  Z2: "var(--zone-2)",
  Z3: "var(--zone-3)",
  Z4: "var(--zone-4)",
  Z5: "var(--zone-5)",
};

export const SPORT_LABEL: Record<string, string> = {
  all: "Alle sporten",
  run: "Hardlopen",
  ride: "Fietsen",
  swim: "Zwemmen",
  walking: "Wandelen",
  strength_training: "Kracht",
  breathwork: "Ademwerk",
  resort_skiing: "Skiën",
};

export const sportLabel = (s: string) => SPORT_LABEL[s] ?? s.replace(/_/g, " ");

export type ActivitySummary = {
  id: string;
  start_local: string;
  sport: string;
  name?: string;
  distance_km?: number;
  moving_time_s?: number;
  avg_hr?: number;
  max_hr?: number;
  elevation_gain_m?: number;
  hr_zones_s?: ZoneSeconds;
};

export type ZoneShare = { seconds: ZoneSeconds; total_s: number; pct: Record<Zone, number> };
export type Volume = { count: number; km: number; seconds: number };
export type FormRow = { date: string; load: number; ctl: number; atl: number; tsb: number };

export type Dashboard = {
  today: string;
  last_sync: string;
  zone_bounds: Record<string, number[]>;
  zones: { week: Record<string, ZoneShare>; month: Record<string, ZoneShare> };
  volume: { week: Record<string, Volume>; avg4w: Record<string, Volume> };
  form: null | { ctl: number; atl: number; tsb: number; status: string; ctl_peak: number; ctl_peak_date: string; series: FormRow[] };
  recent: ActivitySummary[];
  recovery: { days: ({ date: string } & Record<string, number | string>)[]; baseline_rhr: number | null };
  upcoming: unknown[];
};

export function fmtDuration(seconds?: number): string {
  if (!seconds) return "0:00";
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

export function fmtPace(seconds?: number, km?: number): string {
  if (!seconds || !km) return "–";
  const s = Math.round(seconds / km);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/km`;
}

export function fmtSpeed(seconds?: number, km?: number): string {
  if (!seconds || !km) return "–";
  return `${((km / seconds) * 3600).toFixed(1).replace(".", ",")} km/u`;
}

/** Tempo voor lopen, snelheid voor fietsen, per 100 m voor zwemmen. */
export function fmtIntensity(a: { sport: string; moving_time_s?: number; distance_km?: number }): string {
  if (a.sport === "ride") return fmtSpeed(a.moving_time_s, a.distance_km);
  if (a.sport === "swim") {
    if (!a.moving_time_s || !a.distance_km) return "–";
    const s = Math.round(a.moving_time_s / (a.distance_km * 10));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/100m`;
  }
  return fmtPace(a.moving_time_s, a.distance_km);
}

export const fmtKm = (km?: number) => (km == null ? "–" : `${km.toFixed(1).replace(".", ",")} km`);

export function fmtDate(iso: string): string {
  return new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

export function zoneRanges(bounds: number[]): Record<Zone, string> {
  const [b2, b3, b4, b5] = bounds;
  return { Z1: `< ${b2}`, Z2: `${b2}-${b3 - 1}`, Z3: `${b3}-${b4 - 1}`, Z4: `${b4}-${b5 - 1}`, Z5: `≥ ${b5}` };
}
