"use client";

// Several lines over time, with a shared time axis and a pointer line that shows
// all series on the same day at once.
//
// Meridian's chart rules, and why they are so:
//   · no frame and no y-axis line: the data is the hero, not the box around it;
//   · three dotted lines in --data-grid instead of five solid ones;
//   · the y labels on the right, where your eye already is after reading the line;
//   · every series carries its name at the end of its own line, in its own
//     colour: that saves a legend block and you need not look anywhere else
//     to know which line is which;
//   · area fill only with one series: two filled shapes fight;
//   · pointing gives a dotted cursor, one dot per series and one quiet
//     readout. No crosshair, no boxed tooltip.
//
// The series need not have the same days: a benchmark that starts later
// gets a shorter line instead of an extrapolated one. The x axis is the
// union of all dates, and each series is drawn only where it has a
// point.
//
// The viewBox is deliberately not stretched (no preserveAspectRatio="none"): the
// width is measured and the viewBox follows it, so <text> can live in the svg
// without being distorted. That is exactly what makes the name labels at the end
// of each line possible.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { niceTicks } from "@/lib/chartScale";
import { useFormat } from "@/lib/i18n";
import { trueMinus } from "@/lib/typography";

export type LinePoint = { d: string; v: number };

export type LineSeries = {
  label: string;
  points: LinePoint[];
  colour: string;
  dash?: "solid" | "dashed" | "dotted";
  width?: number;
  /** Area fill under the line. Only makes sense with one series. */
  fill?: boolean;
};

// A gutter on the right for the y labels, a line at the bottom for the dates.
const PAD = { top: 14, right: 52, bottom: 20 };

const DASH: Record<string, string | undefined> = {
  solid: undefined,
  dashed: "4 4",
  dotted: "1 4",
};

export default function LineChart({
  series,
  baseline,
  format,
  height = 220,
  endLabels = true,
  gridLines = 3,
  ariaLabel,
  className = "",
  xFormat,
}: {
  series: LineSeries[];
  /** Dotted line at this value, for example 100 (index) or 0 (%). */
  baseline?: number;
  format: (v: number) => string;
  height?: number;
  /** Names at the end of each line instead of a legend. */
  endLabels?: boolean;
  gridLines?: number;
  ariaLabel: string;
  className?: string;
  /** How a date appears on the axis and in the readout; "1 Sep" by default. Per
   *  year or across a year boundary the year belongs with it. */
  xFormat?: (d: string) => string;
}) {
  const f = useFormat();
  xFormat ??= f.dayMonth;
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  // useLayoutEffect: the first measurement must happen before the first paint,
  // otherwise the chart draws one frame at the default width and then jumps.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    setW(el.clientWidth || 720);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 720));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.d)))].sort();
    if (dates.length < 2) return null;

    const index = new Map(dates.map((d, i) => [d, i]));
    const values = series.flatMap((s) => s.points.map((p) => p.v));
    if (baseline !== undefined) values.push(baseline);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    return { dates, index, lo, hi };
  }, [series, baseline]);

  // Area fill only when there is one line: Meridian's rule, enforced here
  // instead of remembered again by every caller.
  const single = series.length === 1;

  useEffect(() => {
    if (hover !== null && (!model || hover > model.dates.length - 1)) setHover(null);
  }, [hover, model]);

  if (!model) return null;
  const { dates, index, lo, hi } = model;

  const plotW = Math.max(w - PAD.right, 10);
  const plotH = Math.max(height - PAD.top - PAD.bottom, 10);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (dates.length - 1)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * plotH;

  // Round values (0, 25, 50 …) instead of equal parts of the range, which showed up on the axis as 21 and −9.
  const nice = niceTicks(lo, hi, gridLines);
  const ticks = nice.length ? nice : Array.from({ length: gridLines }, (_, i) => lo + (span * (i + 1)) / (gridLines + 1));

  function locate(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || plotW === 0) return;
    const frac = Math.min(Math.max((clientX - rect.left) / plotW, 0), 1);
    setHover(Math.round(frac * (dates.length - 1)));
  }

  // The name labels at the end of each line, pushed apart where they would
  // overlap. With four indexes ending at almost the same height (exactly
  // what a comparison is about) they would otherwise pile up into one
  // unreadable blot. Walk from top to bottom and put every label at least
  // LABEL_GAP below the previous one.
  const LABEL_GAP = 13;
  const endLabelRows = series
    .filter((s) => s.points.length >= 2)
    .map((s, si) => {
      const lastPoint = s.points[s.points.length - 1];
      return {
        label: s.label,
        colour: s.colour ?? `var(--chart-${(si % 6) + 1})`,
        x: x(index.get(lastPoint.d)!),
        y: y(lastPoint.v) - 10,
      };
    })
    .sort((a, b) => a.y - b.y)
    // A reduce and not a map: every label must go below the *adjusted* label before
    // it, not below where that one originally was; otherwise with three collisions
    // only the second moves and the third and fourth lie on top of it again.
    .reduce<{ label: string; colour: string; x: number; y: number }[]>((acc, r) => {
      const floor = acc.length === 0 ? 10 : acc[acc.length - 1].y + LABEL_GAP;
      acc.push({ ...r, y: Math.max(r.y, floor) });
      return acc;
    }, []);

  const hoveredDate = hover !== null ? dates[hover] : null;
  // What each series stood at on the pointed day. A series without a point on that
  // day (not started yet, or a market holiday) is left out instead of being set
  // to zero.
  const readings =
    hoveredDate === null
      ? []
      : series
          .map((s) => ({ s, point: s.points.find((p) => p.d === hoveredDate) }))
          .filter((r): r is { s: LineSeries; point: LinePoint } => r.point !== undefined);

  return (
    // To iOS, pointing with a finger cannot be told apart from wanting to
    // select text. Only the chart itself, nothing around it.
    <div
      ref={box}
      className={`ds-chart select-none ${className}`}
      tabIndex={0}
      role="group"
      aria-label={`${ariaLabel}. Gebruik de pijltjes om de waarden per datum te lezen.`}
      style={{ height, WebkitTouchCallout: "none", touchAction: "pan-y" }}
      onFocus={() => setHover((i) => i ?? dates.length - 1)}
      onBlur={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        setHover((i) => Math.min(dates.length - 1, Math.max(0, (i ?? dates.length - 1) + (e.key === "ArrowRight" ? 1 : -1))));
      }}
      onMouseMove={(e) => locate(e.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => locate(e.touches[0].clientX)}
      onTouchMove={(e) => locate(e.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}
    >
      <svg height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={ariaLabel}>
        <g className="ds-chart__grid">
          {ticks.map((t, i) => (
            <line key={i} x1="0" x2={plotW} y1={y(t)} y2={y(t)} />
          ))}
        </g>

        <g className="ds-chart__axis">
          {ticks.map((t, i) => (
            <text key={i} x={plotW + 8} y={y(t) + 3.5}>
              {trueMinus(format(t))}
            </text>
          ))}
          {[...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])].map((i) => (
            <text
              key={i}
              x={x(i)}
              y={height - 3}
              textAnchor={i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle"}
            >
              {xFormat(dates[i])}
            </text>
          ))}
        </g>

        {baseline !== undefined && baseline >= lo && baseline <= hi && (
          <line
            x1="0"
            x2={plotW}
            y1={y(baseline)}
            y2={y(baseline)}
            stroke="var(--border-strong)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        )}

        {series.map((s, si) => {
          if (s.points.length < 2) return null;
          const d = s.points
            .map(
              (p, i) => `${i === 0 ? "M" : "L"}${x(index.get(p.d)!).toFixed(2)} ${y(p.v).toFixed(2)}`
            )
            .join(" ");
          const first = index.get(s.points[0].d)!;
          const last = index.get(s.points[s.points.length - 1].d)!;
          return (
            <g key={s.label}>
              {s.fill && single && (
                <path
                  className="ds-chart__area"
                  d={`${d} L${x(last).toFixed(2)} ${PAD.top + plotH} L${x(first).toFixed(2)} ${PAD.top + plotH} Z`}
                  fill="var(--chart-band)"
                />
              )}
              <path
                className="ds-chart__line"
                d={d}
                stroke={s.colour ?? `var(--chart-${(si % 6) + 1})`}
                strokeWidth={s.width ?? 1.75}
                strokeDasharray={DASH[s.dash ?? "solid"]}
              />
            </g>
          );
        })}

        {endLabels && (
          <g>
            {endLabelRows.map((r) => (
              <text
                key={r.label}
                x={r.x - 4}
                y={r.y}
                textAnchor="end"
                fill={r.colour}
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 11.5,
                  fontWeight: 500,
                  letterSpacing: "0.01em",
                }}
              >
                {r.label}
              </text>
            ))}
          </g>
        )}

        {hover !== null && (
          <g>
            <line className="ds-chart__cursor" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} />
            {readings.map(({ s, point }, si) => (
              <circle
                key={s.label}
                className="ds-chart__dot"
                cx={x(hover)}
                cy={y(point.v)}
                r="3.5"
                fill={s.colour ?? `var(--chart-${(si % 6) + 1})`}
              />
            ))}
          </g>
        )}
      </svg>

      {readings.length > 0 && hoveredDate && hover !== null && (
        <div
          className="ds-chart__tip"
          aria-live="polite"
          // Kept inside the chart: at the edge the readout would hang half
          // outside it.
          style={{
            left: Math.min(Math.max(x(hover), 60), plotW - 60),
            top: Math.max(y(readings[0].point.v) - 10, 22),
          }}
        >
          <div style={{ color: "var(--text-on-ink-muted)" }}>{xFormat(hoveredDate)}</div>
          {readings.map(({ s, point }) => (
            <div key={s.label}>
              {series.length > 1 ? `${s.label} · ` : ""}
              {trueMinus(format(point.v))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
