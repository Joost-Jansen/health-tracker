"use client";

// Heart rate through one day and the night before it, on a clock axis (minutes after midnight; the evening before
// is negative). The sleep is a shaded band behind the line with the sleep stages as a thin strip under it, and
// the user's normal resting heart rate is a dashed reference line.
//
// Why not LineChart or TimeChart: both put one point per day on the x axis. Here x is the time of day, the line
// has to break where the watch was off (a gap is not a slope), and the sleep is a band, not a series.
// The rules are LineChart's: no frame, dotted grid, y labels on the right, the measured width as viewBox,
// pointing gives a dotted cursor, one dot and one quiet readout; the arrow keys step through the readings.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { niceTicks } from "@/lib/chartScale";

export type SleepStage = "deep" | "light" | "rem" | "awake";
export type DaySleep = { start: number; end: number; stages: { start: number; end: number; stage: SleepStage }[] };

/** Stage colours: deep and light the same hue (light is fainter), REM and awake their own. */
export const STAGE_COLOUR: Record<SleepStage, { fill: string; opacity: number }> = {
  deep: { fill: "var(--chart-3)", opacity: 1 },
  light: { fill: "var(--chart-3)", opacity: 0.4 },
  rem: { fill: "var(--chart-5)", opacity: 1 },
  awake: { fill: "var(--chart-4)", opacity: 1 },
};

const PAD = { top: 12, right: 44, bottom: 20 };
const STRIP = 8; // the sleep-stage strip under the plot
const GAP_MIN = 10; // more than this between two readings: the watch was off, the line breaks

/** 23:40 from a minute after midnight (negative: the evening before). */
export const clock = (minute: number) => {
  const m = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export default function DayHeartChart({
  from,
  to,
  points,
  sleep,
  nextSleepStart,
  normal,
  stageLabel,
  ariaLabel,
  format,
  height = 240,
}: {
  from: number;
  to: number;
  points: [number, number][];
  sleep: DaySleep | null;
  nextSleepStart: number | null;
  /** The normal resting heart rate: a dashed line, named in the page's legend. */
  normal: number | null;
  stageLabel: Record<SleepStage, string>;
  ariaLabel: string;
  /** A reading in the readout: "52 bpm". */
  format: (bpm: number) => string;
  height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(el.clientWidth || 720);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 720));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const range = useMemo(() => {
    const values = points.map((p) => p[1]);
    if (normal != null) values.push(normal);
    return values.length ? { lo: Math.min(...values) - 3, hi: Math.max(...values) + 3 } : null;
  }, [points, normal]);
  if (!range || points.length < 2) return null;

  const strip = sleep ? STRIP + 6 : 0;
  const plotW = Math.max(w - PAD.right, 10);
  const plotH = Math.max(height - PAD.top - PAD.bottom - strip, 10);
  const x = (m: number) => ((m - from) / (to - from)) * plotW;
  const ticks = niceTicks(range.lo, range.hi, 4);
  const lo = Math.min(range.lo, ticks[0] ?? range.lo);
  const hi = Math.max(range.hi, ticks[ticks.length - 1] ?? range.hi);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * plotH;
  // every 3 hours, every 6 on a phone; on the whole hour
  const every = plotW < 420 && to - from > 720 ? 360 : 180;
  const hours: number[] = [];
  for (let m = Math.ceil(from / every) * every; m <= to; m += every) hours.push(m);

  let d = "";
  points.forEach(([m, v], i) => {
    const jump = i === 0 || m - points[i - 1][0] > GAP_MIN;
    d += `${jump ? "M" : "L"}${x(m).toFixed(1)} ${y(v).toFixed(1)}`;
  });

  const stageAt = (m: number) => sleep?.stages.find((s) => s.start <= m && m < s.end)?.stage;
  const bands = [
    sleep && { start: Math.max(from, sleep.start), end: Math.min(to, sleep.end) },
    nextSleepStart != null && nextSleepStart < to && { start: nextSleepStart, end: to },
  ].filter((b): b is { start: number; end: number } => !!b && b.end > b.start);

  function locate(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const m = from + (Math.min(Math.max(clientX - rect.left, 0), plotW) / plotW) * (to - from);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i][0] - m) < Math.abs(points[best][0] - m)) best = i;
    setHover(best);
  }

  const hp = hover != null ? points[hover] : null;
  const hStage = hp ? stageAt(hp[0]) : undefined;

  return (
    <div
      ref={box}
      className="ds-chart select-none"
      tabIndex={0}
      role="group"
      aria-label={ariaLabel}
      style={{ height, WebkitTouchCallout: "none", touchAction: "pan-y" }}
      onFocus={() => setHover((i) => i ?? points.length - 1)}
      onBlur={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const step = e.shiftKey ? 15 : 1;
        setHover((i) => Math.min(points.length - 1, Math.max(0, (i ?? points.length - 1) + (e.key === "ArrowRight" ? step : -step))));
      }}
      onMouseMove={(e) => locate(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => locate(e.touches[0].clientX)}
      onTouchMove={(e) => locate(e.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}
    >
      <svg height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel}>
        {bands.map((b, i) => (
          <rect key={i} x={x(b.start)} width={x(b.end) - x(b.start)} y={PAD.top} height={plotH} fill="var(--chart-band)" />
        ))}

        <g className="ds-chart__grid">
          {ticks.map((t) => (
            <line key={t} x1="0" x2={plotW} y1={y(t)} y2={y(t)} />
          ))}
        </g>

        <g className="ds-chart__axis">
          {ticks.map((t) => (
            <text key={t} x={plotW + 8} y={y(t) + 3.5}>
              {t}
            </text>
          ))}
          {hours.map((m) => (
            <text key={m} x={x(m)} y={height - 3} textAnchor={x(m) < 16 ? "start" : x(m) > plotW - 16 ? "end" : "middle"}>
              {clock(m)}
            </text>
          ))}
        </g>

        {normal != null && (
          <line x1="0" x2={plotW} y1={y(normal)} y2={y(normal)} stroke="var(--chart-2)" strokeWidth="1" strokeDasharray="4 4" opacity={0.7} />
        )}

        <path className="ds-chart__line" d={d} stroke="var(--chart-1)" strokeWidth={1.6} />

        {sleep && (
          <g aria-hidden>
            {sleep.stages
              .filter((s) => s.end > from && s.start < to)
              .map((s, i) => (
                <rect
                  key={i}
                  x={x(Math.max(from, s.start))}
                  width={Math.max(0.5, x(Math.min(to, s.end)) - x(Math.max(from, s.start)))}
                  y={PAD.top + plotH + 6}
                  height={STRIP}
                  fill={STAGE_COLOUR[s.stage].fill}
                  opacity={STAGE_COLOUR[s.stage].opacity}
                />
              ))}
          </g>
        )}

        {hp && (
          <g>
            <line className="ds-chart__cursor" x1={x(hp[0])} x2={x(hp[0])} y1={PAD.top} y2={PAD.top + plotH} />
            <circle className="ds-chart__dot" cx={x(hp[0])} cy={y(hp[1])} r="3.5" fill="var(--chart-1)" />
          </g>
        )}
      </svg>

      {hp && (
        <div
          className="ds-chart__tip"
          aria-live="polite"
          style={{ left: Math.min(Math.max(x(hp[0]), 50), plotW - 50), top: Math.max(y(hp[1]) - 10, 22) }}
        >
          <div style={{ color: "var(--text-on-ink-muted)" }}>
            {clock(hp[0])}
            {hStage ? ` · ${stageLabel[hStage]}` : ""}
          </div>
          <div>{format(hp[1])}</div>
        </div>
      )}
    </div>
  );
}
