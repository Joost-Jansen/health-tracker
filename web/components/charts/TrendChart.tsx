"use client";

// Eén reeks over tijd met een gestippelde trendlijn (kleinste kwadraten) en in de kop: de laatste waarde,
// de verandering volgens de trend en de piek. `lowerIsBetter` voor tempo en rust-HR: dan is de piek het
// minimum, staat sneller hoger in de grafiek en kleurt een daling groen.

import LineChart from "@/components/charts/LineChart";
import ChartHeadline from "@/components/charts/ChartHeadline";

export type TrendPoint = { d: string; v: number };

export function linearTrend(points: TrendPoint[]): TrendPoint[] {
  if (points.length < 3) return [];
  const t = points.map((p) => new Date(p.d + "T12:00:00").getTime() / 86400000);
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
  return [points[0], points[n - 1]].map((p, i) => ({ d: p.d, v: my + slope * ((i ? t[n - 1] : t[0]) - mx) }));
}

const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

export default function TrendChart({
  label,
  points,
  format,
  lowerIsBetter = false,
  colour = "var(--chart-1)",
  height = 180,
  unit = "",
  empty = "Nog te weinig data.",
}: {
  label: string;
  points: TrendPoint[];
  format: (v: number) => string;
  lowerIsBetter?: boolean;
  colour?: string;
  height?: number;
  unit?: string;
  empty?: string;
}) {
  if (points.length < 2) return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>;
  const sign = lowerIsBetter ? -1 : 1;
  const trend = linearTrend(points);
  const last = points[points.length - 1];
  const peak = points.reduce((b, p) => (sign * p.v > sign * b.v ? p : b), points[0]);
  const change = trend.length ? trend[1].v - trend[0].v : 0;
  const better = sign * change > 0;
  const flat = Math.abs(change) < 1e-9 || format(Math.abs(change)) === format(0);
  const changeText = flat ? "gelijk" : `${change > 0 ? "+" : "−"}${format(Math.abs(change))}${unit} volgens de trend`;
  const xFormat = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { month: "short", year: "2-digit" });

  return (
    <div>
      <ChartHeadline
        big={`${format(last.v)}${unit}`}
        primary={changeText}
        primaryTone={flat ? "text-ink-muted" : better ? "text-gain" : "text-loss"}
        secondary={`${lowerIsBetter ? "beste" : "piek"} ${format(peak.v)}${unit} op ${fmtDay(peak.d)}`}
      />
      <LineChart
        ariaLabel={label}
        height={height}
        endLabels={false}
        xFormat={xFormat}
        format={(v) => format(sign * v)}
        series={[
          { label, colour, width: 2, points: points.map((p) => ({ d: p.d, v: sign * p.v })) },
          ...(trend.length ? [{ label: "trend", colour: "var(--chart-2)", dash: "dashed" as const, width: 1.25, points: trend.map((p) => ({ d: p.d, v: sign * p.v })) }] : []),
        ]}
      />
    </div>
  );
}
