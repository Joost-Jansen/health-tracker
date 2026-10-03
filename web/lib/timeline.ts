// Tijdvensters en een tijdas voor de grafieken op Trends.
//
// periodWindow en moveWindow, aangevuld met wat een grafiek met een echte tijdas nodig heeft: dagnummers
// als x, ticks die bij de breedte passen, en een voortschrijdend gemiddelde.
//
// Een datum is overal "YYYY-MM-DD". Rekenen gebeurt in dagnummers (dagen sinds
// 1970-01-01, UTC), zodat zomertijd nooit een dag van 23 uur oplevert.

export type DateWindow = { from: string; to: string };
export type DayPoint = { d: string; v: number };

export const PERIODS = ["4W", "3M", "6M", "YTD", "1J", "Alles"];
export const CUSTOM = "Eigen";
export const DEFAULT_PERIOD = "6M";
/** Korter dan een week inzoomen heeft bij dag- en weekreeksen geen zin. */
export const MIN_SPAN_DAYS = 7;

const MONTHS: Record<string, number> = { "3M": 3, "6M": 6, "1J": 12 };
const DAY = 86400000;
export const NL_MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const NL_WEEKDAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];

export const dayNumber = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`) / DAY;
export const isoDay = (n: number) => new Date(Math.round(n) * DAY).toISOString().slice(0, 10);

const later = (a: string, b: string) => (a > b ? a : b);

/** Het venster van een periode tot en met `last`, nooit vóór `first`. */
export function periodWindow(period: string, first: string, last: string): DateWindow {
  if (period === "Alles") return { from: first, to: last };
  if (period === "4W") return { from: later(first, isoDay(dayNumber(last) - 27)), to: last };
  if (period === "YTD") return { from: later(first, `${last.slice(0, 4)}-01-01`), to: last };
  const months = MONTHS[period] ?? 6;
  const date = new Date(`${last}T00:00:00Z`);
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(originalDay, monthEnd));
  return { from: later(first, isoDay(date.getTime() / DAY + 1)), to: last };
}

/** Een venster in dagnummers (mag fractioneel zijn tijdens slepen). */
export type DayRange = { a: number; b: number };

export const toRange = (w: DateWindow): DayRange => ({ a: dayNumber(w.from), b: dayNumber(w.to) });
export const toWindow = (r: DayRange): DateWindow => ({ from: isoDay(r.a), to: isoDay(r.b) });

/** Binnen [lo, hi] houden, minstens MIN_SPAN_DAYS breed (of de hele data als die korter is). */
export function clampRange(r: DayRange, lo: number, hi: number, minSpan = MIN_SPAN_DAYS): DayRange {
  const full = hi - lo;
  const span = Math.min(full, Math.max(minSpan, r.b - r.a));
  let a = r.a;
  if (r.b - r.a < span) a = (r.a + r.b) / 2 - span / 2;
  a = Math.max(lo, Math.min(hi - span, a));
  return { a, b: a + span };
}

/** Zoomen rond een vast punt (de muis, het midden van twee vingers): dat punt blijft staan. */
export function zoomRange(r: DayRange, factor: number, anchor: number, lo: number, hi: number): DayRange {
  const a = anchor - (anchor - r.a) * factor;
  const b = anchor + (r.b - anchor) * factor;
  return clampRange({ a, b }, lo, hi);
}

export function panRange(r: DayRange, delta: number, lo: number, hi: number): DayRange {
  const span = r.b - r.a;
  const a = Math.max(lo, Math.min(hi - span, r.a + delta));
  return { a, b: a + span };
}

/** Schuiven en zoomen met knoppen, in hele dagen: scale 0,5 is inzoomen, direction ±1 een venster verder. */
export function moveWindow(w: DateWindow, first: string, last: string, scale: number, direction = 0): DateWindow {
  const lo = dayNumber(first);
  const hi = dayNumber(last);
  const r = toRange(w);
  const span = r.b - r.a;
  const centre = (r.a + r.b) / 2 + direction * span;
  const next = clampRange({ a: centre - (span * scale) / 2, b: centre + (span * scale) / 2 }, lo, hi);
  return { from: isoDay(Math.round(next.a)), to: isoDay(Math.round(next.b)) };
}

// ── Labels ────────────────────────────────────────────────────────────────────

const parts = (d: string) => ({ y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1, day: Number(d.slice(8, 10)) });

/** "7 sep 2026", of "7 sep" zonder jaar. */
export function fmtDate(d: string, year = true): string {
  const p = parts(d);
  return `${p.day} ${NL_MONTHS[p.m]}${year ? ` ${p.y}` : ""}`;
}

/** "ma 7 sep 2026". */
export function fmtWeekday(d: string): string {
  return `${NL_WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]} ${fmtDate(d)}`;
}

/** "3 mrt – 1 jun 2026", of met twee jaartallen over een jaargrens. */
export function fmtWindow(w: DateWindow): string {
  const same = w.from.slice(0, 4) === w.to.slice(0, 4);
  return `${fmtDate(w.from, !same)} – ${fmtDate(w.to)}`;
}

/** Aantal dagen in het venster, beide grenzen meegeteld. */
export const windowDays = (w: DateWindow) => dayNumber(w.to) - dayNumber(w.from) + 1;

// ── Tijdas ────────────────────────────────────────────────────────────────────

export type TimeTick = { day: number; label: string; major: boolean };

type Unit = { kind: "day" | "week" | "month" | "year"; step: number };
const UNITS: Unit[] = [
  { kind: "day", step: 1 },
  { kind: "day", step: 2 },
  { kind: "week", step: 1 },
  { kind: "week", step: 2 },
  { kind: "month", step: 1 },
  { kind: "month", step: 2 },
  { kind: "month", step: 3 },
  { kind: "month", step: 6 },
  { kind: "year", step: 1 },
  { kind: "year", step: 2 },
  { kind: "year", step: 5 },
];

// 11px tabulaire cijfers en kleine letters: ruim 6px per teken.
const CHAR_PX = 6.4;
const TICK_GAP_PX = 14;

function ticksFor(unit: Unit, a: number, b: number): TimeTick[] {
  const out: TimeTick[] = [];
  const first = Math.ceil(a);
  const last = Math.floor(b);
  if (unit.kind === "day" || unit.kind === "week") {
    // 1970-01-05 (dag 4) was een maandag.
    const period = unit.kind === "day" ? unit.step : 7 * unit.step;
    const offset = unit.kind === "day" ? 0 : 4;
    let n = first + ((((offset - first) % period) + period) % period);
    for (; n <= last; n += period) {
      const d = isoDay(n);
      const p = parts(d);
      // Het eerste van de maand of een maandag na een maandwissel draagt de maand al; het jaar staat
      // op 1 januari zodat een venster over de jaargrens zich laat lezen.
      out.push({ day: n, label: p.m === 0 && p.day <= period ? `${p.day} jan ${p.y}` : fmtDate(d, false), major: p.day <= period });
    }
    return out;
  }
  const start = parts(isoDay(first));
  let y = start.y;
  let m = start.m;
  if (unit.kind === "year") m = 0;
  for (;;) {
    const n = Date.UTC(y, m, 1) / DAY;
    if (n > last) break;
    const monthIndex = y * 12 + m;
    const take = unit.kind === "year" ? m === 0 && y % unit.step === 0 : monthIndex % unit.step === 0;
    if (n >= first && take) {
      out.push(
        unit.kind === "year" || m === 0
          ? { day: n, label: String(y), major: true }
          : { day: n, label: NL_MONTHS[m], major: false },
      );
    }
    if (unit.kind === "year") y += 1;
    else if (++m === 12) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/**
 * Ticks voor het venster [a, b] (dagnummers) bij `width` pixels: de fijnste
 * eenheid (dag, week, maand, kwartaal, jaar) waarbij geen twee labels elkaar
 * raken. Maanden heten "sep", januari draagt het jaartal.
 */
export function timeTicks(a: number, b: number, width: number): TimeTick[] {
  const span = Math.max(b - a, 1);
  const pxPerDay = width / span;
  for (const unit of UNITS) {
    const ticks = ticksFor(unit, a, b);
    if (ticks.length < 2 && unit.kind !== "year") continue;
    const widest = Math.max(...ticks.map((t) => t.label.length), 3) * CHAR_PX;
    const approxGap = { day: 1, week: 7, month: 30.4, year: 365.25 }[unit.kind] * unit.step * pxPerDay;
    // Een maandstap is niet overal even lang (februari): met 28 dagen rekenen houdt ook die vrij.
    const minGap = unit.kind === "month" ? approxGap * (28 / 30.4) : approxGap;
    if (minGap >= widest + TICK_GAP_PX) return ticks;
  }
  return ticksFor({ kind: "year", step: 10 }, a, b);
}

// ── Reeksen ───────────────────────────────────────────────────────────────────

/** De mediane afstand tussen twee punten, in dagen: 1 voor een dagreeks, 7 voor een weekreeks. */
export function typicalStep(points: DayPoint[]): number {
  if (points.length < 2) return 1;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) gaps.push(dayNumber(points[i].d) - dayNumber(points[i - 1].d));
  gaps.sort((x, y) => x - y);
  return Math.max(1, gaps[Math.floor(gaps.length / 2)]);
}

/**
 * Voortschrijdend gemiddelde over de laatste `days` dagen (op tijd, niet op
 * aantal punten: een ontbrekende dag telt niet als nul). Begint pas als het
 * venster voor het eerst helemaal gevuld kan zijn, zodat het begin niet op een
 * handvol punten leunt.
 */
export function movingAverage(points: DayPoint[], days: number): DayPoint[] {
  if (points.length === 0 || days <= 1) return points;
  const step = typicalStep(points);
  const t = points.map((p) => dayNumber(p.d));
  const out: DayPoint[] = [];
  let lo = 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i].v;
    while (t[lo] <= t[i] - days) sum -= points[lo++].v;
    if (t[i] - t[0] >= days - step) out.push({ d: points[i].d, v: sum / (i - lo + 1) });
  }
  return out;
}

/** Kleinste kwadraten over de punten, als twee eindpunten. */
export function linearTrend(points: DayPoint[]): DayPoint[] {
  if (points.length < 3) return [];
  const t = points.map((p) => dayNumber(p.d));
  const n = points.length;
  const mx = t.reduce((s, v) => s + v, 0) / n;
  const my = points.reduce((s, p) => s + p.v, 0) / n;
  let num = 0;
  let den = 0;
  t.forEach((x, i) => {
    num += (x - mx) * (points[i].v - my);
    den += (x - mx) ** 2;
  });
  const slope = den ? num / den : 0;
  return [
    { d: points[0].d, v: my + slope * (t[0] - mx) },
    { d: points[n - 1].d, v: my + slope * (t[n - 1] - mx) },
  ];
}

/** Index van het eerste punt met dagnummer >= day (binaire zoektocht over oplopende dagen). */
export function lowerBound(days: number[], day: number): number {
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index van het punt het dichtst bij `day`, of -1 bij een lege reeks. */
export function nearestIndex(days: number[], day: number): number {
  if (days.length === 0) return -1;
  const i = lowerBound(days, day);
  if (i === 0) return 0;
  if (i === days.length) return days.length - 1;
  return day - days[i - 1] <= days[i] - day ? i - 1 : i;
}
