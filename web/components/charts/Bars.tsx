"use client";

// Staafjes naast elkaar over een as die je zelf leest: maanden, jaren, of de
// twaalf kalendermaanden. Eén staaf mag uit meerdere stukken bestaan
// (ontvangen + nog verwacht), gestapeld.
//
// Divs en geen svg, anders dan LineChart en ValueChart. Die twee rekken één
// viewBox met preserveAspectRatio="none" over de kaart uit — prima voor een
// lijn, maar dat vervormt ook de afronding van een staafkop en de breedte van
// een tussenruimte, en juist die twee dragen hier de betekenis. Flexbox houdt
// elke staaf even breed en elke ruimte precies 2px, op elk scherm.
//
// De afleesregel staat bóven de grafiek en niet als zwevende tooltip erop. Een
// tooltip die naast de laatste staaf verschijnt valt op een telefoon van het
// scherm af, en een die daarvoor terugklapt springt. Deze regel heeft altijd
// dezelfde hoogte: in rust staat de samenvatting er, met een vinger op een
// staaf die staaf. Zo beweegt de grafiek niet als je hem aanraakt.

import { useId, useState } from "react";
import { useT } from "@/lib/i18n";

export type BarSegment = {
  /** Uniek binnen de staaf; wordt ook de legendasleutel. */
  key: string;
  value: number;
  colour: string;
  /** Gearceerd in plaats van vol: het stuk is een raming, geen feit. */
  estimate?: boolean;
};

export type BarDatum = {
  key: string;
  /** Wat er onder de staaf staat. */
  label: string;
  /** Wat de afleesregel toont als deze staaf actief is. Default: `label`. */
  title?: string;
  segments: BarSegment[];
  /** Stille regel achter het bedrag in de afleesregel, bijvoorbeeld "3 betalingen". */
  note?: string;
};

export type BarLegendItem = { key: string; label: string; colour: string; estimate?: boolean };

/** Een gearceerde vulling voor een raming: dezelfde kleur, half zo aanwezig,
 *  met diagonale strepen erdoor. Ook zonder kleur te zien blijft "dit stuk is
 *  geschat" zichtbaar — op een zwart-witprint en voor wie de twee tinten niet
 *  uit elkaar houdt. */
function fill(colour: string, estimate?: boolean): React.CSSProperties {
  if (!estimate) return { background: colour };
  // De onderlaag moet een ándere kleur zijn dan de strepen, anders is er niets
  // te zien: de eerste versie legde het verloop over dezelfde kleur, waardoor
  // de doorzichtige stukken precies die kleur lieten zien en de arcering
  // wegviel tot een egale tint. Nu zijn de gaten de kaart zelf.
  return {
    background: `repeating-linear-gradient(135deg, ${colour} 0 4px, transparent 4px 8px), var(--surface)`,
  };
}

function Swatch({ colour, estimate }: { colour: string; estimate?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 flex-none rounded-[3px]"
      style={fill(colour, estimate)}
    />
  );
}

export default function Bars({
  bars,
  legend,
  format,
  summary,
  labelEvery = 1,
  height = "h-[150px] sm:h-[180px]",
  maxBarWidth = 64,
  ariaLabel,
  emptyLabel,
  onSelect,
}: {
  bars: BarDatum[];
  /** Alleen nodig vanaf twee soorten stukken — bij één zegt de kaarttitel het al. */
  legend?: BarLegendItem[];
  format: (v: number) => string;
  /** Wat de afleesregel toont zolang je nergens op staat. */
  summary: React.ReactNode;
  /** Elke hoeveelste staaf een label krijgt. Bij 24 maanden is dat er niet 24. */
  labelEvery?: number;
  height?: string;
  /** Bovengrens aan de breedte van één staaf, in pixels. Zes jaarstaven over
   *  een breed scherm worden anders blokken van honderd pixels: dat leest als
   *  een muur en niet als een reeks. Op een telefoon raakt niets deze grens. */
  maxBarWidth?: number;
  ariaLabel: string;
  emptyLabel?: string;
  /** Een klik op een staaf, met zijn `key` — bijvoorbeeld om die maand te kiezen. */
  onSelect?: (key: string) => void;
}) {
  const t = useT();
  emptyLabel ??= t.charts.nothing;
  const [active, setActive] = useState<number | null>(null);
  const idPrefix = useId();

  if (bars.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{emptyLabel}</p>;
  }

  const totals = bars.map((b) => b.segments.reduce((sum, s) => sum + s.value, 0));
  // Nooit tegen 0 schalen — dan wordt elke hoogte NaN. Negatieve totalen (een
  // teruggedraaide uitkering) krijgen geen staaf maar staan wel in de
  // afleesregel: de hoogte kan het niet vertellen, het bedrag wel.
  const peak = Math.max(...totals, Number.EPSILON);
  const shown = active !== null ? bars[active] : null;

  return (
    <div>
      {/* Vaste hoogte per constructie: twee regels op een telefoon, één vanaf
          sm — in beide toestanden dezelfde, dus de grafiek eronder blijft staan. */}
      <div className="mb-2 flex min-h-[34px] flex-col gap-y-0.5 sm:min-h-[20px] sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2.5">
        {shown ? (
          <>
            <span className="text-[13px] font-semibold">{shown.title ?? shown.label}</span>
            <span className="num text-[13px] font-semibold">
              {format(totals[active!])}
            </span>
            {shown.note && <span className="text-xs text-ink-muted">{shown.note}</span>}
          </>
        ) : (
          <span className="text-[13px] text-ink-muted">{summary}</span>
        )}
      </div>

      {/* role="group" en niet role="img": elke staaf is een knop met zijn eigen
          bedrag in het label, en een img eromheen zou die knoppen juist
          wegstoppen voor een schermlezer. De grafiek is hier een lijst met
          waarden, geen plaatje. */}
      <div
        role="group"
        aria-label={ariaLabel}
        className={`flex items-end justify-center gap-[2px] ${height}`}
        onMouseLeave={() => setActive(null)}
      >
        {bars.map((bar, i) => {
          const total = totals[i];
          const isActive = i === active;
          return (
            <button
              key={bar.key}
              type="button"
              // Tabbaar: de afleesregel is de enige plek waar het exacte bedrag
              // staat, dus hij moet ook zonder muis te bereiken zijn.
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(i)}
              // Aanwijzen, niet omschakelen. Een tik geeft de knop eerst focus
              // — waarmee hij actief wordt — en pas daarna komt de klik; die
              // zag "staat al aan" en zette hem meteen weer uit. Op een muis
              // valt dat niet op omdat hover het overneemt, maar op een
              // telefoon deed geen enkel staafje iets. Loslaten gebeurt met
              // blur of door de grafiek te verlaten.
              onClick={() => {
                setActive(i);
                onSelect?.(bar.key);
              }}
              aria-label={`${bar.title ?? bar.label}: ${format(total)}`}
              style={{ maxWidth: maxBarWidth }}
              className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-[2px] rounded-t-[4px] outline-none"
            >
              {/* Van boven naar beneden tekenen: het laatste stuk in de lijst
                  hoort onderaan te staan, tegen de basislijn aan. */}
              {[...bar.segments].reverse().map((seg, si) => {
                const share = Math.max(seg.value, 0) / peak;
                if (share <= 0) return null;
                return (
                  <span
                    key={seg.key}
                    aria-hidden="true"
                    className={`block w-full ${si === 0 ? "rounded-t-[4px]" : ""}`}
                    style={{
                      // Minimaal 2px: een uitkering van 40 cent naast een van
                      // €60 moet zichtbaar blijven als "er was iets".
                      height: `max(${(share * 100).toFixed(3)}%, 2px)`,
                      ...fill(seg.colour, seg.estimate),
                      filter: isActive ? "brightness(1.12)" : undefined,
                    }}
                  />
                );
              })}
              {/* Een lege maand heeft geen staaf en dus geen raakvlak. Deze
                  streep van niks houdt hem aanwijsbaar én laat zien dát hij
                  leeg is in plaats van te ontbreken. */}
              {total <= 0 && (
                <span aria-hidden="true" className="block h-[2px] w-full bg-border-strong" />
              )}
            </button>
          );
        })}
      </div>

      {/* whitespace-nowrap en géén overflow-hidden: bij 24 maanden is een cel
          een pixel of vijftien breed en brak "mrt" af tot "m rt", twee regels
          onder elkaar. Het label mag over zijn buren heen steken — met
          labelEvery staan die toch leeg. */}
      <div aria-hidden="true" className="mt-1.5 flex justify-center gap-[2px]">
        {bars.map((bar, i) => (
          <span
            key={`${idPrefix}-${bar.key}`}
            style={{ maxWidth: maxBarWidth }}
            className={`min-w-0 flex-1 whitespace-nowrap text-center text-[11px] leading-tight ${
              i === active ? "font-semibold text-text" : "text-ink-muted"
            }`}
          >
            {i % labelEvery === 0 || i === bars.length - 1 ? bar.label : ""}
          </span>
        ))}
      </div>

      {legend && legend.length > 1 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-ink-muted">
          {legend.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1.5">
              <Swatch colour={item.colour} estimate={item.estimate} />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
