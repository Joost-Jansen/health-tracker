"use client";

// Help, Handleiding (zoals Help, Portefeuille in een eerder project): aan de slag, je gegevens binnenhalen, zones, hoe de
// cijfers werken, waar je wat vindt. Dezelfde stappen en teksten als in de rondleiding (components/onboarding/steps.tsx);
// uitleg over gezondheid en prestaties uit lib/texts.ts.

import Card from "@/components/Card";
import { A, stepExplain } from "@/components/onboarding/steps";
import { PAGES, useOnboarding, type StepId } from "@/lib/onboarding";
import { T } from "@/lib/texts";

const CONTENTS: [string, string][] = [
  ["beginnen", "Aan de slag"],
  ["gegevens", "Je gegevens binnenhalen"],
  ["zones", "Hartslagzones"],
  ["cijfers", "Hoe de cijfers werken"],
  ["waar", "Waar je wat vindt"],
  ["schema", "Doelen en schema"],
];

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
  const o = useOnboarding().data ?? null;
  const ex = (id: StepId) => stepExplain(id, o);
  const doneNote = (id: StepId, text: string) => o?.steps[id] ? <span className="text-ink-muted"> {text}</span> : null;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Zo werkt health-tracker">
        <Text>
          <p>
            De site haalt je trainingen (met GPS en hartslag per seconde) en je herstel (slaap, rusthartslag, Body Battery) van
            Garmin, en rekent alles door met je eigen hartslagzones: tijd per zone, belasting, vorm, rondjes en records.
          </p>
          <nav aria-label="Inhoud" className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {CONTENTS.map(([id, title]) => <a key={id} href={`#${id}`} className="underline underline-offset-4">{title}</a>)}
          </nav>
        </Text>
      </Card>

      <Part id="beginnen" title="Aan de slag">
        <ol className="list-decimal pl-5">
          <li><b>Garmin koppelen</b> bij <A href="/instellingen/koppelingen/">Instellingen, Koppelingen</A>.{doneNote("garmin", "Gedaan.")}</li>
          <li><b>De eerste sync</b> afwachten: die begint vanzelf.{doneNote("sync", `Gedaan: ${o?.status.activities.count ?? 0} trainingen.`)}</li>
          <li><b>Hartslagzones</b> instellen bij <A href="/instellingen/zones/">Instellingen, Zones en profiel</A>.{doneNote("zones", "Gedaan.")}</li>
        </ol>
        <p className="text-xs text-ink-muted">Je voortgang per stap staat onder <A href="/help/">Aan de slag</A>.</p>
      </Part>

      <Part id="gegevens" title="Je gegevens binnenhalen">
        <p>{ex("garmin").intro}</p>
        <Bullets items={ex("garmin").bullets} />
        <p>{ex("sync").intro}</p>
        <Bullets items={ex("sync").bullets} />
      </Part>

      <Part id="zones" title="Hartslagzones">
        <p>{ex("zones").intro}</p>
        <Bullets items={ex("zones").bullets} />
        <p>{T.onboarding.profileWhy}</p>
        <p className="text-xs text-ink-muted">{T.onboarding.wristHr}</p>
      </Part>

      <Part id="cijfers" title="Hoe de cijfers werken">
        <p><b>Klaar voor vandaag?</b> {T.readinessBasis}</p>
        <p><b>Vorm.</b> {T.formMethod}</p>
        <p><b>Tempo bij Z2.</b> {T.z2Pace}</p>
        <p><b>Records.</b> {T.records}</p>
        <p className="text-xs text-ink-muted">{T.noMedicalAdvice}</p>
      </Part>

      <Part id="waar" title="Waar je wat vindt">
        <ul className="list-disc pl-5">
          {PAGES.map((p) => <li key={p.id}><A href={p.href}>{p.label}</A>: {p.text}.</li>)}
          <li><A href="/plan/">Schema</A>: je trainingsschema, met wat je gedaan of gemist hebt.</li>
          <li><A href="/log/">Logboek</A>: log, analyses (ook van Claude), doelen en profiel.</li>
          <li><A href="/instellingen/">Instellingen</A>: account, Garmin, zones en profiel, agents.</li>
        </ul>
        <p className="text-xs text-ink-muted">Onder veel blokken staat in kleine letters hoe het berekend is.</p>
      </Part>

      <Part id="schema" title="Doelen en schema">
        <p>{ex("goals").intro}</p>
        <Bullets items={ex("goals").bullets} />
        <p>{ex("plan").intro}</p>
        <Bullets items={ex("plan").bullets} />
        <p>Claude kan beide voor je bijhouden: zie <A href="/help/claude/">Claude als coach</A>.</p>
      </Part>
    </div>
  );
}
