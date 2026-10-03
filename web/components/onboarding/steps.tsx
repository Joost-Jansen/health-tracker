"use client";

// De uitleg per stap, één keer geschreven: de rondleiding, de checklist op Vandaag en Help tonen dezelfde tekst
// Wat over de gebruiker gaat (aantal trainingen, max hartslag, wanneer
// gekoppeld) komt uit de onboarding-status; uitleg over gezondheid en prestaties uit lib/texts.ts.

import Link from "next/link";
import { T } from "@/lib/texts";
import { PAGES, type Onboarding, type StepId } from "@/lib/onboarding";
import { sportLabel } from "@/lib/training";

const FIRST_SYNC_DAYS = 365;

export function A({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  return <Link href={href} onClick={onClick} className="underline underline-offset-4">{children}</Link>;
}

function day(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Een vinkje: groen als gedaan, een stip als het nog moet. */
export function Check({ done, size = 20 }: { done: boolean; size?: number }) {
  return (
    <span aria-hidden className="grid flex-none place-items-center rounded-full text-[11px] font-semibold"
      style={{
        width: size, height: size,
        background: done ? "var(--pos)" : "var(--surface-inset)",
        color: done ? "var(--surface-card)" : "var(--text-faint)",
      }}>
      {done ? "✓" : "·"}
    </span>
  );
}

/** Eén regel van een checklist. */
export function CheckRow({ done, title, optional, children, action }: {
  done: boolean; title: string; optional?: boolean; children?: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3 border-t border-border py-2.5 first:border-t-0">
      <Check done={done} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[13px]">
        <span className={done ? "" : "font-semibold"}>
          {title}
          {optional && <span className="ml-1.5 text-[11px] font-normal text-ink-muted">optioneel</span>}
          <span className="sr-only">{done ? " (gedaan)" : " (nog te doen)"}</span>
        </span>
        {children && <span className="text-xs leading-relaxed text-ink-muted">{children}</span>}
      </div>
      {action && <div className="flex-none self-center">{action}</div>}
    </li>
  );
}

/** Wat een stap nu zegt: wat er al is, of wat je moet doen. Kort, voor een checklist. */
export function stepSummary(id: StepId, o: Onboarding): React.ReactNode {
  const st = o.status;
  switch (id) {
    case "garmin":
      return st.garmin.connected
        ? <>Gekoppeld{st.garmin.connected_at ? ` sinds ${day(st.garmin.connected_at)}` : ""}. Je wachtwoord is niet bewaard, alleen de versleutelde sessie.</>
        : <>Log in met je Garmin-account; je wachtwoord gaat alleen naar Garmin.</>;
    case "sync":
      if (st.sync.running && !o.steps.sync) return <>Bezig met de eerste sync. Dat kan een paar minuten duren; deze stap vinkt vanzelf af.</>;
      if (o.steps.sync) {
        const a = st.activities;
        return a.count > 0
          ? <>{plural(a.count, "training", "trainingen")} binnen, van {day(a.first)} tot {day(a.last)}. Laatste sync {st.sync.last_sync ?? "onbekend"}{st.sync.last_failed.length ? ` (mislukt: ${st.sync.last_failed.join(", ")})` : ""}.</>
          : <>Gesynchroniseerd ({st.sync.last_sync}), maar Garmin had geen trainingen van het afgelopen jaar.</>;
      }
      return st.garmin.connected
        ? <>Wacht op de eerste sync. Start hem bij Koppelingen met &ldquo;Nu synchroniseren&rdquo; als hij niet vanzelf begint.</>
        : <>Begint vanzelf zodra Garmin gekoppeld is.</>;
    case "zones": {
      if (o.steps.zones) return <>{T.onboarding.zonesSet(st.zones.set, st.zones.estimated)}</>;
      const sport = (["run", "ride", "swim"] as const).find((s) => st.zones.suggested_max[s]);
      return sport
        ? <>{T.onboarding.maxSuggestion(sport, st.zones.suggested_max[sport] as number)}</>
        : <>Je max hartslag per sport; de site rekent de vijf zones uit.</>;
    }
    case "profile":
      return o.steps.profile ? <>Ingevuld: {st.profile.filled.map(factLabel).join(", ")}.</> : <>Geboortejaar, gewicht, lengte en rusthartslag.</>;
    case "explore": {
      const left = PAGES.filter((p) => p.id !== "dashboard" && !o.visited.includes(p.id));
      return left.length === 0
        ? <>Vandaag, Trends, Rondjes en Historie bekeken.</>
        : <>Nog niet bekeken: {left.map((p, i) => <span key={p.id}>{i > 0 && ", "}<A href={p.href}>{p.label}</A></span>)}.</>;
    }
    case "agent":
      return o.steps.agent
        ? <>{plural(st.agents.tokens, "token", "tokens")} actief. Uitleg per Claude-versie staat bij Agents.</>
        : <>Maak een agent-token en koppel Claude via MCP: in de Claude-app of in Claude Code.</>;
    case "goals":
      return o.steps.goals ? <>Vastgelegd bij Logboek, Doelen.</> : <>Waar je naartoe werkt: een wedstrijd, een tijd, of fit blijven.</>;
    case "plan":
      return o.steps.plan
        ? <>{st.plan.active ? "Een actief schema" : plural(st.plan.count, "schema", "schema's") + ", geen actief"}; Vandaag toont je komende trainingen.</>
        : <>Importeer een schema (CSV of markdown-tabel) of laat Claude er een maken.</>;
  }
}

function factLabel(k: string): string {
  return ({ birth_year: "geboortejaar", weight_kg: "gewicht", height_cm: "lengte", resting_hr: "rusthartslag" } as Record<string, string>)[k] ?? k;
}

/** De langere uitleg per stap, voor de rondleiding en de handleiding: een inleiding en aandachtspunten. */
export function stepExplain(id: StepId, o: Onboarding | null): { intro: React.ReactNode; bullets: React.ReactNode[] } {
  switch (id) {
    case "garmin":
      return {
        intro: "Je trainingen komen van Garmin Connect. Je logt één keer in op de site; daarna haalt de site elke ochtend op wat er nieuw is.",
        bullets: [
          "Instellingen, Koppelingen: je Garmin-e-mail en -wachtwoord",
          "Vraagt Garmin om een code (tweestapsverificatie), dan vul je die daarna in",
          "Je wachtwoord gaat alleen naar Garmin; de site bewaart alleen de versleutelde sessie",
        ],
      };
    case "sync":
      return {
        intro: T.onboarding.firstSync(FIRST_SYNC_DAYS),
        bullets: [
          "De eerste sync begint vanzelf na het koppelen en duurt een paar minuten",
          "Daarna elke ochtend na 6:00, of meteen met “Nu synchroniseren” bij Koppelingen",
          "Laat Garmin de sessie vallen, dan zie je dat bij Koppelingen: koppel dan opnieuw",
        ],
      };
    case "zones": {
      const sug = o ? (["run", "ride", "swim"] as const).filter((s) => o.status.zones.suggested_max[s]) : [];
      return {
        intro: T.onboarding.zonesWhy,
        bullets: [
          ...sug.map((s) => T.onboarding.maxSuggestion(s, o!.status.zones.suggested_max[s] as number)),
          T.onboarding.zonesHow,
          "Instellingen, Zones en profiel: max per sport, en eventueel de percentages per zone",
        ],
      };
    }
    case "profile":
      return { intro: T.onboarding.profileWhy, bullets: ["Instellingen, Zones en profiel, onderaan", "Alles is optioneel en alleen voor jou zichtbaar"] };
    case "explore":
      return {
        intro: "Vier pagina's laten zien wat je trainingen zeggen. Onder veel blokken staat in kleine letters hoe het berekend is.",
        bullets: PAGES.map((p) => <><b>{p.label}</b>: {p.text}</>),
      };
    case "agent":
      return {
        intro: "Met een agent-token praat Claude met je data via MCP: hij leest je trainingen, zones en herstel, en schrijft analyses, schema's en je logboek. Wat Claude schrijft zie je meteen op de site.",
        bullets: [
          "Instellingen, Agents: maak een token, per plek een eigen (Claude-app, laptop)",
          "Claude-app of claude.ai: voeg een eigen connector toe met de URL van die pagina",
          "Claude Code: één commando in de terminal, ook op die pagina",
        ],
      };
    case "goals":
      return {
        intro: "Je doelen in je eigen woorden: een wedstrijd met datum, een tijd, of hoe vaak je wilt trainen. Claude leest ze mee bij elke vraag.",
        bullets: ["Logboek, Doelen: gewone tekst of markdown"],
      };
    case "plan":
      return {
        intro: "Een trainingsschema per dag. De site legt je trainingen ernaast: gedaan, gemist, en of je in de goede zone zat.",
        bullets: ["Schema: importeer een CSV of markdown-tabel, of bewerk het op de site", "Of vraag Claude een schema te maken op basis van je doelen en data"],
      };
  }
}

export function sportsText(sports: string[]): string {
  return sports.map((s) => sportLabel(s).toLowerCase()).join(", ");
}
