"use client";

// Een grafiek op een echte tijdas: lijnen, trappen (records) of gestapelde
// weekstaven, met een voortschrijdend gemiddelde, een trendlijn en de piek.
//
// Waarom een nieuwe naast LineChart? LineChart zet de punten op hun volgnummer,
// niet op hun datum: een week zonder data kromp daar tot niets, en twee
// grafieken over dezelfde periode liepen niet gelijk. Hier is x een dagnummer,
// dus elke grafiek op Trends deelt dezelfde as en hetzelfde venster.
//
// Bediening, op elk apparaat hetzelfde idee:
//   · aanwijzen (muis of één vinger) zet een dradenkruis op het dichtstbijzijnde
//     punt en leest elke reeks op die dag af;
//   · slepen met de muis verschuift, Ctrl/⌘ + scrollen of knijpen op het
//     trackpad zoomt rond de muis, zijwaarts scrollen verschuift;
//   · twee vingers knijpen en schuiven op een telefoon;
//   · pijltjes lezen af, Shift + pijltjes verschuiven, + en − zoomen;
//   · dubbelklikken zet het venster terug.
// Tijdens het gebaar beweegt alleen deze grafiek; bij het loslaten gaat het
// nieuwe venster via `onWindow` naar de pagina, zodat alle grafieken meegaan
// zonder dat er bij elke muisbeweging tien grafieken opnieuw tekenen.
//
// De viewBox volgt de gemeten breedte (zoals LineChart), dus <text> mag in de
// svg staan zonder te vervormen.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Tabs } from "@/components/ds";
import { niceTicks } from "@/lib/chartScale";
import { trueMinus } from "@/lib/typography";
import {
  clampRange,
  dayNumber,
  fmtDate,
  fmtWeekday,
  isoDay,
  linearTrend,
  lowerBound,
  movingAverage,
  nearestIndex,
  panRange,
  timeTicks,
  toRange,
  toWindow,
  typicalStep,
  zoomRange,
  type DateWindow,
  type DayPoint,
  type DayRange,
} from "@/lib/timeline";

export type ChartSeries = {
  key: string;
  label: string;
  colour: string;
  /** Oplopend op datum. */
  points: DayPoint[];
  kind?: "line" | "step" | "bar";
  dash?: "solid" | "dashed" | "dotted";
  width?: number;
  /** Krijgt het voortschrijdend gemiddelde als dat aanstaat. Bij staven: het totaal van de stapel. */
  ma?: boolean;
  /** Kleinste-kwadratenlijn over het zichtbare stuk. */
  trend?: boolean;
  /** Markeer het hoogste (max) of laagste (min) punt in beeld. */
  peak?: "max" | "min";
  peakLabel?: string;
  /** Vlak onder de lijn; alleen bij één lijn. */
  fill?: boolean;
};

export type ChartMarker = { d: string; label: string };
export type MaOption = { days: number; label: string };

export const DAILY_MA: MaOption[] = [
  { days: 0, label: "Uit" },
  { days: 7, label: "7 d" },
  { days: 28, label: "28 d" },
];
export const WEEKLY_MA: MaOption[] = [
  { days: 0, label: "Uit" },
  { days: 28, label: "4 wk" },
  { days: 56, label: "8 wk" },
];

const PAD = { top: 18, right: 46, bottom: 22 };
const DASH: Record<string, string | undefined> = { solid: undefined, dashed: "5 4", dotted: "1 4" };
const MA_COLOUR_BARS = "var(--chart-2)";

/** Ronde klokwaarden (seconden) voor een tempo- of tijdas: 5 s, 10 s, 15 s, 30 s, 1 min … in plaats van 50 s. */
function clockTicks(lo: number, hi: number, max: number): number[] {
  const steps = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600];
  const count = (st: number) => Math.floor(hi / st) - Math.ceil(lo / st) + 1;
  const step = steps.find((st) => count(st) <= max) ?? 3600;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t);
  return out;
}

type Prepared = ChartSeries & { days: number[]; step: number; avg: DayPoint[]; avgDays: number[] };

function readStored(key: string | undefined, fallback: number): number {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(`chart-ma:${key}`);
    return raw === null ? fallback : Number(raw);
  } catch {
    return fallback;
  }
}

export default function TimeChart({
  series,
  ariaLabel,
  format,
  unit = "",
  height = 220,
  invert = false,
  baseline,
  window,
  domain,
  onWindow,
  onReset,
  maOptions,
  maDefault = 0,
  storageKey,
  barDays = 7,
  markers = [],
  legend,
  totalLabel = "Totaal",
  clock = false,
  empty = "Nog te weinig data.",
}: {
  series: ChartSeries[];
  ariaLabel: string;
  format: (v: number) => string;
  unit?: string;
  height?: number;
  /** Lager is beter (tempo, rusthartslag): kleinere waarden staan bovenaan. */
  invert?: boolean;
  /** Stippellijn op deze waarde, bijvoorbeeld 0 bij vorm. */
  baseline?: number;
  /** Het gedeelde venster van de pagina. Zonder: de hele reeks, lokaal te zoomen. */
  window?: DateWindow;
  /** De grenzen waarbinnen geschoven en gezoomd mag worden. Standaard de data zelf. */
  domain?: DateWindow;
  onWindow?: (w: DateWindow) => void;
  /** Dubbelklik: terug naar de gekozen periode. */
  onReset?: () => void;
  maOptions?: MaOption[];
  maDefault?: number;
  /** Onthoudt de keuze voor het gemiddelde per grafiek (localStorage). */
  storageKey?: string;
  /** Breedte van één staaf in dagen (weekstaven: 7). */
  barDays?: number;
  /** Verticale markeringen, bijvoorbeeld wedstrijden. */
  markers?: ChartMarker[];
  /** Legenda tonen (en reeksen aan/uit kunnen zetten). Standaard vanaf twee reeksen. */
  legend?: boolean;
  totalLabel?: string;
  /** Waarden zijn seconden (tempo, tijd): ticks op ronde klokwaarden. */
  clock?: boolean;
  empty?: string;
}) {
  // Een callback-ref via state: de grafiek kan eerst leeg zijn en pas later een element krijgen,
  // en dan moeten de meting en de wiel-handler alsnog aanhaken.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  box.current = el;
  const clipId = `clip${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [w, setW] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [maDays, setMaDays] = useState(maDefault);

  useLayoutEffect(() => {
    if (!el) return;
    setW(el.clientWidth || 640);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 640));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  // De keuze voor het gemiddelde pas na het laden lezen: tijdens het bouwen van
  // de statische pagina bestaat localStorage niet.
  useEffect(() => {
    setMaDays(readStored(storageKey, maDefault));
  }, [storageKey, maDefault]);

  const chooseMa = (days: number) => {
    setMaDays(days);
    if (!storageKey) return;
    try {
      localStorage.setItem(`chart-ma:${storageKey}`, String(days));
    } catch {
      /* privévenster: dan onthouden we het niet */
    }
  };

  // ── Data voorbereiden: dagnummers, stap, gemiddelde. Alleen opnieuw als de data of de keuze verandert.
  const prepared = useMemo<Prepared[]>(
    () =>
      series.map((s) => {
        const days = s.points.map((p) => dayNumber(p.d));
        const avg = maDays > 0 && s.ma && s.kind !== "bar" ? movingAverage(s.points, maDays) : [];
        return { ...s, days, step: typicalStep(s.points), avg, avgDays: avg.map((p) => dayNumber(p.d)) };
      }),
    [series, maDays],
  );
  const shown = useMemo(() => prepared.filter((s) => !hidden.has(s.key) && s.points.length > 0), [prepared, hidden]);
  const bars = shown.filter((s) => s.kind === "bar");

  // Gestapelde staven: per datum de onder- en bovenkant van elk stuk.
  const stack = useMemo(() => {
    const byDay = new Map<number, { total: number; parts: Map<string, [number, number]> }>();
    for (const s of bars) {
      s.points.forEach((p, i) => {
        const day = s.days[i];
        const cell = byDay.get(day) ?? { total: 0, parts: new Map() };
        const v = Math.max(p.v, 0);
        cell.parts.set(s.key, [cell.total, cell.total + v]);
        cell.total += v;
        byDay.set(day, cell);
      });
    }
    const days = [...byDay.keys()].sort((a, b) => a - b);
    const totals: DayPoint[] = days.map((d) => ({ d: isoDay(d), v: byDay.get(d)!.total }));
    const anyMa = bars.some((s) => s.ma);
    const avg = anyMa && maDays > 0 ? movingAverage(totals, maDays) : [];
    return { byDay, days, totals, avg, avgDays: avg.map((p) => dayNumber(p.d)) };
  }, [bars, maDays]);

  // ── Grenzen
  const extent = useMemo(() => {
    if (domain) {
      const lo = dayNumber(domain.from);
      const hi = dayNumber(domain.to);
      return hi > lo ? { lo, hi } : null;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of prepared) {
      if (!s.days.length) continue;
      lo = Math.min(lo, s.days[0]);
      hi = Math.max(hi, s.days[s.days.length - 1] + (s.kind === "bar" ? barDays - 1 : 0));
    }
    return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? { lo, hi } : null;
  }, [prepared, domain, barDays]);

  const wanted = useMemo<DayRange | null>(() => {
    if (!extent) return null;
    return clampRange(window ? toRange(window) : { a: extent.lo, b: extent.hi }, extent.lo, extent.hi);
  }, [window, extent]);

  const [view, setView] = useState<DayRange | null>(wanted);
  const wantedKey = wanted ? `${wanted.a}:${wanted.b}` : "";
  useEffect(() => {
    setView(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);

  const plotW = Math.max(w - PAD.right, 10);
  const plotH = Math.max(height - PAD.top - PAD.bottom, 10);

  // Refs voor de wiel-handler, die buiten React om aan het element hangt.
  const live = useRef({ view, extent, plotW });
  live.current = { view, extent, plotW };

  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useCallback(
    (r: DayRange | null) => {
      if (!r || !onWindow) return;
      onWindow(toWindow({ a: Math.round(r.a), b: Math.round(r.b) }));
    },
    [onWindow],
  );

  // Ctrl/⌘ + scrollen (en knijpen op een trackpad, dat de browser als ctrl + wiel meldt) zoomt;
  // zijwaarts scrollen verschuift. Gewoon scrollen blijft de pagina scrollen.
  useEffect(() => {
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const { view: v, extent: ex, plotW: pw } = live.current;
      if (!v || !ex) return;
      const zoom = e.ctrlKey || e.metaKey;
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2;
      if (!zoom && !sideways) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = Math.min(Math.max(e.clientX - rect.left, 0), pw);
      const span = v.b - v.a;
      const next = zoom
        ? zoomRange(v, Math.min(Math.max(Math.exp(e.deltaY * 0.01), 0.5), 2), v.a + (px / pw) * span, ex.lo, ex.hi)
        : panRange(v, (e.deltaX / pw) * span, ex.lo, ex.hi);
      live.current.view = next;
      setView(next);
      setHover(null);
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => commit(live.current.view), 280);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [commit, el]);
  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);

  // ── Schalen
  const a = view?.a ?? 0;
  const b = view?.b ?? 1;
  const span = Math.max(b - a, 1e-6);
  const x = (day: number) => ((day - a) / span) * plotW;
  const dayAt = (px: number) => a + (px / plotW) * span;

  // Indexbereik dat in beeld is, met één buur aan elke kant zodat een lijn de rand haalt.
  const visible = (days: number[], extra = 0) => {
    const i0 = Math.max(0, lowerBound(days, a - extra) - 1);
    const i1 = Math.min(days.length - 1, lowerBound(days, b + extra));
    return [i0, i1] as const;
  };
  const strictlyVisible = (days: number[]) => {
    const i0 = lowerBound(days, a - 0.5);
    const i1 = lowerBound(days, b + 0.5) - 1;
    return [i0, i1] as const;
  };

  const yModel = useMemo(() => {
    if (!view) return null;
    const vals: number[] = [];
    let anyBar = false;
    for (const s of shown) {
      if (s.kind === "bar") {
        anyBar = true;
        continue;
      }
      const [i0, i1] = s.kind === "step" ? [Math.max(0, lowerBound(s.days, a) - 1), lowerBound(s.days, b + 0.5) - 1] : strictlyVisible(s.days);
      for (let i = i0; i <= i1; i++) if (i >= 0) vals.push(s.points[i].v);
      if (s.avg.length) {
        const [j0, j1] = strictlyVisible(s.avgDays);
        for (let j = j0; j <= j1; j++) vals.push(s.avg[j].v);
      }
    }
    if (anyBar) {
      vals.push(0);
      const [i0, i1] = visible(stack.days, barDays);
      for (let i = i0; i <= i1; i++) vals.push(stack.byDay.get(stack.days[i])!.total);
      const [j0, j1] = strictlyVisible(stack.avgDays);
      for (let j = j0; j <= j1; j++) vals.push(stack.avg[j].v);
    }
    if (baseline !== undefined && vals.length) vals.push(baseline);
    if (!vals.length) return { lo: 0, hi: 1, ticks: [] as number[], empty: true };
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = hi > lo ? (hi - lo) * 0.08 : Math.max(Math.abs(hi) * 0.05, 1);
    if (!(anyBar && lo === 0)) lo -= pad;
    hi += pad;
    const ticks = (clock ? clockTicks : niceTicks)(lo, hi, height < 170 ? 3 : 4);
    return { lo, hi, ticks, empty: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, stack, view, baseline, height, barDays, clock]);

  const yLo = yModel?.lo ?? 0;
  const yHi = yModel?.hi ?? 1;
  const ySpan = yHi - yLo || 1;
  const y = (v: number) => (invert ? PAD.top + ((v - yLo) / ySpan) * plotH : PAD.top + (1 - (v - yLo) / ySpan) * plotH);

  // ── Paden (alleen het zichtbare stuk; bij slepen en zoomen is dat wat elke frame kost)
  const paths = useMemo(() => {
    if (!view) return [];
    const out: { key: string; d: string; dots: [number, number][]; colour: string; width: number; dash?: string; opacity: number; fill?: string }[] = [];
    const line = (s: { points: DayPoint[]; days: number[]; step: number }, stepKind: boolean, extendTo?: number) => {
      const [i0, i1] = visible(s.days, s.step);
      const gap = Math.max(s.step * 3, s.step + 7);
      let d = "";
      const dots: [number, number][] = [];
      let runStart = -1;
      for (let i = i0; i <= i1; i++) {
        const px = x(s.days[i]);
        const py = y(s.points[i].v);
        const broken = i > i0 && !stepKind && s.days[i] - s.days[i - 1] > gap;
        if (i === i0 || broken) {
          if (runStart >= 0 && i - runStart === 1) dots.push([x(s.days[runStart]), y(s.points[runStart].v)]);
          d += `M${px.toFixed(1)} ${py.toFixed(1)}`;
          runStart = i;
        } else if (stepKind) {
          d += `H${px.toFixed(1)}V${py.toFixed(1)}`;
        } else {
          d += `L${px.toFixed(1)} ${py.toFixed(1)}`;
        }
      }
      if (runStart >= 0 && i1 - runStart === 0 && !stepKind) dots.push([x(s.days[runStart]), y(s.points[runStart].v)]);
      if (stepKind && extendTo !== undefined && i1 >= 0 && s.days[i1] < extendTo) d += `H${x(extendTo).toFixed(1)}`;
      return { d, dots };
    };
    const single = shown.filter((s) => s.kind !== "bar").length === 1;
    for (const s of shown) {
      if (s.kind === "bar") continue;
      const dim = s.avg.length > 0;
      const { d, dots } = line(s, s.kind === "step", extent?.hi);
      let fill: string | undefined;
      if (s.fill && single && d) {
        const [i0, i1] = visible(s.days, s.step);
        fill = `${d}L${x(s.days[i1]).toFixed(1)} ${PAD.top + plotH}L${x(s.days[i0]).toFixed(1)} ${PAD.top + plotH}Z`;
      }
      out.push({ key: s.key, d, dots, colour: s.colour, width: dim ? 1.25 : s.width ?? 1.75, dash: DASH[s.dash ?? "solid"], opacity: dim ? 0.5 : 1, fill });
      if (s.avg.length) {
        const avg = line({ points: s.avg, days: s.avgDays, step: s.step }, false);
        out.push({ key: `${s.key}-avg`, d: avg.d, dots: [], colour: s.colour, width: 2.5, opacity: 1 });
      }
    }
    if (stack.avg.length) {
      const avg = line({ points: stack.avg, days: stack.avgDays, step: 7 }, false);
      out.push({ key: "stack-avg", d: avg.d, dots: [], colour: MA_COLOUR_BARS, width: 2, opacity: 0.75 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, stack, view, plotW, plotH, yLo, yHi, invert, extent]);

  // ── Aanwijzen: naar het dichtstbijzijnde punt van een reeks die punten heeft.
  const snap = (day: number): number => {
    let best: number | null = null;
    const consider = (cand: number) => {
      if (best === null || Math.abs(cand - day) < Math.abs(best - day)) best = cand;
    };
    for (const s of shown) {
      if (s.kind === "step" || s.kind === "bar") continue;
      const i = nearestIndex(s.days, day);
      if (i >= 0 && s.days[i] >= a - 0.5 && s.days[i] <= b + 0.5) consider(s.days[i]);
    }
    if (bars.length) {
      const i = nearestIndex(stack.days.map((d) => d + barDays / 2), day);
      if (i >= 0) consider(stack.days[i] + barDays / 2);
    }
    return best ?? Math.round(day);
  };

  const pointers = useRef(new Map<number, number>());
  const gesture = useRef<
    | { kind: "pan"; x0: number; r0: DayRange; moved: boolean }
    | { kind: "pinch"; d0: number; c0: number; r0: DayRange }
    | null
  >(null);

  const localX = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    return rect ? Math.min(Math.max(clientX - rect.left, 0), plotW) : 0;
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!view || !extent) return;
    const px = localX(e.clientX);
    pointers.current.set(e.pointerId, px);
    if (e.pointerType === "mouse") {
      if (e.button !== 0) return;
      gesture.current = { kind: "pan", x0: px, r0: view, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (pointers.current.size >= 2) {
      const [p1, p2] = [...pointers.current.values()];
      gesture.current = { kind: "pinch", d0: Math.max(Math.abs(p1 - p2), 12), c0: (p1 + p2) / 2, r0: view };
      setHover(null);
    } else {
      setHover(snap(dayAt(px)));
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!view || !extent) return;
    const px = localX(e.clientX);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, px);
    const g = gesture.current;
    if (g?.kind === "pan") {
      const dx = px - g.x0;
      if (Math.abs(dx) > 3) g.moved = true;
      if (g.moved) {
        setHover(null);
        setView(panRange(g.r0, (-dx / plotW) * (g.r0.b - g.r0.a), extent.lo, extent.hi));
        return;
      }
    } else if (g?.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const [p1, p2] = [...pointers.current.values()];
      const d = Math.max(Math.abs(p1 - p2), 12);
      const c = (p1 + p2) / 2;
      const span0 = g.r0.b - g.r0.a;
      const nextSpan = (span0 * g.d0) / d;
      const anchor = g.r0.a + (g.c0 / plotW) * span0;
      const start = anchor - (c / plotW) * nextSpan;
      setView(clampRange({ a: start, b: start + nextSpan }, extent.lo, extent.hi));
      return;
    }
    if (e.pointerType !== "mouse" && !pointers.current.has(e.pointerId)) return;
    setHover(snap(dayAt(px)));
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "pan") {
      gesture.current = null;
      if (g.moved) commit(live.current.view);
    } else if (g?.kind === "pinch" && pointers.current.size < 2) {
      gesture.current = null;
      commit(live.current.view);
    }
    if (e.pointerType !== "mouse" && pointers.current.size === 0) setHover(null);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!view || !extent) return;
    const spanNow = view.b - view.a;
    let next: DayRange | null = null;
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.shiftKey) {
      next = panRange(view, (e.key === "ArrowRight" ? 0.25 : -0.25) * spanNow, extent.lo, extent.hi);
    } else if (e.key === "+" || e.key === "=") {
      next = zoomRange(view, 0.5, hover ?? (view.a + view.b) / 2, extent.lo, extent.hi);
    } else if (e.key === "-" || e.key === "_") {
      next = zoomRange(view, 2, hover ?? (view.a + view.b) / 2, extent.lo, extent.hi);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const from = hover ?? view.b;
      // Een stap verder dan het huidige punt, en dan het dichtstbijzijnde punt daar.
      const stepDays = Math.max(1, Math.min(...shown.map((s) => (s.kind === "bar" ? barDays : s.step))));
      setHover(snap(Math.min(Math.max(from + dir * stepDays, view.a), view.b)));
      return;
    } else if (e.key === "Escape") {
      setHover(null);
      return;
    }
    if (next) {
      e.preventDefault();
      setView(next);
      commit(next);
    }
  }

  // ── Wat er onder het dradenkruis staat
  const hoverIsBar = hover !== null && bars.length > 0 && !shown.some((s) => s.kind !== "bar" && s.kind !== "step");
  const readDay = hover === null ? null : hoverIsBar ? hover - barDays / 2 : hover;
  const solo = series.length === 1;
  const rows: { key: string; label: string; colour: string; value: string; strong?: boolean; at?: number }[] = [];
  if (readDay !== null) {
    for (const s of shown) {
      if (s.kind === "bar") continue;
      let i = -1;
      if (s.kind === "step") {
        i = lowerBound(s.days, readDay + 0.5) - 1;
      } else {
        const j = nearestIndex(s.days, readDay);
        if (j >= 0 && Math.abs(s.days[j] - readDay) <= Math.max(s.step * 0.6, 0.5)) i = j;
      }
      // Bij één reeks staat de naam al boven de grafiek: dan alleen "waarde" en "gem. 7 d".
      if (i >= 0) rows.push({ key: s.key, label: solo ? "waarde" : s.label, colour: s.colour, value: `${format(s.points[i].v)}${unit}`, at: s.kind === "step" ? undefined : s.days[i] });
      if (s.avg.length) {
        const j = nearestIndex(s.avgDays, readDay);
        if (j >= 0 && Math.abs(s.avgDays[j] - readDay) <= Math.max(s.step * 0.6, 0.5)) {
          const opt = maOptions?.find((o) => o.days === maDays);
          rows.push({ key: `${s.key}-avg`, label: `${solo ? "" : `${s.label} · `}gem. ${opt?.label ?? `${maDays} d`}`, colour: s.colour, value: `${format(s.avg[j].v)}${unit}`, strong: true });
        }
      }
    }
    const cell = stack.byDay.get(readDay);
    if (cell) {
      for (const s of [...bars].reverse()) {
        const part = cell.parts.get(s.key);
        if (part && part[1] - part[0] > 0) rows.push({ key: s.key, label: s.label, colour: s.colour, value: `${format(part[1] - part[0])}${unit}` });
      }
      if (bars.length > 1) rows.push({ key: "total", label: totalLabel, colour: "transparent", value: `${format(cell.total)}${unit}`, strong: true });
      const j = stack.avgDays.indexOf(readDay);
      if (j >= 0) {
        const opt = maOptions?.find((o) => o.days === maDays);
        rows.push({ key: "stack-avg", label: `gem. ${opt?.label ?? ""}`.trim(), colour: MA_COLOUR_BARS, value: `${format(stack.avg[j].v)}${unit}` });
      }
    }
  }
  // Een markering hoort bij het aangewezen punt als hij binnen een halve stap (of 6px) ligt.
  const halfStepPx = hoverIsBar ? (barDays / 2 / span) * plotW : 6;
  const hoverMarkers = hover === null ? [] : markers.filter((m) => Math.abs(x(dayNumber(m.d)) - x(hover)) <= Math.max(6, halfStepPx));
  const weekly = hoverIsBar || (shown.length > 0 && shown.every((s) => s.kind === "bar" || (s.kind !== "step" && s.step >= 6)));
  const readLabel = readDay === null ? "" : weekly ? `Week van ${fmtDate(isoDay(readDay))}` : fmtWeekday(isoDay(readDay));

  // ── Markeringen: piek, laatste punt, trend
  const extras = useMemo(() => {
    if (!view) return { peaks: [], trends: [], lasts: [] };
    const peaks: { key: string; px: number; py: number; colour: string; text: string }[] = [];
    const trends: { key: string; d: string }[] = [];
    const lasts: { key: string; px: number; py: number; colour: string }[] = [];
    for (const s of shown) {
      if (s.kind === "bar") continue;
      const [i0, i1] = strictlyVisible(s.days);
      if (i1 < i0) continue;
      if (s.peak) {
        let best = i0;
        for (let i = i0; i <= i1; i++) if (s.peak === "max" ? s.points[i].v > s.points[best].v : s.points[i].v < s.points[best].v) best = i;
        peaks.push({ key: s.key, px: x(s.days[best]), py: y(s.points[best].v), colour: s.colour, text: `${s.peakLabel ?? (s.peak === "max" ? "piek" : "beste")} ${format(s.points[best].v)}` });
      }
      if (s.trend) {
        const t = linearTrend(s.points.slice(i0, i1 + 1));
        if (t.length) trends.push({ key: s.key, d: `M${x(dayNumber(t[0].d)).toFixed(1)} ${y(t[0].v).toFixed(1)}L${x(dayNumber(t[1].d)).toFixed(1)} ${y(t[1].v).toFixed(1)}` });
      }
      if (s.kind !== "step" && i1 === s.points.length - 1) lasts.push({ key: s.key, px: x(s.days[i1]), py: y(s.points[i1].v), colour: s.colour });
    }
    return { peaks, trends, lasts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, view, plotW, plotH, yLo, yHi, invert]);

  const totalPoints = series.reduce((n, s) => n + s.points.length, 0);
  if (totalPoints < 2 || !extent || !view || !yModel) {
    return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>;
  }

  const xTicks = timeTicks(a, b, plotW);
  const showLegend = legend ?? series.length > 1;
  const hasMa = !!maOptions && series.some((s) => s.ma);
  const hx = hover !== null ? x(hover) : 0;
  const tipLeft = hx < plotW / 2;
  const barW = Math.max(1, (barDays / span) * plotW * 0.78);
  const [bi0, bi1] = visible(stack.days, barDays);
  const zeroY = y(Math.max(yLo, 0));

  return (
    <div>
      {(showLegend || hasMa) && (
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          {showLegend ? (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11.5px]" role="group" aria-label="Reeksen tonen of verbergen">
              {series.map((s) => {
                const off = hidden.has(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={!off}
                    title={off ? `${s.label} tonen` : `${s.label} verbergen`}
                    onClick={() =>
                      setHidden((h) => {
                        const n = new Set(h);
                        if (n.has(s.key)) n.delete(s.key);
                        else if (n.size < series.length - 1) n.add(s.key);
                        return n;
                      })
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors hover:bg-surface-2 ${off ? "text-ink-muted line-through decoration-1" : ""}`}
                  >
                    <span
                      aria-hidden
                      className="inline-block h-[3px] w-3 rounded-full"
                      style={{ background: s.colour, opacity: off ? 0.35 : 1, ...(s.kind === "bar" ? { height: 9, width: 9, borderRadius: 2 } : {}) }}
                    />
                    {s.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <span />
          )}
          {hasMa && (
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-ink-muted">Gemiddelde</span>
              <Tabs
                variant="segmented"
                items={maOptions!.map((o) => ({ id: String(o.days), label: o.label }))}
                value={String(maDays)}
                onChange={(id) => chooseMa(Number(id))}
                ariaLabel="Voortschrijdend gemiddelde"
              />
            </div>
          )}
        </div>
      )}

      <div
        ref={setEl}
        className="ds-chart relative cursor-grab select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage-300)] active:cursor-grabbing"
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Pijltjes lezen af, Shift + pijltjes verschuiven, plus en min zoomen.`}
        title="Slepen: verschuiven · Ctrl/⌘ + scrollen of knijpen: zoomen · dubbelklik: terug"
        style={{ height, WebkitTouchCallout: "none", touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !gesture.current) setHover(null);
        }}
        onDoubleClick={() => {
          if (onReset) onReset();
          else if (extent) {
            const full = { a: extent.lo, b: extent.hi };
            setView(full);
          }
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setHover(null)}
      >
        <svg height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel}>
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y={0} width={plotW} height={height - PAD.bottom + 2} />
            </clipPath>
          </defs>

          <g className="ds-chart__grid">
            {yModel.ticks.map((t) => (
              <line key={t} x1="0" x2={plotW} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          <g className="ds-chart__axis">
            {yModel.ticks.map((t) => (
              <text key={t} x={plotW + 8} y={y(t) + 3.5}>
                {trueMinus(format(t))}
              </text>
            ))}
            <line x1="0" x2={plotW} y1={height - PAD.bottom} y2={height - PAD.bottom} stroke="var(--border-hairline)" />
            {xTicks.map((t) => {
              const px = x(t.day);
              if (px < -1 || px > plotW + 1) return null;
              const anchor = px < 18 ? "start" : px > plotW - 18 ? "end" : "middle";
              return (
                <g key={t.day}>
                  <line x1={px} x2={px} y1={height - PAD.bottom} y2={height - PAD.bottom + (t.major ? 5 : 3)} stroke="var(--data-axis)" strokeOpacity={t.major ? 0.8 : 0.45} />
                  <text x={px} y={height - 4} textAnchor={anchor} style={t.major ? { fill: "var(--text-primary)", fontWeight: 500 } : undefined}>
                    {t.label}
                  </text>
                </g>
              );
            })}
          </g>

          {baseline !== undefined && baseline >= yLo && baseline <= yHi && (
            <line x1="0" x2={plotW} y1={y(baseline)} y2={y(baseline)} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="2 3" />
          )}

          <g clipPath={`url(#${clipId})`}>
            {markers.map((m) => {
              const px = x(dayNumber(m.d));
              if (px < 0 || px > plotW) return null;
              return (
                <g key={m.d + m.label}>
                  <line x1={px} x2={px} y1={PAD.top - 6} y2={height - PAD.bottom} stroke="var(--chart-6)" strokeOpacity="0.55" strokeDasharray="2 3" />
                  <path d={`M${px} ${PAD.top - 10}l4 4l-4 4l-4 -4z`} fill="var(--chart-6)" />
                </g>
              );
            })}

            {bars.length > 0 &&
              bi1 >= bi0 &&
              stack.days.slice(bi0, bi1 + 1).map((day) => {
                const cell = stack.byDay.get(day)!;
                const cx = x(day + barDays / 2);
                const active = hover !== null && Math.abs(hover - (day + barDays / 2)) < 0.01;
                const dim = hover !== null && !active;
                return (
                  <g key={day} opacity={dim ? 0.45 : 1} style={{ transition: "opacity 120ms" }}>
                    {bars.map((s) => {
                      const part = cell.parts.get(s.key);
                      if (!part || part[1] <= part[0]) return null;
                      const top = y(part[1]);
                      const bottom = y(part[0]);
                      return <rect key={s.key} x={cx - barW / 2} y={Math.min(top, bottom)} width={barW} height={Math.max(Math.abs(bottom - top) - 0.75, 0.75)} rx={Math.min(2.5, barW / 3)} fill={s.colour} />;
                    })}
                  </g>
                );
              })}

            {paths.map((p) =>
              p.fill ? <path key={`${p.key}-fill`} className="ds-chart__area" d={p.fill} fill="var(--chart-band)" /> : null,
            )}
            {extras.trends.map((t) => (
              <path key={`trend-${t.key}`} d={t.d} fill="none" stroke="var(--chart-2)" strokeOpacity="0.7" strokeWidth="1.25" strokeDasharray="5 4" />
            ))}
            {paths.map((p) => (
              <g key={p.key} opacity={p.opacity}>
                <path className="ds-chart__line" d={p.d} stroke={p.colour} strokeWidth={p.width} strokeDasharray={p.dash} />
                {p.dots.map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} r="2" fill={p.colour} />
                ))}
              </g>
            ))}
          </g>

          {extras.lasts.map((l) => (
            <circle key={`last-${l.key}`} cx={l.px} cy={l.py} r="3" fill={l.colour} stroke="var(--surface-card)" strokeWidth="1.5" />
          ))}
          {extras.peaks.map((p) => {
            const above = p.py > PAD.top + 16;
            const anchor = p.px < 30 ? "start" : p.px > plotW - 30 ? "end" : "middle";
            return (
              <g key={`peak-${p.key}`} pointerEvents="none">
                <circle cx={p.px} cy={p.py} r="4.5" fill="var(--surface-card)" stroke={p.colour} strokeWidth="2" />
                <text
                  x={p.px}
                  y={above ? p.py - 9 : p.py + 17}
                  textAnchor={anchor}
                  fill={p.colour}
                  style={{ fontFamily: "var(--font-sans)", fontSize: 10.5, fontWeight: 600, paintOrder: "stroke", stroke: "var(--surface-card)", strokeWidth: 3 }}
                >
                  {trueMinus(p.text)}
                </text>
              </g>
            );
          })}

          {hover !== null && (
            <g pointerEvents="none">
              {hoverIsBar ? (
                <rect x={hx - barW / 2 - 2} y={PAD.top - 4} width={barW + 4} height={height - PAD.bottom - PAD.top + 4} fill="var(--n-400)" fillOpacity="0.08" rx="3" />
              ) : (
                <line className="ds-chart__cursor" x1={hx} x2={hx} y1={PAD.top - 4} y2={height - PAD.bottom} />
              )}
              {shown
                .filter((s) => s.kind !== "bar")
                .flatMap((s) => {
                  const out: React.ReactNode[] = [];
                  const pt = (() => {
                    if (s.kind === "step") {
                      const i = lowerBound(s.days, (readDay ?? hover) + 0.5) - 1;
                      return i >= 0 ? s.points[i].v : null;
                    }
                    const j = nearestIndex(s.days, readDay ?? hover);
                    return j >= 0 && Math.abs(s.days[j] - (readDay ?? hover)) <= Math.max(s.step * 0.6, 0.5) ? s.points[j].v : null;
                  })();
                  if (pt !== null) {
                    out.push(<circle key={`h-${s.key}`} cx={hx} cy={y(pt)} r="9" fill={s.colour} fillOpacity="0.16" />);
                    out.push(<circle key={`d-${s.key}`} className="ds-chart__dot" cx={hx} cy={y(pt)} r="4" fill={s.colour} />);
                  }
                  if (s.avg.length) {
                    const j = nearestIndex(s.avgDays, readDay ?? hover);
                    if (j >= 0 && Math.abs(s.avgDays[j] - (readDay ?? hover)) <= Math.max(s.step * 0.6, 0.5))
                      out.push(<circle key={`a-${s.key}`} className="ds-chart__dot" cx={hx} cy={y(s.avg[j].v)} r="3.5" fill={s.colour} />);
                  }
                  return out;
                })}
            </g>
          )}
        </svg>

        {yModel.empty && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[12.5px] text-ink-muted" style={{ paddingRight: PAD.right }}>
            Geen data in deze periode.
          </p>
        )}

        {hover !== null && (rows.length > 0 || hoverMarkers.length > 0) && (
          <div
            aria-live="polite"
            className="pointer-events-none absolute z-10 min-w-[8.5rem] rounded-md px-3 py-2 text-[12px] leading-[1.45] tabular-nums shadow-lg"
            style={{
              top: PAD.top - 6,
              left: tipLeft ? Math.min(hx + 14, plotW) : undefined,
              right: tipLeft ? undefined : Math.max(w - hx + 14, 0),
              background: "var(--surface-inverse)",
              color: "var(--text-inverse)",
              maxWidth: Math.max(160, w * 0.62),
            }}
          >
            <div className="mb-0.5 whitespace-nowrap" style={{ opacity: 0.7 }}>
              {readLabel}
            </div>
            {rows.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3 whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: r.colour }} />
                  <span style={{ opacity: r.strong ? 1 : 0.85 }}>{r.label}</span>
                </span>
                <span className={r.strong ? "font-semibold" : ""}>{trueMinus(r.value)}</span>
              </div>
            ))}
            {hoverMarkers.map((m) => (
              <div key={m.d + m.label} className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                <span aria-hidden className="inline-block h-2 w-2 rotate-45" style={{ background: "var(--chart-6)" }} />
                <span className="truncate">{m.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
