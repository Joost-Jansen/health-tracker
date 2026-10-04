"use client";

// Eén staaf per week of maand, altijd 100% hoog, opgedeeld in de vijf zones
// (Z1 onderaan). Zo zie je de verdeling verschuiven, los van hoeveel je trainde.
// Zelfde opzet als charts/Bars: divs in plaats van svg en een afleesregel
// bóven de grafiek in plaats van een zwevende tooltip, zodat niets verspringt
// of van een telefoonscherm valt. Bars zelf toont één bedrag per staaf; hier
// moeten per staaf vijf aandelen plus uren in de regel, vandaar een eigen
// component.

import { useLayoutEffect, useRef, useState } from "react";
import { useFormat, useT } from "@/lib/i18n";
import { ZONE_COLOUR, ZONES, type ZoneHistoryItem } from "@/lib/training";

export type ZoneStackBar = ZoneHistoryItem & {
  /** Kort label onder de staaf. */
  short: string;
  /** De lopende periode: nog niet af, iets lichter getekend. */
  partial?: boolean;
};

export default function ZoneStackChart({
  bars,
  summary,
  labelEvery = 1,
  ariaLabel,
}: {
  bars: ZoneStackBar[];
  summary: React.ReactNode;
  labelEvery?: number;
  ariaLabel: string;
}) {
  const t = useT();
  const f = useFormat();
  const [active, setActive] = useState<number | null>(null);
  const shown = active !== null ? bars[active] : null;
  // Hoeveel labels passen er op deze breedte? Een label ("25 mei") is ~45 px; op een telefoon met 27 weken
  // liepen ze anders in elkaar ("25 mei15 jun").
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
  const every = width ? Math.max(labelEvery, Math.ceil(bars.length / Math.max(2, Math.floor(width / 52)))) : labelEvery;

  return (
    <div>
      <div className="mb-2 flex min-h-[54px] flex-col gap-1 sm:min-h-[40px]">
        {shown ? (
          <>
            <span className="text-[13px]">
              <span className="font-semibold">{shown.label}</span>
              <span className="text-ink-muted"> · {shown.total_s ? f.hours(shown.total_s) : t.zones.noHr}{shown.partial ? ` · ${t.zones.running}` : ""}</span>
            </span>
            {shown.total_s > 0 && (
              <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums">
                {ZONES.map((z) => (
                  <span key={z} className="inline-flex items-center gap-1">
                    <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: ZONE_COLOUR[z] }} />
                    <span className="text-ink-muted">{z}</span>
                    <span className="font-medium">{Math.round(shown.pct[z])}%</span>
                    <span className="text-ink-muted">{f.duration(shown.seconds[z])}</span>
                  </span>
                ))}
              </span>
            )}
          </>
        ) : (
          <span className="text-[13px] text-ink-muted">{summary}</span>
        )}
      </div>

      <div role="group" aria-label={ariaLabel} className="flex h-[150px] items-stretch gap-[3px] sm:h-[180px]" onMouseLeave={() => setActive(null)}>
        {bars.map((bar, i) => (
          <button
            key={bar.start}
            type="button"
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            onMouseEnter={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-label={`${bar.label}: ${bar.total_s ? ZONES.map((z) => `${z} ${Math.round(bar.pct[z])}%`).join(", ") : t.zones.noHr}`}
            className="flex min-w-0 flex-1 flex-col justify-end overflow-hidden rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
          >
            {bar.total_s > 0 ? (
              // Z5 bovenaan, Z1 tegen de basislijn.
              [...ZONES].reverse().map((z) =>
                bar.pct[z] > 0 ? (
                  <span
                    key={z}
                    aria-hidden="true"
                    className="block w-full"
                    style={{
                      height: `${bar.pct[z]}%`,
                      background: ZONE_COLOUR[z],
                      opacity: bar.partial ? 0.6 : 1,
                    }}
                  />
                ) : null,
              )
            ) : (
              <span aria-hidden="true" className="block h-[2px] w-full bg-border-strong" />
            )}
          </button>
        ))}
      </div>

      {/* Flex in plaats van text-center: een label breder dan zijn staaf steekt dan aan beide kanten even ver uit
          (tekst loopt altijd naar rechts over), en het eerste en laatste label blijven binnen de kaart. */}
      <div ref={row} aria-hidden="true" className="mt-1.5 flex gap-[3px]">
        {bars.map((bar, i) => {
          const label = (bars.length - 1 - i) % every === 0;
          const edge = i === 0 ? "justify-start" : i === bars.length - 1 ? "justify-end" : "justify-center";
          return (
            <span key={bar.start} className={`flex min-w-0 flex-1 ${edge} whitespace-nowrap text-[11px] leading-tight ${i === active ? "font-semibold text-text" : "text-ink-muted"}`}>
              <span className="flex-none">{label ? bar.short : ""}</span>
            </span>
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-ink-muted">
        {ZONES.map((z) => (
          <span key={z} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: ZONE_COLOUR[z] }} />
            {z}
          </span>
        ))}
        {bars.some((b) => b.partial) && <span>· {t.zones.lighter}</span>}
      </div>
    </div>
  );
}
