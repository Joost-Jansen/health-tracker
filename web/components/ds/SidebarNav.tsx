"use client";

// De zijbalk: een vast diepgroen paneel van 248px.
//
// Dit is het sterkste identiteitssignaal van het ontwerp, en het enige element
// dat níet met het thema meedraait — hij leest van --surface-ink, dat met opzet
// themaonafhankelijk is. Een donkere rail tegen een papieren veld is het
// architectonische anker; laat je hem 's nachts omklappen, dan is het gewoon
// weer een menu.
//
// Op een telefoon past hij niet. Daar schuift hij open van links, met een scrim
// eronder, sluit hij op Escape en op een tik ernaast, en houdt hij de focus
// binnen zolang hij openstaat.
//
// Hij komt er op twee manieren: de menuknop linksboven, of een veeg naar rechts
// vanaf de linkerrand van het scherm. Die veeg is geen kortere weg naar de knop
// maar een gemakkelijkere: linksboven is de hoek waar een duim niet bij kan.
// Onderweg volgt het paneel de vinger, dus je ziet halverwege wat je krijgt en
// kunt je bedenken; loslaten voorbij de helft (of met een zwiep) beslist.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NavGroup } from "@/lib/nav";
import Logomark from "@/components/ds/Logomark";
import { ChartLineIcon, ClipboardIcon, LayoutIcon, MapIcon, RouteIcon } from "@/components/icons";

const ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  layout: LayoutIcon,
  clipboard: ClipboardIcon,
  map: MapIcon,
  route: RouteIcon,
  chart: ChartLineIcon,
};

function NavList({
  groups,
  activeId,
  onNavigate,
}: {
  groups: NavGroup[];
  activeId: string | null;
  onNavigate?: () => void;
}) {
  return (
    <>
      {groups.map((group, gi) => (
        <div className="ds-sidebar__group" key={group.label ?? gi}>
          {group.label && <div className="ds-sidebar__grouplabel">{group.label}</div>}
          {group.items.map((item) => {
            const Glyph = ICONS[item.icon];
            const active = item.id === activeId;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`ds-navitem ${active ? "ds-navitem--active" : ""}`}
              >
                {Glyph && <Glyph className="ds-navitem__icon" />}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

/** Hoe dicht bij de linkerrand een veeg moet beginnen om het paneel te openen.
 *  Ruim genoeg voor een duim, smal genoeg om niet in de weg te zitten. */
const EDGE_ZONE = 24;
/** Zoveel pixels mag een vinger dwalen voor we beslissen: veeg of scroll. */
const AXIS_SLOP = 10;
/** Boven deze snelheid (px per ms) beslist de zwiep, niet hoe ver je kwam. */
const FLING = 0.4;

export default function SidebarNav({
  groups,
  activeId,
  footer,
  open,
  onOpen,
  onClose,
}: {
  groups: NavGroup[];
  activeId: string | null;
  footer?: React.ReactNode;
  /** Alleen van belang onder lg: staat het uitschuifpaneel open? */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  /** Waar het paneel staat terwijl een vinger het vasthoudt: 0 dicht, 1 open.
   *  `null` betekent dat niemand het vasthoudt en de CSS het overneemt. */
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const focusables = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      // Het paneel wordt onzichtbaar; de focus mag er niet in achterblijven —
      // na een tik op een menu-item staat hij op die link. Terug naar de knop
      // die hem opende.
      if (panel.current?.contains(document.activeElement)) opener.current?.focus();
    };
  }, [open, onClose]);

  // De veeg. Op document, want zolang het paneel dicht is ligt er bij de
  // linkerrand geen element om het gebaar op te vangen.
  useEffect(() => {
    // Alles wat tussen twee frames onthouden moet worden, maar geen hertekening
    // waard is.
    const g = { on: false, decided: false, fromOpen: open, x0: 0, y0: 0, w: 1, x: 0, t: 0, v: 0, p: 0 };

    const start = (e: TouchEvent) => {
      // Alleen op de smalle indeling: op lg zet Tailwind het paneel op
      // display:none, en dat is meteen het antwoord op "zijn we op een
      // telefoon" zonder de breekpunten hier te herhalen.
      const el = drawer.current;
      if (!el || e.touches.length !== 1 || getComputedStyle(el).display === "none") return;
      const t = e.touches[0];
      if (!open && t.clientX > EDGE_ZONE) return;
      Object.assign(g, {
        on: true,
        decided: false,
        fromOpen: open,
        x0: t.clientX,
        y0: t.clientY,
        w: panel.current?.offsetWidth || 1,
        x: t.clientX,
        t: e.timeStamp,
        v: 0,
        p: open ? 1 : 0,
      });
    };

    const move = (e: TouchEvent) => {
      if (!g.on) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;

      if (!g.decided) {
        if (Math.abs(dx) < AXIS_SLOP && Math.abs(dy) < AXIS_SLOP) return;
        // Meer verticaal dan horizontaal is scrollen, en de verkeerde kant op
        // (naar links terwijl hij al dicht is) is geen gebaar. Allebei: laat
        // los, en blijf er tot de volgende aanraking vanaf.
        if (Math.abs(dy) > Math.abs(dx) || (g.fromOpen ? dx > 0 : dx < 0)) {
          g.on = false;
          return;
        }
        g.decided = true;
      }

      // Vanaf hier is het gebaar van ons en mag de pagina niet meescrollen.
      e.preventDefault();
      const dt = e.timeStamp - g.t;
      if (dt > 0) {
        g.v = (t.clientX - g.x) / dt;
        g.x = t.clientX;
        g.t = e.timeStamp;
      }
      g.p = Math.max(0, Math.min(1, (g.fromOpen ? 1 : 0) + dx / g.w));
      setDrag(g.p);
    };

    const end = () => {
      if (!g.on) return;
      const decided = g.decided;
      g.on = false;
      g.decided = false;
      if (!decided) return;
      // Een duidelijke zwiep wint van de afstand: wie hard naar rechts veegt
      // bedoelt "open", ook als hij bij een derde losliet.
      const wantsOpen = Math.abs(g.v) > FLING ? g.v > 0 : g.p > 0.5;
      setDrag(null);
      if (wantsOpen) onOpen();
      else onClose();
    };

    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", end);
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
    };
  }, [open, onOpen, onClose]);

  return (
    <>
      {/* Breed scherm: het paneel staat er gewoon, over de volle hoogte. */}
      <nav
        aria-label="Hoofdnavigatie"
        className="ds-sidebar ds-sidebar--ink sticky top-0 hidden h-screen lg:flex"
      >
        <Wordmark />
        <NavList groups={groups} activeId={activeId} />
        {footer && <div className="mt-auto">{footer}</div>}
      </nav>

      {/* Telefoon: hetzelfde paneel, uitgeschoven. Hij blijft staan als hij
          dicht is — zie ds.css — zodat een veeg hem kan oppakken. */}
      <div
        ref={drawer}
        className={`ds-navdrawer lg:hidden${open ? " ds-navdrawer--open" : ""}${
          drag === null ? "" : " ds-navdrawer--dragging"
        }`}
      >
        <div className="ds-navdrawer__scrim" onClick={onClose} aria-hidden style={styleAt(drag, "scrim")} />
        <nav
          ref={panel}
          tabIndex={-1}
          aria-label="Hoofdnavigatie"
          className="ds-sidebar ds-sidebar--ink ds-navdrawer__panel"
          style={styleAt(drag, "panel")}
        >
          <Wordmark />
          <NavList groups={groups} activeId={activeId} onNavigate={onClose} />
          {footer && <div className="mt-auto">{footer}</div>}
        </nav>
      </div>
    </>
  );
}

/** De stand halverwege een veeg. Zonder veeg geen inline-opmaak: dan bepalen de
 *  klassen waar het paneel staat, mét hun overgang. De verschuiving is een
 *  percentage van de eigen breedte, zodat de breedte hier niet bekend hoeft te
 *  zijn — 0 is helemaal weg, 1 is helemaal open. */
function styleAt(drag: number | null, part: "panel" | "scrim"): React.CSSProperties | undefined {
  if (drag === null) return undefined;
  return part === "panel" ? { transform: `translate3d(${(drag - 1) * 100}%, 0, 0)` } : { opacity: drag };
}

/** Het beeldmerk en het woordmerk, in de displayletter.
 *
 *  De app heet "een eerder project", net als het domein. Hier stond "Portefeuille",
 *  maar dat is de naam van één van de zes bestemmingen — een woordmerk dat
 *  meeleest als menu-item zet je op het verkeerde been. Kleine letter en
 *  koppelteken zijn de schrijfwijze van health-tracker; niet "Stock Tracker".
 *
 *  Het merk ervoor is dezelfde ligatuur als het icoon op het beginscherm, zodat
 *  de app binnen hetzelfde teken draagt als waarmee hij op je telefoon staat.
 *  15px is de hoogte van de kleine letters van het woordmerk ernaast; samen met
 *  de basislijn-uitlijning van .ds-sidebar__brand staan ze op één lijn. */
function Wordmark() {
  return (
    <div className="ds-sidebar__brand">
      <Logomark height={15} className="ds-sidebar__logo" />
      <span className="ds-sidebar__wordmark">training</span>
    </div>
  );
}
