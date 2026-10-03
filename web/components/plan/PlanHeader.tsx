"use client";

// Kop van het actieve schema: titel en doel, aftellen naar de wedstrijd, voortgang, en de notities als markdown
// (lange notities ingeklapt met "meer").

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Markdown from "@/components/log/Markdown";
import { Button } from "@/components/ds";
import type { Plan } from "@/lib/training";
import { daysBetween, fmtLong, fmtNum } from "./plan";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function Countdown({ name, date, today }: { name: string; date: string; today: string }) {
  const days = daysBetween(today, date);
  const big = days > 0 ? String(days) : days === 0 ? "Vandaag" : "✓";
  const line = days > 1 ? "dagen tot" : days === 1 ? "dag tot" : days === 0 ? "is het zover:" : "geweest:";
  return (
    <div className="flex min-w-[150px] flex-col justify-center rounded-md bg-[var(--surface-brand-soft)] px-4 py-3 sm:items-end sm:text-right">
      <span className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
        <span className="font-display text-[40px] font-light leading-none tabular-nums text-brand">{days < 0 ? fmtNum(-days, 0) : big}</span>
        <span className="text-[12.5px] text-[var(--text-secondary)]">
          {days < 0 ? `dagen geleden: ${name || "wedstrijd"}` : `${line} ${name || "de wedstrijd"}`}
        </span>
      </span>
      <span className="mt-1 text-[12px] text-ink-muted">{fmtLong(date)}</span>
    </div>
  );
}

function Notes({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (el) setLong(el.scrollHeight > 132);
  }, [text]);
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div ref={ref} className={`relative max-w-[72ch] ${!open && long ? "max-h-[120px] overflow-hidden" : ""}`}>
        <Markdown text={text} className="text-[13px] [&_h2]:mt-3 [&_h2]:text-[13.5px]" />
        {!open && long && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[var(--surface-card)] to-transparent" />}
      </div>
      {long && (
        <button type="button" className="mt-1 text-[12.5px] font-semibold text-brand hover:underline" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Minder" : "Meer"}
        </button>
      )}
    </div>
  );
}

export default function PlanHeader({
  plan,
  race,
  today,
  weekIndex,
  weekCount,
  onEdit,
  onNew,
  onFinish,
}: {
  plan: Plan;
  race: { name: string; date: string | null };
  today: string;
  weekIndex: number | null;
  weekCount: number;
  onEdit: () => void;
  onNew: () => void;
  onFinish: () => void;
}) {
  const train = plan.sessions.filter((s) => s.sport !== "rest");
  const done = train.filter((s) => s.status === "gedaan").length;
  const due = train.filter((s) => s.status === "gedaan" || s.status === "gemist").length;
  const left = train.filter((s) => s.status === "gepland" || s.status === "vandaag").length;
  const pct = due ? Math.round((done / due) * 100) : null;

  return (
    <section className="rounded border border-border bg-surface p-4 sm:p-[22px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
            Actief schema{weekIndex != null ? ` · week ${weekIndex + 1} van ${weekCount}` : ` · ${weekCount} ${weekCount === 1 ? "week" : "weken"}`}
          </span>
          <h1 className="mt-1 font-display text-[28px] font-light leading-tight sm:text-[32px]">{plan.title}</h1>
          {plan.goal && (
            <p className="mt-1.5 text-[14px]">
              <span className="text-ink-muted">Doel: </span>
              <span className="font-medium">{plan.goal}</span>
            </p>
          )}
          {race.name && !race.date && <p className="mt-0.5 text-[13px] text-ink-muted">{race.name}</p>}
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-ink-muted">
            <div>
              <dt className="sr-only">Uitgevoerd</dt>
              <dd>
                {pct != null ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                      <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--data-gain)" }} />
                    </span>
                    <span className="tabular-nums"><span className="font-semibold text-[var(--text-primary)]">{done} van {due}</span> sessies tot nu gedaan</span>
                  </span>
                ) : (
                  "Nog niets te vergelijken"
                )}
              </dd>
            </div>
            <div><dt className="sr-only">Nog te gaan</dt><dd className="tabular-nums"><span className="font-semibold text-[var(--text-primary)]">{left}</span> nog te gaan</dd></div>
            <div><dt className="sr-only">Gemaakt door</dt><dd>gemaakt door {plan.author}</dd></div>
          </dl>
        </div>
        {race.date && <Countdown name={race.name} date={race.date} today={today} />}
      </div>
      {plan.notes && <Notes text={plan.notes} />}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" onClick={onEdit}>Bewerken</Button>
        <Button size="sm" variant="ghost" onClick={onNew}>Nieuw schema</Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onFinish}>Afronden</Button>
      </div>
    </section>
  );
}
