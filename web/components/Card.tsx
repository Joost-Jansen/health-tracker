// De kaart van het cockpit-ontwerp: titel links, optioneel een actie of een
// "meer →"-link rechts, inhoud eronder.
//
// Stond eerder als lokale kopie in zowel app/(app)/dashboard/page.tsx als
// app/(app)/nieuws/page.tsx. Bij de derde pagina (Herbalanceren) is dat één
// kopie te veel: dan gaat de padding of de titelgrootte op één plek schuiven en
// op de andere niet.

import Link from "next/link";

export default function Card({
  title,
  more,
  moreHref,
  action,
  children,
  className = "",
}: {
  title?: string;
  more?: string;
  moreHref?: string;
  /** Krijgt de plek rechts van de titel; gaat vóór `more`/`moreHref`. */
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded border border-border bg-surface p-4 sm:p-[18px] ${className}`}>
      {(title || action || (more && moreHref)) && (
        // flex-wrap zodat een actie die te breed is naast de titel eronder
        // valt in plaats van hem samen te drukken — het periodebalkje van de
        // Waardeontwikkeling-kaart is zeven knoppen en past nooit op een
        // telefoon naast de titel.
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2.5">
          {title && <h2 className="text-[13.5px] font-semibold tracking-[0.01em]">{title}</h2>}
          {action ??
            (more && moreHref && (
              <Link
                href={moreHref}
                // py-1 met een compenserende -my-1: een regel tekst van 12px is
                // een raakvlak van 15px hoog, en dat is er geen. De negatieve
                // marge houdt de kophoogte precies zoals het ontwerp hem heeft.
                className="-my-1 inline-block whitespace-nowrap py-1 text-xs font-semibold text-brand hover:underline"
              >
                {more} →
              </Link>
            ))}
        </div>
      )}
      {children}
    </section>
  );
}

/** Het kleine kapitaaltjes-labeltje boven een groot getal. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
      {children}
    </span>
  );
}
