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
  upcoming: PlanSession[];
  plan_title?: string;
  readiness?: Readiness | null;
};

export type Readiness = {
  verdict: "klaar" | "rustig aan" | "herstel" | "onbekend";
  text: string;
  date: string | null;
  signals: { key: string; label: string; value: string; note: string; level: "ok" | "attention" | "warn" }[];
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

// ── Historie (T4) ────────────────────────────────────────────────────────────

export type ActivityListItem = ActivitySummary & { has_gps?: boolean };

export type Lap = { distance_km?: number; time_s?: number; avg_hr?: number; pace?: string; elevation_gain_m?: number };
export type KmSplit = { km: number; seconds: number; avg_hr: number | null; elevation_m?: number };
export type RouteRun = { id: string; date: string; moving_time_s?: number; distance_km?: number; avg_hr?: number; pace_s_per_km: number | null };

export type ActivityDetail = ActivitySummary & {
  elapsed_time_s?: number;
  avg_cadence_spm?: number;
  calories?: number;
  vo2max?: number;
  laps: Lap[];
  zone_bounds: number[] | null;
  zone_estimate: boolean;
  track: { latlng: [number, number][]; zone: (Zone | null)[] } | null;
  series: { time: number[]; heartrate?: (number | null)[]; velocity?: (number | null)[]; altitude?: (number | null)[]; cadence?: (number | null)[]; distance?: (number | null)[] } | null;
  splits: KmSplit[];
  decoupling_pct: number | null;
  same_day: { id: string; start_local: string; sport: string; name?: string; distance_km?: number; moving_time_s?: number }[];
  route: null | { id: string; name?: string; distance_km?: number; history: RouteRun[] };
  prev_id: string | null;
  next_id: string | null;
};

export type Heatmap = { tracks: [number, number][][] };

export function zoneShare(seconds?: Partial<ZoneSeconds> | null): ZoneShare | null {
  if (!seconds) return null;
  const secs = Object.fromEntries(ZONES.map((z) => [z, seconds[z] ?? 0])) as ZoneSeconds;
  const total = ZONES.reduce((s, z) => s + secs[z], 0);
  if (!total) return null;
  const pct = Object.fromEntries(ZONES.map((z) => [z, (secs[z] / total) * 100])) as Record<Zone, number>;
  return { seconds: secs, total_s: total, pct };
}

export function fmtClock(seconds?: number | null): string {
  if (seconds == null) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

export const fmtPaceS = (s?: number | null) => (s ? `${fmtClock(s)}/km` : "–");

// ── Trends (T5) ──────────────────────────────────────────────────────────────

export type RecordRow = { date: string; seconds: number; activity_id: string };
export type Race = { date: string; name: string; sport: string; seconds: number; distance_km: number; activity_ids: string[]; detected?: "naam" | "hartslag" };
export type Prediction = { seconds: number; pace_s_per_km: number; from: { date: string; km: number; seconds: number; activity_id: string; source: "split" | "wedstrijd" } };
export type Insight = { level: "goed" | "let_op" | "info"; title: string; text: string };

export type Trends = {
  today: string;
  form: FormRow[];
  /** One row per day with any recovery value, oldest first (T17). */
  recovery_daily?: { date: string; resting_hr?: number | null; sleep_h?: number | null; body_battery_high?: number | null; stress_avg?: number | null; hrv?: number | null }[];
  weekly: { week: string; sports: Record<string, Volume> }[];
  z2_pace: { week: string; pace_s_per_km: number; runs: number; z2_seconds: number }[];
  vo2max: { date: string; value: number }[];
  recovery_weekly: { week: string; resting_hr: number | null; sleep_h: number | null; body_battery_high: number | null; stress_avg: number | null; hrv: number | null }[];
  records: Record<"1k" | "5k" | "10k" | "21k", RecordRow[]>;
  races: Race[];
  predictions: Partial<Record<"5k" | "10k" | "21k" | "42k", Prediction>>;
  insights: Insight[];
};

// ── Schema (T6) ──────────────────────────────────────────────────────────────

export type SessionStatus = "gedaan" | "gemist" | "vandaag" | "gepland" | "rust";

export type PlanSession = {
  id?: number;
  date: string;
  sport: string;
  kind?: string | null;
  distance_km?: number | null;
  duration_min?: number | null;
  target_zone?: string | null;
  description?: string | null;
  route_id?: string | null;
  status?: SessionStatus;
  activity_ids?: string[];
  done?: { distance_km: number; moving_time_s: number; avg_hr?: number; zone_pct: number | null };
  route_suggestion?: { parts: string[]; names: string[]; total_km: number; deviation_km: number; within_tolerance: boolean; days_since: number };
};

export type PlanWeek = { week: string; planned_km: number; done_km: number; planned: number; done: number; missed: number };

export type Plan = {
  id: number;
  title: string;
  goal?: string | null;
  race?: string | null;
  notes?: string | null;
  status: "actief" | "afgerond" | "gestopt";
  author: string;
  created_at: string;
  sessions: PlanSession[];
  weeks: PlanWeek[];
};

export type PlanListItem = Omit<Plan, "sessions" | "weeks">;

// ── Rondjes (T7) ─────────────────────────────────────────────────────────────

/** Sporten met vaste rondjes: id-voorvoegsel r (lopen) en f (fietsen). */
export type RouteSport = "run" | "ride";

export type RouteSummary = {
  id: string;
  name?: string;
  sport: string;
  distance_km: number;
  is_loop?: boolean;
  elevation_gain_m?: number;
  runs: number;
  first_run?: string;
  last_run?: string;
  /** Lopen: mediaan tempo "5:08"; null bij fietsrondjes. */
  median_pace?: string | null;
  /** Fietsen: mediaan snelheid in km/u; null bij looprondjes. */
  median_speed_kmh?: number | null;
  median_hr?: number;
  start?: [number, number];
  best: null | { activity_id: string; date: string; pace_s_per_km: number; moving_time_s?: number };
  recent_pace_s_per_km: number | null;
  earlier_pace_s_per_km: number | null;
  recent_efficiency: number | null;
  earlier_efficiency: number | null;
  medoid_id?: string | null;
  track: [number, number][];
  variants?: { id: string; date: string; track: [number, number][] }[];
};

export type RouteDetail = RouteSummary & {
  history: { id: string; date: string; distance_km?: number; moving_time_s?: number; avg_hr?: number; pace_s_per_km: number | null; m_per_beat: number | null; hr_zones_s?: ZoneSeconds }[];
};

export type RouteOption = {
  parts: string[];
  names: string[];
  total_km: number;
  deviation_km: number;
  within_tolerance: boolean;
  days_since: number;
  tracks: Record<string, [number, number][]>;
};

// ── Zones over tijd (T16) ────────────────────────────────────────────────────

export type ZonePeriod = "week" | "month";

/** GET /api/zones?period=&offset= : één week of maand, offset 0 = de huidige (tot nu). */
export type ZonesForPeriod = {
  period: ZonePeriod;
  offset: number;
  start: string;
  end: string;
  label: string;
  is_current: boolean;
  /** Per sport plus "all" (som, elke sport met zijn eigen zones); leeg zonder hartslagdata. */
  zones: Record<string, ZoneShare>;
  bounds: Record<string, number[]>;
};

export type ZoneHistoryItem = ZoneShare & { start: string; end: string; label: string };

/** GET /api/zones/history?period=&count=&sport= : oudste eerst, de laatste is de lopende periode. */
export type ZoneHistory = {
  period: ZonePeriod;
  sport: string;
  /** Sporten met hartslagzones in het hele venster, los van het sportfilter. */
  sports: string[];
  items: ZoneHistoryItem[];
};


// ── Accounts (T19) ───────────────────────────────────────────────────────────

export type Me = { id: number; username: string; display_name: string | null; is_admin: boolean; via: "cookie" | "agent" };
export type AdminUser = {
  id: number;
  username: string;
  display_name: string | null;
  is_admin: boolean;
  suspended: boolean;
  created_at: string;
  last_login_at: string | null;
  activities: number;
  last_sync: string | null;
};
export type Invite = { code: string; created_by: number; created_at: string; expires_at: string | null; used_by: number | null; used_at: string | null };
export type RegistrationMode = "closed" | "invite" | "open";
