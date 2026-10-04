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

/** Acute (ATL) tegenover chronische (CTL) belasting, zie api/dashboard.py load_indicator. */
export type LoadIndicator = {
  band: "low" | "build" | "high" | "unknown";
  acwr: number | null;
  ramp: number | null;
  reason: "ratio" | "ramp" | null;
  thresholds: { low: number; high: number; ramp_high: number };
};

export type Dashboard = {
  today: string;
  last_sync: string;
  zone_bounds: Record<string, number[]>;
  zone_estimates?: string[];
  zones_set?: string[];
  zones: { week: Record<string, ZoneShare>; month: Record<string, ZoneShare> };
  volume: { week: Record<string, Volume>; avg4w: Record<string, Volume> };
  form: null | {
    ctl: number;
    atl: number;
    tsb: number;
    status: string;
    ctl_peak: number;
    ctl_peak_date: string;
    /** Laatste dag van de reeks: vandaag, of de laatst gesyncte dag als de sync ouder is dan gisteren. */
    until: string;
    stopped_at_sync: boolean;
    load: LoadIndicator;
    series: FormRow[];
  };
  recent: RecentItem[];
  recovery: { days: ({ date: string } & Record<string, number | string>)[]; baseline_rhr: number | null };
  upcoming: PlanSession[];
  plan_title?: string;
  /** Alleen met een actief schema. */
  plan_week?: PlanWeekSummary;
  race?: NextRace | null;
  readiness?: Readiness | null;
};

/** Codes en getallen; de tekst komt uit T.vandaag.readiness (api/readiness.py). */
export type ReadinessNote = {
  code: "vs_baseline" | "sleep" | "highest" | "form_yesterday";
  params: { delta?: number; baseline?: number; score?: number; date?: string; days_ago?: number };
};

export type Readiness = {
  verdict: "klaar" | "rustig aan" | "herstel" | "onbekend";
  date: string | null;
  /** Geen slaap of rusthartslag van afgelopen nacht. */
  no_night: boolean;
  signals: { key: "resting_hr" | "sleep_h" | "body_battery" | "tsb"; value: number; note: ReadinessNote; level: "ok" | "attention" | "warn" }[];
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
  rules?: { race_min_km: number; race_hard_pct: number; predict_days: number; riegel: number };
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
  /** The loop chosen in the plan (`route_id`), when it is one of the user's loops (T24). */
  route?: { id: string; name: string; distance_km?: number | null };
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

// ── Rondjes: lengtevarianten en "is dit hetzelfde rondje?" (T20) ─────────────

/** Een lengtevariant binnen een rondje (zelfde rondje met een extra lus, omweg of aanloop). */
export type RouteLengthVariant = { distance_km: number; runs: number; activity_ids: string[]; last_run: string };

/** GET /api/routes en /api/routes/{id} geven ook `distance_variants`, kortste eerst. */
export type RouteWithVariants = RouteSummary & { distance_variants?: RouteLengthVariant[] };

export type RouteCandidateSide = {
  id: string;
  kind: "route" | "activity";
  name?: string | null;
  distance_km?: number;
  runs?: number;
  last_run?: string;
  /** Alleen bij een losse activiteit. */
  date?: string;
  track: [number, number][];
};

export type RouteReasonCode = "same" | "other_start" | "extra_loop" | "partly_other_way";

/** Een open vraag: a is altijd een rondje, b een rondje of een losse activiteit. */
export type RouteCandidate = {
  sport: RouteSport;
  outcome: "same" | "candidate";
  confidence: number;
  reason_code?: RouteReasonCode | null;
  reason: string;
  a: RouteCandidateSide;
  b: RouteCandidateSide;
};

/** GET /api/routes/candidates?sport= */
export type RouteCandidates = { candidates: RouteCandidate[]; last_sync: string | null };

/** POST /api/routes/candidates {a, b, same} */
export type RouteCandidateResult = { applied: boolean; applied_on_next_sync: boolean; route: RouteWithVariants | null; remaining: number };

// ── Vandaag: schema deze week, wedstrijd, laatste activiteiten ───────────────

/** Een sessie van het schema per sport deze week; tijd gepland alleen uit sessies met een duur. */
export type PlanWeekSport = { planned_km: number; done_km: number; planned_s: number; done_s: number; sessions: number; done: number };

/** GET /api/dashboard `plan_week`: maandag t/m zondag van het actieve schema (api/dashboard.py plan_week). */
export type PlanWeekSummary = {
  start: string;
  end: string;
  sports: Record<string, PlanWeekSport>;
  /** `unsynced`: voorbij, maar na de laatste sync; nog niet bekend of hij gedaan is. */
  sessions: { total: number; done: number; missed: number; upcoming: number; unsynced: number };
};

/** GET /api/dashboard `race`: de eerstvolgende wedstrijd uit het schema; `name` alleen bij de wedstrijd van het schema zelf. */
export type NextRace = { date: string; days: number; name: string | null; distance_km: number | null; sport: string | null };

/** Een item onder Laatste activiteiten: runs met minder dan 30 minuten pauze zijn één item met `parts`. */
export type RecentItem = ActivitySummary & { parts?: number; activity_ids?: string[]; race?: boolean };

// ── Trends, uitbreiding (insights als codes, records uit wedstrijden, doel, langste run, polshartslag) ──────────

export type RecordKey = "1k" | "5k" | "10k" | "21k";
/** Een record-rij: uit een split of uit een wedstrijd die het horloge net te kort mat (dan met distance_km). */
export type RecordRowPlus = RecordRow & { source?: "split" | "race"; distance_km?: number };
export type RecentRecord = { key: RecordKey; date: string; seconds: number; previous_seconds: number; activity_id: string; source: "split" | "race" };
/** Het doel uit het actieve schema (api/trends.py goal_from_plan). */
export type TrendsGoal = { km: number; seconds: number | null; date: string | null; text: string };
export type LongestRun = { week: string; date: string; km: number; seconds: number; parts: number; activity_id: string };
export type HrFlagReason = "low_start" | "flat" | "dropout";
export type HrFlag = { id: string; date: string; name: string; reasons: HrFlagReason[] };

/** Inzicht als code met getallen; de tekst komt uit lib/texts.ts (T.trends.insight). */
export type InsightCode =
  | { level: Insight["level"]; code: "record_set"; params: { key: RecordKey; seconds: number; previous_seconds: number; date: string; activity_id: string } }
  | { level: Insight["level"]; code: "acwr_high"; params: { atl: number; ctl: number; ratio: number } }
  | { level: Insight["level"]; code: "ramp_fast"; params: { ramp: number } }
  | { level: Insight["level"]; code: "fresh"; params: { tsb: number } }
  | { level: Insight["level"]; code: "easy_share"; params: { easy_pct: number; grey_pct: number; hard_pct: number } }
  | { level: Insight["level"]; code: "longest_run"; params: { km: number } }
  | { level: Insight["level"]; code: "long_run_goal"; params: { km: number; target_km: number; goal_km: number } }
  | { level: Insight["level"]; code: "goal_prediction"; params: { goal_km: number; goal_seconds: number; predicted_seconds: number; from_km: number; from_date: string } }
  | { level: Insight["level"]; code: "run_volume"; params: { avg_km: number; week_km: number; week_start: string } };

export type RecoveryDay = { date: string; resting_hr: number | null; sleep_h: number | null; body_battery_high: number | null; stress_avg: number | null; hrv: number | null };

/** GET /api/trends zoals de API hem nu geeft. */
export type TrendsPlus = Omit<Trends, "insights" | "records" | "rules" | "recovery_daily"> & {
  insights: InsightCode[];
  records: Record<RecordKey, RecordRowPlus[]>;
  recovery_daily?: RecoveryDay[];
  recent_records?: RecentRecord[];
  goal?: TrendsGoal | null;
  /** Laatste dag van de vormreeks; na een sync van eergisteren of ouder de laatst gesyncte dag (`stopped_at_sync`). */
  form_until?: string | null;
  stopped_at_sync?: boolean;
  longest_runs?: LongestRun[];
  hr_flags?: HrFlag[];
  rules?: { race_min_km: number; race_hard_pct: number; predict_days: number; riegel: number; race_short_pct?: number; recent_record_days?: number };
};

/** ActivitySummary met de vlag voor onbetrouwbare polshartslag (GET /api/activities, als de API die meegeeft). */
export type ActivitySummaryFlags = { hr_flags?: HrFlagReason[] };
