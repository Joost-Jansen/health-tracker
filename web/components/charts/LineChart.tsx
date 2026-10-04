"use client";

// Meerdere lijnen over tijd, met een gedeelde tijdas en een aanwijslijn die alle
// séries op dezelfde dag tegelijk laat zien.
//
// Meridians grafiekregels, en waarom ze zo zijn:
//   · geen kader en geen y-as-lijn — de data is de held, niet de doos eromheen;
//   · drie stippellijnen in --data-grid in plaats van vijf doorgetrokken;
//   · de y-labels rechts, waar je oog na het lezen van de lijn tóch al is;
//   · elke serie draagt haar naam aan het eind van haar eigen lijn, in haar
//     eigen kleur — dat scheelt een legendablok en je hoeft nergens heen te
//     kijken om te weten welke lijn welke is;
//   · vlakvulling alleen bij één serie: twee gevulde vormen vechten;
//   · aanwijzen geeft een stippelcursor, één stip per serie en één stille
//     aflezing. Geen dradenkruis, geen omkaderde tooltip.
//
// De séries hoeven niet dezelfde dagen te hebben — een benchmark die later
// begint krijgt een kortere lijn in plaats van een geëxtrapoleerde. De x-as is
// de vereniging van alle datums, en per serie wordt er alleen getekend waar hij
// een punt heeft.
//
// De viewBox is bewust níet uitgerekt (geen preserveAspectRatio="none"): de
// breedte wordt gemeten en de viewBox volgt hem, zodat <text> in de svg mag
// staan zonder mee te vervormen. Dat is precies wat de naamlabels aan het eind
// van elke lijn mogelijk maakt.

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
  /** Vlakvulling onder de lijn. Alleen zinvol bij één serie. */
  fill?: boolean;
};

// Rechts een goot voor de y-labels, onderaan een regel voor de datums.
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
  /** Stippellijn op deze waarde, bijvoorbeeld 100 (index) of 0 (%). */
  baseline?: number;
  format: (v: number) => string;
  height?: number;
  /** Namen aan het eind van elke lijn in plaats van een legenda. */
  endLabels?: boolean;
  gridLines?: number;
  ariaLabel: string;
  className?: string;
  /** Hoe een datum op de as en in de aflezing staat; standaard "1 sep". Per
   *  jaar of over een jaargrens hoort het jaartal erbij. */
  xFormat?: (d: string) => string;
}) {
  const f = useFormat();
  xFormat ??= f.dayMonth;
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  // useLayoutEffect: de eerste meting moet vóór de eerste schildering gebeuren,
  // anders tekent de grafiek één frame op de standaardbreedte en springt daarna.
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

  // Vlakvulling alleen als er één lijn staat — Meridians regel, hier afgedwongen
  // in plaats van bij elke aanroeper opnieuw onthouden.
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

  // Ronde waarden (0, 25, 50 …) in plaats van gelijke delen van het bereik, die als 21 en −9 op de as kwamen.
  const nice = niceTicks(lo, hi, gridLines);
  const ticks = nice.length ? nice : Array.from({ length: gridLines }, (_, i) => lo + (span * (i + 1)) / (gridLines + 1));

  function locate(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || plotW === 0) return;
    const frac = Math.min(Math.max((clientX - rect.left) / plotW, 0), 1);
    setHover(Math.round(frac * (dates.length - 1)));
  }

  // De naamlabels aan het eind van elke lijn, uit elkaar geduwd waar ze op
  // elkaar zouden vallen. Met vier indexen die op vrijwel dezelfde hoogte
  // eindigen — precies waar een vergelijking om draait — stapelen ze anders tot
  // één onleesbare vlek. Van boven naar beneden doorlopen en elk label minstens
  // LABEL_GAP onder het vorige zetten.
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
    // Een reduce en geen map: elk label moet onder het *aangepaste* label ervoor
    // komen, niet onder waar dat oorspronkelijk stond — anders schuift bij drie
    // botsingen alleen de tweede op en liggen de derde en vierde er weer bovenop.
    .reduce<{ label: string; colour: string; x: number; y: number }[]>((acc, r) => {
      const floor = acc.length === 0 ? 10 : acc[acc.length - 1].y + LABEL_GAP;
      acc.push({ ...r, y: Math.max(r.y, floor) });
      return acc;
    }, []);

  const hoveredDate = hover !== null ? dates[hover] : null;
  // Wat elke serie op de aangewezen dag stond. Een serie zonder punt op die dag
  // (nog niet begonnen, of een beursvrije dag) valt weg in plaats van op nul te
  // worden gezet.
  const readings =
    hoveredDate === null
      ? []
      : series
          .map((s) => ({ s, point: s.points.find((p) => p.d === hoveredDate) }))
          .filter((r): r is { s: LineSeries; point: LinePoint } => r.point !== undefined);

  return (
    // Aanwijzen met een vinger is voor iOS niet te onderscheiden van tekst
    // willen selecteren. Alleen de grafiek zelf, niets eromheen.
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
          // Binnen de grafiek gehouden: tegen de rand zou de aflezing er half
          // buiten hangen.
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
