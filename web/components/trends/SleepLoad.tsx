"use client";

// Slaap en rusthartslag tegen belasting, binnen het venster van de tijdbalk: twee spreidingsdiagrammen met per dag
// (belasting van die dag tegen de nacht erna) of per week (opgetelde belasting tegen het weekgemiddelde) één punt,
// een gestippelde kleinste-kwadratenlijn en in woorden het verschil tussen de zwaarste en de lichtste helft.
// Bewust neutraal: een verband is geen oorzaak.

import { useLayoutEffect, useMemo, useState } from "react";
import { Tabs } from "@/components/ds";
import { niceTicks, tickDecimals } from "@/lib/chartScale";
import { fmtDate, type DateWindow } from "@/lib/timeline";
import { T } from "@/lib/texts";
import type { FormRow, RecoveryDay } from "@/lib/training";

const TS = T.trends.sleepLoad;
const MIN_POINTS = 6;
const MIN_DAYS_PER_WEEK = 4;
const PAD = { top: 8, right: 10, bottom: 20, left: 38 };
const H = 190;

type Point = { label: string; load: number; sleep: number | null; rhr: number | null };

const num = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
const nextDay = (d: string) => {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};
const mondayOf = (d: string) => {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

function points(form: FormRow[], recovery: RecoveryDay[], w: DateWindow, mode: "day" | "week", today: string): Point[] {
  const night = new Map(recovery.map((r) => [r.date, r]));
  if (mode === "day") {
    return form
      .filter((f) => f.date >= w.from && f.date <= w.to)
      .map((f) => {
        const r = night.get(nextDay(f.date));
        return { label: fmtDate(f.date), load: f.load, sleep: r?.sleep_h ?? null, rhr: r?.resting_hr ?? null };
      })
      .filter((p) => p.sleep != null || p.rhr != null);
  }
  const thisWeek = mondayOf(today);
  const weeks = new Map<string, { load: number; days: number; sleep: number[]; rhr: number[] }>();
  for (const f of form) {
    const wk = mondayOf(f.date);
    if (wk < w.from || wk > w.to || wk >= thisWeek) continue; // hele weken in het venster
    const cell = weeks.get(wk) ?? { load: 0, days: 0, sleep: [], rhr: [] };
    cell.load += f.load;
    cell.days += 1;
    const r = night.get(nextDay(f.date));
    if (r?.sleep_h != null) cell.sleep.push(r.sleep_h);
    if (r?.resting_hr != null) cell.rhr.push(r.resting_hr);
    weeks.set(wk, cell);
  }
  return [...weeks.entries()]
    .filter(([, c]) => c.days === 7 && (c.sleep.length >= MIN_DAYS_PER_WEEK || c.rhr.length >= MIN_DAYS_PER_WEEK))
    .map(([wk, c]) => ({
      label: fmtDate(wk),
      load: c.load,
      sleep: c.sleep.length >= MIN_DAYS_PER_WEEK ? avg(c.sleep) : null,
      rhr: c.rhr.length >= MIN_DAYS_PER_WEEK ? avg(c.rhr) : null,
    }));
}

/** Gemiddelde van `key` in de zwaarste en de lichtste helft (op belasting). */
function halves(pts: Point[], key: "sleep" | "rhr"): [number, number] | null {
  const xs = pts.filter((p) => p[key] != null).sort((a, b) => a.load - b.load);
  if (xs.length < MIN_POINTS) return null;
  const half = Math.floor(xs.length / 2);
  return [avg(xs.slice(xs.length - half).map((p) => p[key]!))!, avg(xs.slice(0, half).map((p) => p[key]!))!];
}

function fit(xy: [number, number][]): [number, number] | null {
  if (xy.length < 3) return null;
  const mx = avg(xy.map((p) => p[0]))!;
  const my = avg(xy.map((p) => p[1]))!;
  const den = xy.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  if (!den) return null;
  const slope = xy.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / den;
  return [my - slope * mx, slope];
}

function Scatter({ pts, field, title, unit, digits, colour }: { pts: Point[]; field: "sleep" | "rhr"; title: string; unit: string; digits: number; colour: string }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth || 320);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const xy = pts.filter((p) => p[field] != null).map((p) => [p.load, p[field]!] as [number, number]);
  const plotW = Math.max(width - PAD.left - PAD.right, 40);
  const plotH = H - PAD.top - PAD.bottom;
  const xMax = Math.max(...xy.map((p) => p[0]), 1);
  const ys = xy.map((p) => p[1]);
  const yPad = Math.max((Math.max(...ys) - Math.min(...ys)) * 0.1, field === "sleep" ? 0.25 : 1);
  const yLo = Math.min(...ys) - yPad;
  const yHi = Math.max(...ys) + yPad;
  const x = (v: number) => PAD.left + (v / (xMax * 1.04)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yLo) / (yHi - yLo || 1)) * plotH;
  const xTicks = niceTicks(0, xMax, Math.max(2, Math.floor(plotW / 70)));
  const yTicks = niceTicks(yLo, yHi, 4);
  const yd = tickDecimals(yTicks);
  const line = fit(xy);

  return (
    <div>
      <h3 className="mb-1 text-[12.5px] font-medium">{title}</h3>
      <div ref={setEl} className="w-full">
        {xy.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">{TS.tooFew}</p>
        ) : (
          <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`${title} / ${TS.load}`} className="block">
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--border-hairline)" />
                <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize="11" fill="var(--text-faint)" className="tabular-nums">{num(t, yd)}</text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--text-faint)" className="tabular-nums">{Math.round(t)}</text>
            ))}
            {line && (
              <line x1={x(0)} x2={x(xMax)} y1={y(line[0])} y2={y(line[0] + line[1] * xMax)} stroke="var(--chart-2)" strokeOpacity="0.6" strokeWidth="1.25" strokeDasharray="5 4" />
            )}
            {pts.map((p) =>
              p[field] == null ? null : (
                <circle key={p.label} cx={x(p.load)} cy={y(p[field]!)} r="3.5" fill={colour} fillOpacity="0.7" stroke="var(--surface-card)" strokeWidth="1">
                  <title>{TS.point(p.label, String(Math.round(p.load)), `${num(p[field]!, digits)}${unit}`)}</title>
                </circle>
              ),
            )}
          </svg>
        )}
      </div>
      {xy.length > 0 && <p className="mt-0.5 text-right text-[11px] text-ink-muted">{TS.loadAxis}</p>}
    </div>
  );
}

export default function SleepLoad({ form, recovery, window: w, today }: { form: FormRow[]; recovery: RecoveryDay[]; window: DateWindow; today: string }) {
  const [mode, setMode] = useState<"day" | "week">("week");
  const pts = useMemo(() => points(form, recovery, w, mode, today), [form, recovery, w, mode, today]);
  const sleep = halves(pts, "sleep");
  const rhr = halves(pts, "rhr");
  const hasRhr = pts.some((p) => p.rhr != null);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Tabs variant="segmented" items={[{ id: "day", label: TS.perDay }, { id: "week", label: TS.perWeek }]} value={mode} onChange={(v) => setMode(v as "day" | "week")} ariaLabel={TS.view} />
      </div>
      {pts.length < MIN_POINTS ? (
        <p className="py-6 text-center text-sm text-ink-muted">{TS.tooFew}</p>
      ) : (
        <div className={`grid gap-6 ${hasRhr ? "md:grid-cols-2" : ""}`}>
          <Scatter pts={pts} field="sleep" title={TS.sleepTitle} unit={TS.hours} digits={1} colour="var(--chart-5)" />
          {hasRhr && <Scatter pts={pts} field="rhr" title={TS.rhrTitle} unit={TS.bpm} digits={0} colour="var(--chart-6)" />}
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-ink-muted">
        {mode === "day" ? TS.explainDay : TS.explainWeek}
        {sleep ? ` ${TS.compare(mode === "day" ? "dag" : "week", num(sleep[0]), num(sleep[1]))}` : ""}
        {rhr ? ` ${TS.compareRhr(num(rhr[0], 0), num(rhr[1], 0))}` : ""} {TS.neutral}
      </p>
    </div>
  );
}
