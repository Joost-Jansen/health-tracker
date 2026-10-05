"use client";

// Help, Handleiding : aan de slag, je gegevens binnenhalen, zones, hoe de
// cijfers werken, waar je wat vindt. Dezelfde stappen en teksten als in de rondleiding (components/onboarding/steps.tsx);
// uitleg over gezondheid en prestaties uit lib/texts.ts (t.texts).

import Card from "@/components/Card";
import { A, stepExplain } from "@/components/onboarding/steps";
import { useT } from "@/lib/i18n";
import { bold, rich } from "@/lib/i18n/rich";
import { PAGES, useOnboarding, type StepId } from "@/lib/onboarding";

function Text({ children }: { children: React.ReactNode }) {
  return <div className="flex max-w-[46rem] flex-col gap-3 text-[13.5px] leading-relaxed">{children}</div>;
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return <ul className="list-disc pl-5">{items.map((b, i) => <li key={i}>{b}</li>)}</ul>;
}

function Part({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card title={title}><Text>{children}</Text></Card>
    </section>
  );
}

export default function Handleiding() {
  const t = useT();
  const m = t.help.manual;
  const T = t.texts;
  const o = useOnboarding().data ?? null;
  const ex = (id: StepId) => stepExplain(id, o, t);
  const doneNote = (id: StepId, text: string) => o?.steps[id] ? <span className="text-ink-muted"> {text}</span> : null;
  const title = (id: string) => m.contents.find(([k]) => k === id)?.[1] ?? id;
  const link = (href: string) => (c: string) => <A href={href}>{c}</A>;

  return (
    <div className="flex flex-col gap-4">
      <Card title={m.title}>
        <Text>
          <p>{m.intro}</p>
          <nav aria-label={m.contentsAria} className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {m.contents.map(([id, name]) => <a key={id} href={`#${id}`} className="underline underline-offset-4">{name}</a>)}
          </nav>
        </Text>
      </Card>

      <Part id="beginnen" title={title("beginnen")}>
        <ol className="list-decimal pl-5">
          <li>{rich(m.stepGarmin, { b: bold, link: link("/settings/connections/") })}{doneNote("garmin", m.doneNote)}</li>
          <li>{rich(m.stepSync, { b: bold })}{doneNote("sync", m.syncDoneNote(o?.status.activities.count ?? 0))}</li>
          <li>{rich(m.stepZones, { b: bold, link: link("/settings/zones/") })}{doneNote("zones", m.doneNote)}</li>
        </ol>
        <p className="text-xs text-ink-muted">{rich(m.progressAt, { link: link("/help/") })}</p>
      </Part>

      <Part id="gegevens" title={title("gegevens")}>
        <p>{ex("garmin").intro}</p>
        <Bullets items={ex("garmin").bullets} />
        <p>{ex("sync").intro}</p>
        <Bullets items={ex("sync").bullets} />
      </Part>

      <Part id="zones" title={title("zones")}>
        <p>{ex("zones").intro}</p>
        <Bullets items={ex("zones").bullets} />
        <p>{T.onboarding.profileWhy}</p>
        <p className="text-xs text-ink-muted">{T.onboarding.wristHr}</p>
      </Part>

      <Part id="cijfers" title={title("cijfers")}>
        <p><b>{m.readiness}</b> {T.readinessBasis}</p>
        <p><b>{m.form}</b> {T.formMethod}</p>
        <p><b>{m.z2}</b> {T.z2Pace}</p>
        <p><b>{m.records}</b> {T.records}</p>
        <p className="text-xs text-ink-muted">{T.noMedicalAdvice}</p>
      </Part>

      <Part id="waar" title={title("waar")}>
        <ul className="list-disc pl-5">
          {PAGES.map((p) => <li key={p.id}><A href={p.href}>{t.onboarding.pages[p.id].label}</A>: {t.onboarding.pages[p.id].text}.</li>)}
          <li><A href="/plan/">{t.nav.items.plan}</A>: {m.plan}</li>
          <li><A href="/log/">{t.nav.items.logboek}</A>: {m.log}</li>
          <li><A href="/settings/">{t.nav.items.instellingen}</A>: {m.settings}</li>
        </ul>
        <p className="text-xs text-ink-muted">{m.smallPrint}</p>
      </Part>

      <Part id="schema" title={title("schema")}>
        <p>{ex("goals").intro}</p>
        <Bullets items={ex("goals").bullets} />
        <p>{ex("plan").intro}</p>
        <Bullets items={ex("plan").bullets} />
        <p>{rich(m.claudeToo, { link: link("/help/claude/") })}</p>
      </Part>
    </div>
  );
}
