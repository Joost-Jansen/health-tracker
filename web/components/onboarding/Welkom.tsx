"use client";

// De rondleiding van de eerste keer:
//
//   1. Hoe wil je health-tracker gebruiken? Alleen de site, of ook met Claude als coach (dan komt de stap
//      "Claude koppelen" erbij). Later te veranderen onder Help.
//   2. De stappen: Garmin koppelen, eerste sync, zones, profiel, rondkijken, (Claude), doelen en schema. Elke stap
//      zegt uit je eigen data of hij al gedaan is, en vinkt vanzelf af (ook tijdens de eerste sync).
//   3. Terug kan altijd, vooruit met Volgende; een stap komt vrij als je bij de vorige was.
//
// Stuurt een stap je ergens heen (Koppelingen, Zones), dan pauzeert de rondleiding en ga je verder met het knopje
// rechtsonder. Waar je bent staat bij je account (api/onboarding.py), dus ook op een ander apparaat.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, IconButton } from "@/components/ds";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/components/icons";
import { CHOICES, PAGES, PAUSED_KEY, STEPS, stepShown, useOnboarding, useSetOnboarding, type Choice, type StepId } from "@/lib/onboarding";
import { useFormat, useT } from "@/lib/i18n";
import { Check, stepExplain, stepSummary } from "./steps";

type Action = { label: string; href: string };
type TourStep = { key: string; title: string; done?: boolean; ids: StepId[]; intro: React.ReactNode; bullets: React.ReactNode[]; visual?: React.ReactNode; actions: Action[] };

function Phases({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg p-4" style={{ background: "var(--surface-inset)" }}>
      {lines.map((r, i) => (
        <span key={r} className="flex items-center gap-2 text-[12.5px]">
          <span className="grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-semibold tabular-nums" style={{ background: "var(--surface-card)" }}>{i + 1}</span>
          {r}
        </span>
      ))}
    </div>
  );
}

function readPaused(): boolean {
  try { return sessionStorage.getItem(PAUSED_KEY) === "1"; } catch { return false; }
}
function writePaused(v: boolean) {
  try { if (v) sessionStorage.setItem(PAUSED_KEY, "1"); else sessionStorage.removeItem(PAUSED_KEY); } catch { /* geen opslag */ }
}

export default function Welkom({ enabled }: { enabled: boolean }) {
  const t = useT();
  const f = useFormat();
  const tr = t.onboarding.tour;
  const router = useRouter();
  const q = useOnboarding(enabled);
  const set = useSetOnboarding();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [step, setStep] = useState<number | null>(null); // 0 = eerste stap na de keuze
  const [reached, setReached] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => setPaused(readPaused()), []);

  // "Rondleiding opnieuw" in Help zet de stap terug op 0: begin dan vooraan.
  const serverStep = q.data?.step ?? 0;
  const done = q.data?.done ?? true;
  useEffect(() => {
    if (!done && serverStep === 0) {
      setPaused(false);
      setStep(null);
      setReached(0);
      setChoice(null);
      setChoosing(true);
    }
  }, [done, serverStep]);

  const o = q.data;
  if (!o || o.done) return null;
  const chosen = choice ?? o.choice;
  const current = step ?? Math.max(0, serverStep - 1);
  const onChoice = choosing || !chosen || (step === null && serverStep === 0);

  const save = (i: number) => set.mutate({ step: i + 1 });
  const finish = () => {
    writePaused(false);
    set.mutate({ done: true, step: 0 });
  };
  const pause = (href?: string) => {
    setPaused(true);
    writePaused(true);
    save(current);
    if (href) router.push(href);
  };

  const view = { ...o, choice: chosen };
  const tour: TourStep[] = [
    {
      key: "intro", title: tr.introTitle, ids: [],
      intro: tr.intro,
      bullets: tr.introBullets,
      visual: <Phases lines={tr.phases} />,
      actions: [],
    },
  ];
  for (const s of STEPS) {
    if (!stepShown(s, view) || s.id === "plan") continue;
    const ex = stepExplain(s.id, o, t);
    if (s.id === "goals") {
      const plan = stepExplain("plan", o, t);
      tour.push({
        key: "goals-plan", title: tr.goalsPlan, ids: ["goals", "plan"], done: o.steps.goals && o.steps.plan,
        intro: <>{ex.intro} {plan.intro}</>, bullets: [...ex.bullets, ...plan.bullets],
        actions: [{ label: t.onboarding.goTo(t.onboarding.steps.goals.link), href: "/analyses/doelen/" }, { label: t.onboarding.goTo(t.onboarding.steps.plan.link), href: "/plan/" }],
      });
      continue;
    }
    tour.push({
      key: s.id, title: s.optional ? tr.optional(t.onboarding.steps[s.id].title) : t.onboarding.steps[s.id].title, ids: [s.id], done: o.steps[s.id],
      intro: ex.intro, bullets: ex.bullets,
      actions: s.id === "explore" ? PAGES.filter((p) => p.id !== "dashboard").map((p) => ({ label: t.onboarding.goTo(t.onboarding.pages[p.id].label), href: p.href }))
        : s.id === "sync" && !o.status.garmin.connected ? []
        : [{ label: t.onboarding.goTo(t.onboarding.steps[s.id].link), href: s.href }],
    });
  }
  tour.push({
    key: "done", title: tr.doneTitle, ids: [],
    intro: tr.doneIntro,
    bullets: tr.doneBullets,
    actions: [],
  });

  const i = Math.min(current, tour.length - 1);
  const here = tour[i];

  if (paused && !onChoice) {
    return (
      <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-[12.5px]"
        style={{ background: "var(--surface-card)", boxShadow: "inset 0 0 0 1px var(--border-hairline), var(--shadow-4)" }} role="status">
        <span className="truncate">{tr.paused(i + 1, tour.length)}</span>
        <Button size="sm" variant="primary" onClick={() => { setPaused(false); writePaused(false); q.refetch(); }}>{tr.resume}</Button>
        <Button size="sm" variant="ghost" onClick={finish}>{tr.stop}</Button>
      </div>
    );
  }

  const go = (n: number) => {
    setStep(n);
    setReached((b) => Math.max(b, n));
    save(n);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={tr.aria}>
      <div className="absolute inset-0" style={{ background: "rgba(20,24,20,0.42)" }} onClick={() => (onChoice ? undefined : pause())} />
      <div className="relative flex max-h-[90dvh] w-full max-w-[500px] flex-col overflow-y-auto overscroll-contain rounded-xl p-6"
        style={{ background: "var(--surface-card)", boxShadow: "inset 0 0 0 1px var(--border-hairline), var(--shadow-4)" }}>
        <div className="mb-3 flex items-center justify-between">
          <span className="ds-eyebrow">{onChoice ? tr.welcome : tr.tour}</span>
          <IconButton label={onChoice ? t.common.close : tr.pause} onClick={() => (onChoice ? finish() : pause())}
            icon={<CloseIcon className="h-4 w-4" />} className="-mr-2 flex-none" />
        </div>

        {onChoice ? (
          <>
            <h3 className="mb-1.5 font-display text-[21px] font-normal tracking-[-0.014em]">{tr.welcomeTitle}</h3>
            <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
              {tr.welcomeText}
            </p>
            <div className="flex flex-col gap-2">
              {CHOICES.map((c) => (
                <button key={c} type="button"
                  onClick={() => { setChoice(c); setChoosing(false); setStep(0); setReached(0); set.mutate({ choice: c, step: 1 }); }}
                  className="rounded-lg p-3 text-left transition-colors hover:bg-surface-2"
                  style={{ border: `1px solid ${chosen === c ? "var(--text-primary)" : "var(--border)"}` }}>
                  <span className="block text-[14px] font-semibold">{t.onboarding.choices[c].title}</span>
                  <span className="block text-xs text-ink-muted">{t.onboarding.choices[c].text}</span>
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Button variant="ghost" className="-ml-3" onClick={finish}>{tr.skip}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex gap-1">
              {tour.map((step, n) => (
                <button key={step.key} type="button" disabled={n > Math.max(reached, i)} onClick={() => go(n)}
                  aria-label={tr.stepAria(n + 1, step.title, n > Math.max(reached, i))}
                  className="h-1.5 flex-1 rounded-full disabled:cursor-not-allowed"
                  style={{ background: n <= i ? "var(--n-800)" : n <= reached ? "var(--border-strong)" : "var(--surface-inset)" }} />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11.5px] text-ink-muted">{tr.step(i + 1, tour.length)}</span>
              {here.done !== undefined && (
                <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: here.done ? "var(--text-gain)" : "var(--text-muted)" }}>
                  <Check done={here.done} size={16} /> {here.done ? tr.done : tr.todo}
                </span>
              )}
            </div>

            <h3 className="mb-1.5 mt-4 font-display text-[21px] font-normal tracking-[-0.014em]">{here.title}</h3>
            <p className="mb-3 text-[13px] leading-relaxed text-ink-muted">{here.intro}</p>
            {here.visual && <div className="mb-3">{here.visual}</div>}
            {here.ids.length > 0 && (
              <div className="mb-3 flex flex-col gap-1.5 rounded-lg px-3 py-2.5 text-[12.5px] leading-relaxed" style={{ background: "var(--surface-inset)" }}>
                {here.ids.map((id) => (
                  <span key={id} className="flex gap-2">
                    {here.ids.length > 1 && <Check done={o.steps[id]} size={16} />}
                    <span>{stepSummary(id, o, t, f)}</span>
                  </span>
                ))}
              </div>
            )}
            {here.bullets.length > 0 && (
              <ul className="mb-4 space-y-1.5">
                {here.bullets.map((b, n) => (
                  <li key={n} className="flex gap-2 text-[12.5px] leading-relaxed">
                    <span className="mt-[7px] h-1 w-1 flex-none rounded-full" style={{ background: "var(--text-faint)" }} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {here.actions.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {here.actions.map((a) => <Button key={a.href} size="sm" variant="secondary" onClick={() => pause(a.href)}>{a.label}</Button>)}
                <span className="text-xs text-ink-muted">{tr.waits}</span>
              </div>
            )}

            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <Button variant="ghost" className="-ml-3" onClick={() => (i === 0 ? setChoosing(true) : go(i - 1))}
                icon={<ChevronLeftIcon className="h-3.5 w-3.5" />}>
                {i === 0 ? tr.otherChoice : t.common.previous}
              </Button>
              {i < tour.length - 1 ? (
                <Button variant="primary" onClick={() => go(i + 1)} iconAfter={<ChevronRightIcon className="h-3.5 w-3.5" />}>{t.common.next}</Button>
              ) : (
                <Button variant="primary" onClick={finish}>{t.common.done}</Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
