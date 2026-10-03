"use client";

// De tijdbalk van Trends, naar de Tijdbalk van een eerder project: altijd in beeld
// (plakt onder de bovenbalk), links de periodes, rechts "Aanpassen" met een
// paneel voor een eigen van-tot, schuif- en zoomknoppen en een overzicht van de
// hele geschiedenis om het venster in te slepen.
//
// Met de muis klapt het paneel open zodra je over de balk gaat en dicht als je
// hem verlaat (zoals in een eerder project); met aanraken of het toetsenbord met de knop.

import { useEffect, useId, useRef, useState } from "react";
import { Button, Input, Tabs } from "@/components/ds";
import RangeBrush from "@/components/timefilter/RangeBrush";
import type { TimeRange } from "@/components/timefilter/useTimeRange";
import { PERIODS, fmtWindow, moveWindow, windowDays, type DayPoint } from "@/lib/timeline";

/** Hoogte van de vaste bovenbalk (`.ds-topbar` in app/ds.css: height 60px). De tijdbalk plakt eronder. */
export const TOPBAR_HEIGHT = 60;

export default function TimeFilterBar({
  range,
  first,
  last,
  overview,
  label = "Periode voor alle grafieken",
}: {
  range: TimeRange;
  first: string;
  last: string;
  /** Silhouet in het overzicht, bijvoorbeeld de fitheid per dag. */
  overview?: DayPoint[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const panelId = useId();
  const bar = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pointer = useRef<string | null>(null);
  const { window: w, period, custom, choose, change, reset } = range;
  const valid = w.from <= w.to && w.from >= first && w.to <= last;

  // Een haarlijn onder de balk zodra hij plakt; daarvoor staat hij gewoon in de pagina.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const top = bar.current?.getBoundingClientRect().top;
      setStuck(top !== undefined && top <= TOPBAR_HEIGHT + 0.5 && window.scrollY > 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: PointerEvent) => {
      if (e.target instanceof Node && !bar.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const days = windowDays(w);
  const current = custom ? (
    <button
      type="button"
      onClick={reset}
      title={`Terug naar ${range.preset}`}
      aria-label={`Eigen periode ${fmtWindow(w)} weghalen, terug naar ${range.preset}`}
      className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs transition-colors hover:bg-surface"
    >
      <span className="truncate tabular-nums">{fmtWindow(w)}</span>
      <span aria-hidden className="shrink-0 text-ink-muted">×</span>
    </button>
  ) : (
    <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-ink-muted">{fmtWindow(w)}</span>
  );

  return (
    <div
      ref={bar}
      className="sticky z-20 -mx-4 min-w-0 px-4 sm:-mx-6 sm:px-6 lg:-mx-page lg:px-page"
      style={{
        top: TOPBAR_HEIGHT,
        background: "var(--surface-page)",
        borderBottom: `1px solid ${stuck ? "var(--border-hairline)" : "transparent"}`,
        transition: "border-color 160ms ease",
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && e.buttons === 0) setOpen(false);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") pointer.current = null;
        if (e.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <div className="relative">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto py-2.5">
            <Tabs items={PERIODS} value={period} onChange={choose} variant="quiet" ariaLabel={label} className="shrink-0 whitespace-nowrap" />
            <span className="mx-1 hidden h-5 shrink-0 border-l border-border sm:block" aria-hidden />
            <span className="hidden sm:contents">{current}</span>
          </div>
          <button
            ref={button}
            type="button"
            aria-controls={panelId}
            aria-expanded={open}
            data-open={open}
            onPointerDown={(e) => {
              pointer.current = e.pointerType;
            }}
            onClick={() => setOpen((v) => (pointer.current === "mouse" ? true : !v))}
            className="shrink-0 rounded-md px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 data-[open=true]:bg-surface-2 data-[open=true]:text-ink"
          >
            Aanpassen <span aria-hidden>{open ? "▴" : "▾"}</span>
          </button>
        </div>

        {/* Op een telefoon past het venster niet naast de periodes: een eigen regel eronder. */}
        <div className="-mt-1 flex pb-2 sm:hidden">{current}</div>

        <div
          id={panelId}
          inert={!open}
          data-open={open}
          role="region"
          aria-label="Periode aanpassen"
          className="absolute right-0 top-full w-full max-w-[720px] overflow-y-auto rounded-b-md p-4 transition-[opacity,transform,visibility] duration-150 ease-out motion-reduce:transition-none"
          style={{
            maxHeight: "min(70vh, 560px)",
            background: "var(--surface-card)",
            border: "1px solid var(--border-hairline)",
            boxShadow: "0 18px 36px rgba(0, 0, 0, .16)",
            opacity: open ? 1 : 0,
            transform: open ? "translateY(0)" : "translateY(-8px)",
            visibility: open ? "visible" : "hidden",
            pointerEvents: open ? "auto" : "none",
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
            <span className="text-xs font-semibold uppercase tracking-wide">Periode</span>
            <span className="text-xs tabular-nums text-ink-muted">
              {days} {days === 1 ? "dag" : "dagen"}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="Vanaf"
              type="date"
              value={w.from}
              min={first}
              max={w.to}
              onChange={(e) => {
                if (e.target.value) change({ ...w, from: e.target.value });
              }}
            />
            <Input
              label="Tot en met"
              type="date"
              value={w.to}
              min={w.from}
              max={last}
              onChange={(e) => {
                if (e.target.value) change({ ...w, to: e.target.value });
              }}
            />
            <div className="flex gap-1 pb-0.5" role="group" aria-label="Tijdlijn zoomen en verschuiven">
              <Button size="sm" variant="ghost" aria-label="Vorige periode" title="Vorige periode" disabled={!valid || w.from <= first} onClick={() => change(moveWindow(w, first, last, 1, -1))}>
                ←
              </Button>
              <Button size="sm" variant="ghost" aria-label="Inzoomen" title="Inzoomen" disabled={!valid || days <= 7} onClick={() => change(moveWindow(w, first, last, 0.5))}>
                +
              </Button>
              <Button size="sm" variant="ghost" aria-label="Uitzoomen" title="Uitzoomen" disabled={!valid || (w.from === first && w.to === last)} onClick={() => change(moveWindow(w, first, last, 2))}>
                −
              </Button>
              <Button size="sm" variant="ghost" aria-label="Volgende periode" title="Volgende periode" disabled={!valid || w.to >= last} onClick={() => change(moveWindow(w, first, last, 1, 1))}>
                →
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <RangeBrush first={first} last={last} window={w} onChange={change} points={overview} />
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-muted">
            In elke grafiek: slepen verschuift, Ctrl/⌘ + scrollen of knijpen zoomt, dubbelklik zet de periode terug. Op een telefoon lees je af met één vinger en zoom je met twee.
          </p>
        </div>
      </div>
    </div>
  );
}
