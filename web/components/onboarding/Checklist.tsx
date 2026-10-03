"use client";

// De checklist "Aan de slag": elke stap met een vinkje uit je eigen data. Op Vandaag als kaart (vervangt de oude
// welkomstkaart) zolang de rondleiding niet klaar is, of zolang er nog geen trainingen zijn en je hem niet hebt
// verborgen; in Help altijd, als lijst.

import Link from "next/link";
import Card from "@/components/Card";
import { Button, ButtonLink } from "@/components/ds";
import { STEPS, stepShown, useOnboarding, useSetOnboarding, type Onboarding } from "@/lib/onboarding";
import { CheckRow, stepSummary } from "./steps";

export function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-2.5" aria-label={`${done} van ${total} stappen gedaan`}>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < done ? "var(--pos)" : "var(--surface-inset)" }} />
        ))}
      </div>
      <span className="text-[11.5px] tabular-nums text-ink-muted">{done} van {total}</span>
    </div>
  );
}

/** De stappen als lijst. `only`: alleen de verplichte of alleen de optionele. */
export function StepList({ o, only, links = true }: { o: Onboarding; only?: "required" | "optional"; links?: boolean }) {
  const steps = STEPS.filter((s) => stepShown(s, o) && (!only || (only === "optional") === s.optional));
  return (
    <ul className="flex flex-col">
      {steps.map((s) => (
        <CheckRow key={s.id} done={o.steps[s.id]} title={s.title} optional={s.optional}
          action={links && !o.steps[s.id] && s.id !== "explore" && !(s.id === "sync" && !o.status.garmin.connected)
            ? <ButtonLink href={s.href} size="sm" variant="secondary">{s.hrefLabel.replace(/^Naar /, "")}</ButtonLink>
            : undefined}>
          {stepSummary(s.id, o)}
        </CheckRow>
      ))}
    </ul>
  );
}

export function countSteps(o: Onboarding) {
  const steps = STEPS.filter((s) => stepShown(s, o));
  return { done: steps.filter((s) => o.steps[s.id]).length, total: steps.length };
}

/** De kaart op Vandaag. Toont zichzelf alleen als hij nodig is. */
export default function OnboardingCard() {
  const q = useOnboarding();
  const set = useSetOnboarding();
  const o = q.data;
  if (!o) return null;
  const show = !o.done || (o.status.activities.count === 0 && !o.hidden.includes("checklist"));
  if (!show) return null;
  const { done, total } = countSteps(o);

  return (
    <Card title="Aan de slag" action={
      <div className="flex items-center gap-1">
        <ButtonLink href="/help/" size="sm" variant="ghost">Help</ButtonLink>
        <Button size="sm" variant="ghost" disabled={set.isPending}
          onClick={() => set.mutate(o.done ? { hide: "checklist" } : { done: true, hide: "checklist" })}>
          Verbergen
        </Button>
      </div>
    }>
      <p className="mb-3 max-w-prose text-[13px] leading-relaxed text-ink-muted">
        {o.required_done
          ? "De basis staat: je trainingen komen binnen en alles rekent met je eigen zones. Wat hieronder nog open staat is optioneel."
          : "Drie stappen en de site werkt met jouw data: Garmin koppelen, de eerste sync, en je hartslagzones. De rest is optioneel."}
      </p>
      <div className="mb-2"><Progress done={done} total={total} /></div>
      <StepList o={o} only={o.required_done ? "optional" : "required"} />
      {!o.required_done && (
        <p className="mt-2 border-t border-border pt-2.5 text-xs text-ink-muted">
          Daarna, optioneel: {STEPS.filter((s) => s.optional && stepShown(s, o)).map((s) => (s.title.startsWith("Claude") ? s.title : s.title.toLowerCase())).join(", ")}. Alles staat ook onder{" "}
          <Link href="/help/" className="underline underline-offset-4">Help</Link>.
        </p>
      )}
    </Card>
  );
}
