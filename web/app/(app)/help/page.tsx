"use client";

// Help, Aan de slag: de checklist uit je eigen data, hoe je de site gebruikt (alleen de
// site of ook met Claude), en de rondleiding opnieuw. De handleiding en de uitleg over Claude staan in de tabs ernaast.

import Card from "@/components/Card";
import { Button, ButtonLink, Tabs } from "@/components/ds";
import { countSteps, Progress, StepList } from "@/components/onboarding/Checklist";
import { CHOICES, PAUSED_KEY, useOnboarding, useSetOnboarding, type Choice } from "@/lib/onboarding";

export default function HelpStart() {
  const q = useOnboarding();
  const set = useSetOnboarding();
  const o = q.data;
  if (!o) return <div className="h-72 animate-pulse rounded" style={{ background: "var(--surface-inset)" }} />;
  const { done, total } = countSteps(o);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Aan de slag">
        <p className="mb-3 max-w-prose text-[13px] leading-relaxed text-ink-muted">
          health-tracker haalt je trainingen en herstel van Garmin en rekent alles door met je eigen hartslagzones. Hieronder
          zie je wat al staat en wat nog kan; elke stap vinkt vanzelf af. Hoe de cijfers berekend worden staat onder de blokken
          zelf, en uitgebreider in de handleiding.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-ink-muted">Ik gebruik:</span>
          <Tabs variant="segmented" ariaLabel="Hoe je de site gebruikt" items={CHOICES.map((c) => ({ id: c.id, label: c.title }))}
            value={o.choice ?? "site"} onChange={(v) => set.mutate({ choice: v as Choice })} />
          <Button size="sm" variant="ghost" disabled={set.isPending} onClick={() => {
            try { sessionStorage.removeItem(PAUSED_KEY); } catch { /* geen opslag */ }
            set.mutate({ done: false, step: 0 });
          }}>
            Rondleiding opnieuw
          </Button>
        </div>
      </Card>

      <Card title="Je voortgang" action={<span className="w-40"><Progress done={done} total={total} /></span>}>
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">De basis</h3>
              <ButtonLink href="/help/handleiding/" size="sm" variant="ghost">Handleiding</ButtonLink>
            </div>
            <StepList o={o} only="required" />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Verder</h3>
              {o.choice === "claude" && <ButtonLink href="/help/claude/" size="sm" variant="ghost">Claude als coach</ButtonLink>}
            </div>
            <StepList o={o} only="optional" />
          </div>
        </div>
      </Card>
    </div>
  );
}
