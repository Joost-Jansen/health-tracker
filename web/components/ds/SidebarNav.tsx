"use client";

// The sidebar: a fixed deep-green panel of 248px.
//
// This is the design's strongest identity signal, and the only element that
// does not follow the theme: it reads from --surface-ink, which is
// theme-independent on purpose. A dark rail against a paper field is the
// architectural anchor; let it flip at night and it is just a menu
// again.
//
// It does not fit on a phone. There it slides open from the left, with a scrim
// underneath, closes on Escape and on a tap next to it, and keeps the focus
// inside while it is open.
//
// It opens in two ways: the menu button top left, or a swipe to the right
// from the left edge of the screen. That swipe is not a shortcut to the button
// but an easier way: top left is the corner a thumb cannot reach.
// Along the way the panel follows the finger, so halfway you see what you get and
// can change your mind; letting go past halfway (or with a flick) decides.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { NavGroup } from "@/lib/nav";
import { useT } from "@/lib/i18n";
import Logomark from "@/components/ds/Logomark";
import { ChartLineIcon, ClipboardIcon, HeartIcon, HelpIcon, LayoutIcon, MapIcon, NewspaperIcon, RouteIcon, SettingsIcon } from "@/components/icons";

const ICONS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  layout: LayoutIcon,
  heart: HeartIcon,
  clipboard: ClipboardIcon,
  map: MapIcon,
  route: RouteIcon,
  chart: ChartLineIcon,
  book: NewspaperIcon,
  settings: SettingsIcon,
  help: HelpIcon,
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
                data-nav-id={item.id}
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

/** How close to the left edge a swipe must start to open the panel.
 *  Wide enough for a thumb, narrow enough not to get in the way. */
const EDGE_ZONE = 24;
/** How many pixels a finger may wander before we decide: swipe or scroll. */
const AXIS_SLOP = 10;
/** Above this speed (px per ms) the flick decides, not how far you got. */
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
  /** Only relevant below lg: is the slide-out panel open? */
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const panel = useRef<HTMLElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  /** Where the panel is while a finger holds it: 0 closed, 1 open.
   *  `null` means nobody holds it and the CSS takes over. */
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
      // The panel becomes invisible; the focus must not stay behind in it
      // (after a tap on a menu item it is on that link). Back to the button
      // that opened it.
      if (panel.current?.contains(document.activeElement)) opener.current?.focus();
    };
  }, [open, onClose]);

  // The swipe. On document, because while the panel is closed there is no
  // element at the left edge to catch the gesture.
  useEffect(() => {
    // Everything that must be remembered between two frames but is not worth
    // a re-render.
    const g = { on: false, decided: false, fromOpen: open, x0: 0, y0: 0, w: 1, x: 0, t: 0, v: 0, p: 0 };

    const start = (e: TouchEvent) => {
      // Only in the narrow layout: on lg Tailwind sets the panel to
      // display:none, and that directly answers "are we on a
      // phone" without repeating the breakpoints here.
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
        // More vertical than horizontal is scrolling, and the wrong direction
        // (to the left while it is already closed) is not a gesture. Both: let
        // go, and stay off until the next touch.
        if (Math.abs(dy) > Math.abs(dx) || (g.fromOpen ? dx > 0 : dx < 0)) {
          g.on = false;
          return;
        }
        g.decided = true;
      }

      // From here on the gesture is ours and the page must not scroll along.
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
      // A clear flick beats the distance: whoever swipes hard to the right
      // means "open", even when letting go at a third.
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
      {/* Wide screen: the panel is simply there, at full height. */}
      <nav
        aria-label={t.nav.main}
        className="ds-sidebar ds-sidebar--ink sticky top-0 hidden h-screen lg:flex"
      >
        <Wordmark />
        <NavList groups={groups} activeId={activeId} />
        {footer && <div className="mt-auto">{footer}</div>}
      </nav>

      {/* Phone: the same panel, slid out. It stays in place when it is
          closed (see ds.css), so a swipe can pick it up. */}
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
          aria-label={t.nav.main}
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

/** The position halfway through a swipe. Without a swipe no inline style: then the
 *  classes decide where the panel is, with their transition. The offset is a
 *  percentage of its own width, so the width does not need to be known
 *  here: 0 is fully gone, 1 is fully open. */
function styleAt(drag: number | null, part: "panel" | "scrim"): React.CSSProperties | undefined {
  if (drag === null) return undefined;
  return part === "panel" ? { transform: `translate3d(${(drag - 1) * 100}%, 0, 0)` } : { opacity: drag };
}

/** The logomark and the wordmark, in the display face.
 *
 *  The app is called "health-tracker": lower case and a hyphen, not "Health Tracker".
 *  Not the name of one of the destinations, because a wordmark that reads like a
 *  menu item puts you on the wrong foot.
 *
 *  The mark in front is the same ligature as the home-screen icon, so inside the
 *  app it carries the same sign it has on your phone.
 *  15px is the x-height of the wordmark next to it; together with the baseline
 *  alignment of .ds-sidebar__brand they sit on one line. */
function Wordmark() {
  return (
    <div className="ds-sidebar__brand">
      <Logomark height={15} className="ds-sidebar__logo" />
      <span className="ds-sidebar__wordmark">health-tracker</span>
    </div>
  );
}
