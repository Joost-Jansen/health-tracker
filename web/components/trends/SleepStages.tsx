"use client";

// Trends, Recovery: the sleep stages over time, set up like the heart-rate zones under Training. At the top one bar
// per night, week or month within the period of the time bar, always 100% high and split into deep, light, REM
// and awake (deep at the bottom), with the average hours per night in the box at the pointer; below it the share of
// deep sleep and REM as lines. A stage Garmin did not record that night counts as 0.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/Card";
import LineChart from "@/components/charts/LineChart";
import { STAGE_COLOUR } from "@/components/charts/DayTimeline";
import { Tabs } from "@/components/ds";
import { useFormat, useT } from "@/lib/i18n";
import type { SleepNight, SleepStage } from "@/lib/training";

type Period = "night" | "week" | "month";
const STAGES: SleepStage[] = ["deep", "light", "rem", "awake"];
const ROLL: Record<Period, number> = { night: 7, week: 4, month: 3 };

type Bar = {
  start: string;
  end: string;
  nights: number;
  /** Hours per stage over all nights in the bar. */
  hours: Record<SleepStage, number>;
  /** Share of each stage of the time in bed (asleep + awake), 0-100. */
  pct: Record<SleepStage, number>;
  partial: boolean;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
function periodStart(day: string, p: Period): string {
  if (p === "night") return day;
  const d = new Date(`${day}T00:00:00Z`);
  if (p === "month") return `${day.slice(0, 7)}-01`;
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // Monday
  return iso(d);
}
function periodEnd(start: string, p: Period): string {
  const d = new Date(`${start}T00:00:00Z`);
  if (p === "week") d.setUTCDate(d.getUTCDate() + 6);
  if (p === "month") d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return iso(d);
}

function group(nights: SleepNight[], p: Period, today: string): Bar[] {
  const by = new Map<string, SleepNight[]>();
  for (const n of nights) {
    const k = periodStart(n.date, p);
    by.set(k, [...(by.get(k) ?? []), n]);
  }
  return [...by.keys()].sort().map((start) => {
    const items = by.get(start)!;
    const hours = Object.fromEntries(STAGES.map((s) => [s, items.reduce((sum, n) => sum + (n[s] || 0), 0)])) as Record<SleepStage, number>;
    const total = STAGES.reduce((sum, s) => sum + hours[s], 0);
    const pct = Object.fromEntries(STAGES.map((s) => [s, total ? (hours[s] / total) * 100 : 0])) as Record<SleepStage, number>;
    const end = periodEnd(start, p);
    return { start, end, nights: items.length, hours, pct, partial: p !== "night" && end >= today };
  });
}

export default function SleepStages({ nights, window: win }: { nights: SleepNight[]; window?: { from: string; to: string } }) {
  const t = useT();
  const f = useFormat();
  const S = t.texts.trends.sleepStages;
  const today = iso(new Date());
  const inWindow = useMemo(() => nights.filter((n) => !win?.from || (n.date >= win.from && n.date <= win.to)), [nights, win?.from, win?.to]);
  // per night up to two months, beyond that per week; months for a year or more
  const auto: Period = inWindow.length <= 62 ? "night" : inWindow.length <= 400 ? "week" : "month";
  const [chosen, setChosen] = useState<Period | null>(null);
  const period = chosen ?? auto;
  const bars = useMemo(() => group(inWindow, period, today), [inWindow, period, today]);

  const name = (s: SleepStage) => t.health.stage[s].charAt(0).toUpperCase() + t.health.stage[s].slice(1);
  const label = (b: Bar) =>
    period === "night" ? f.weekdayDay(b.start) : period === "week" ? `${f.dayMonth(b.start)} – ${f.dayMonth(b.end)}` : f.month(b.start);
  const short = (b: Bar) => (period === "month" ? f.monthShort(b.start) : f.dayMonth(b.start));

  // over the whole period: average hours per night and the share of each stage
  const all = useMemo(() => group(inWindow, "month", today).reduce(
    (acc, b) => {
      STAGES.forEach((s) => (acc.hours[s] += b.hours[s]));
      acc.nights += b.nights;
      return acc;
    },
    { hours: { deep: 0, light: 0, rem: 0, awake: 0 } as Record<SleepStage, number>, nights: 0 },
  ), [inWindow, today]);
  const allTotal = STAGES.reduce((s, k) => s + all.hours[k], 0);
  const perNight = (h: number, n: number) => f.duration(Math.round((h / Math.max(1, n)) * 3600));

  // Deep and REM as a share per bar, and a time-weighted average over the last few bars for the trend.
  const lines = useMemo(() => {
    const roll = ROLL[period];
    const avg = (s: SleepStage) =>
      bars.map((b, i) => {
        const win = bars.slice(Math.max(0, i - roll + 1), i + 1);
        const tot = win.reduce((sum, w) => sum + STAGES.reduce((x, k) => x + w.hours[k], 0), 0);
        return { d: b.start, v: tot ? (win.reduce((sum, w) => sum + w.hours[s], 0) / tot) * 100 : 0 };
      });
    return { deep: avg("deep"), rem: avg("rem") };
  }, [bars, period]);

  if (!nights.length) return null;
  return (
    <Card
      title={S.title}
      action={
        <Tabs
          variant="segmented"
          items={[{ id: "night", label: S.night }, { id: "week", label: t.dashboard.week }, { id: "month", label: t.dashboard.month }]}
          value={period}
          onChange={(v) => setChosen(v as Period)}
          ariaLabel={S.per}
        />
      }
    >
      {!bars.length ? (
        <p className="py-6 text-center text-sm text-ink-muted">{S.none}</p>
      ) : (
        <>
          <p className="mb-2 text-[13px] text-ink-muted">
            {S.summary(all.nights, perNight(allTotal - all.hours.awake, all.nights))}{" "}
            {STAGES.map((s) => `${name(s)} ${Math.round((all.hours[s] / allTotal) * 100)}% (${perNight(all.hours[s], all.nights)})`).join(" · ")}
          </p>
          <StageBars bars={bars} label={label} short={short} perNight={perNight} name={name} />

          {bars.length >= 2 && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-[13px] font-medium">{S.overTime}</span>
                <span className="text-[11.5px] text-ink-muted">{S.rolling(ROLL[period], period)}</span>
              </div>
              <LineChart
                height={180}
                format={(v) => `${Math.round(v)}%`}
                xFormat={period === "month" ? (d) => f.monthShort(d) : undefined}
                ariaLabel={S.overTime}
                series={[
                  { label: name("deep"), colour: STAGE_COLOUR.deep.fill, width: 2, points: lines.deep },
                  { label: name("rem"), colour: STAGE_COLOUR.rem.fill, width: 2, points: lines.rem },
                ]}
              />
            </div>
          )}
          <p className="mt-2 text-[11.5px] text-ink-muted">{S.note}</p>
        </>
      )}
    </Card>
  );
}

function StageBars({
  bars,
  label,
  short,
  perNight,
  name,
}: {
  bars: Bar[];
  label: (b: Bar) => string;
  short: (b: Bar) => string;
  perNight: (h: number, n: number) => string;
  name: (s: SleepStage) => string;
}) {
  const t = useT();
  const S = t.texts.trends.sleepStages;
  const [active, setActive] = useState<number | null>(null);
  const shown = active != null ? bars[active] : null;
  const row = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const every = width ? Math.max(1, Math.ceil(bars.length / Math.max(2, Math.floor(width / 52)))) : 1;
  const asleep = (b: Bar) => b.hours.deep + b.hours.light + b.hours.rem;

  return (
    <div>
      <div className="relative">
        <div role="group" aria-label={S.title} className="flex h-[150px] items-stretch gap-[3px] sm:h-[180px]" onMouseLeave={() => setActive(null)}>
          {bars.map((b, i) => (
            <button
              key={b.start}
              type="button"
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-label={`${label(b)}: ${STAGES.map((s) => `${name(s)} ${Math.round(b.pct[s])}%`).join(", ")}`}
              className="flex min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
            >
              {/* awake at the top, deep against the baseline */}
              {[...STAGES].reverse().map((s) =>
                b.pct[s] > 0 ? (
                  <span
                    key={s}
                    aria-hidden="true"
                    className="block w-full"
                    style={{ height: `${b.pct[s]}%`, background: STAGE_COLOUR[s].fill, opacity: STAGE_COLOUR[s].opacity * (b.partial ? 0.6 : 1) }}
                  />
                ) : null,
              )}
            </button>
          ))}
        </div>
        {shown && active != null && (
          <div
            className="ds-chart__tip"
            aria-live="polite"
            style={{
              left: `calc(${((active + 0.5) / bars.length) * 100}% ${active >= bars.length / 2 ? "- 10px" : "+ 10px"})`,
              top: 8,
              transform: active >= bars.length / 2 ? "translateX(-100%)" : "none",
              zIndex: 20,
            }}
          >
            <div className="font-semibold">{label(shown)}</div>
            <div className="opacity-80">
              {shown.nights > 1 ? S.asleepAvg(perNight(asleep(shown), shown.nights), shown.nights) : S.asleep(perNight(asleep(shown), 1))}
              {shown.partial ? ` · ${t.zones.running}` : ""}
            </div>
            {STAGES.map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: STAGE_COLOUR[s].fill, opacity: Math.max(0.6, STAGE_COLOUR[s].opacity) }} />
                <span className="opacity-80">{name(s)}</span>
                <span className="ml-auto pl-3 font-semibold">{Math.round(shown.pct[s])}%</span>
                <span className="w-12 text-right opacity-80">{perNight(shown.hours[s], shown.nights)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={row} aria-hidden="true" className="mt-1.5 flex gap-[3px]">
        {bars.map((b, i) => {
          const show = (bars.length - 1 - i) % every === 0;
          const edge = i === 0 ? "justify-start" : i === bars.length - 1 ? "justify-end" : "justify-center";
          return (
            <span key={b.start} className={`flex min-w-0 flex-1 ${edge} whitespace-nowrap text-[11px] leading-tight ${i === active ? "font-semibold text-text" : "text-ink-muted"}`}>
              <span className="flex-none">{show ? short(b) : ""}</span>
            </span>
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-ink-muted">
        {STAGES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: STAGE_COLOUR[s].fill, opacity: STAGE_COLOUR[s].opacity }} />
            {name(s)}
          </span>
        ))}
        {bars.some((b) => b.partial) && <span>· {t.zones.lighter}</span>}
      </div>
    </div>
  );
}
