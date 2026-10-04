"use client";

// Eén reeks over tijd met een gestippelde trendlijn (kleinste kwadraten) en in de kop: de laatste waarde,
// de verandering volgens de trend en de piek, alle drie over het zichtbare venster. `lowerIsBetter` voor
// tempo en rust-HR: dan is de piek het minimum, staat sneller hoger in de grafiek en kleurt een daling groen.
//
// Tekent met TimeChart: een echte tijdas, aanwijzen met dradenkruis, schuiven en zoomen, en desgewenst een
// voortschrijdend gemiddelde. Met `window` volgt hij het gedeelde venster van de pagina (Trends); zonder
// toont hij de hele reeks en zoomt hij alleen lokaal (Rondjes).

import ChartHeadline from "@/components/charts/ChartHeadline";
import TimeChart, { type ChartMarker, type MaOption } from "@/components/charts/TimeChart";
import { dayNumber, fmtDate, linearTrend, type DateWindow, type DayPoint } from "@/lib/timeline";

export type TrendPoint = DayPoint;
export { linearTrend };

export default function TrendChart({
  label,
  points,
  format,
  lowerIsBetter = false,
  colour = "var(--chart-1)",
  height = 180,
  unit = "",
  empty = "Nog te weinig data.",
  window,
  domain,
  onWindow,
  onReset,
  maOptions,
  maDefault = 0,
  storageKey,
  clock = false,
  markers,
}: {
  label: string;
  points: TrendPoint[];
  format: (v: number) => string;
  lowerIsBetter?: boolean;
  colour?: string;
  height?: number;
  unit?: string;
  empty?: string;
  window?: DateWindow;
  domain?: DateWindow;
  onWindow?: (w: DateWindow) => void;
  onReset?: () => void;
  maOptions?: MaOption[];
  maDefault?: number;
  storageKey?: string;
  /** Waarden zijn seconden: as op ronde klokwaarden. */
  clock?: boolean;
  /** Verticale markeringen (ruitjes), bijvoorbeeld runs die niet meetellen. */
  markers?: ChartMarker[];
}) {
  if (points.length < 2) return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>;

  const inView = window ? points.filter((p) => p.d >= window.from && p.d <= window.to) : points;
  const sign = lowerIsBetter ? -1 : 1;
  const headline = (() => {
    if (inView.length === 0) return null;
    const trend = linearTrend(inView);
    const last = inView[inView.length - 1];
    const peak = inView.reduce((b, p) => (sign * p.v > sign * b.v ? p : b), inView[0]);
    const change = trend.length ? trend[1].v - trend[0].v : 0;
    const better = sign * change > 0;
    const flat = Math.abs(change) < 1e-9 || format(Math.abs(change)) === format(0);
    const weeks = trend.length ? Math.round((dayNumber(trend[1].d) - dayNumber(trend[0].d)) / 7) : 0;
    const over = weeks >= 2 ? ` in ${weeks} weken` : "";
    return {
      big: `${format(last.v)}${unit}`,
      primary: flat ? "gelijk" : `${change > 0 ? "+" : "−"}${format(Math.abs(change))}${unit}${over} volgens de trend`,
      tone: flat ? "text-ink-muted" : better ? "text-gain" : "text-loss",
      secondary: `${lowerIsBetter ? "beste" : "piek"} ${format(peak.v)}${unit} op ${fmtDate(peak.d)}`,
    };
  })();

  return (
    <div>
      {headline ? (
        <ChartHeadline big={headline.big} primary={headline.primary} primaryTone={headline.tone} secondary={headline.secondary} />
      ) : (
        <ChartHeadline big="–" primary="geen meting in deze periode" secondary={`laatste ${format(points[points.length - 1].v)}${unit} op ${fmtDate(points[points.length - 1].d)}`} />
      )}
      <TimeChart
        ariaLabel={label}
        height={height}
        invert={lowerIsBetter}
        format={format}
        unit={unit}
        window={window}
        domain={domain}
        onWindow={onWindow}
        onReset={onReset}
        maOptions={maOptions}
        maDefault={maDefault}
        storageKey={storageKey}
        legend={false}
        clock={clock}
        markers={markers}
        series={[{ key: "v", label, colour, points, ma: true, trend: true, peak: lowerIsBetter ? "min" : "max", width: 2 }]}
      />
    </div>
  );
}
