"use client";

// Help, Claude als coach: wat Claude met je data kan, hoe je hem koppelt (MCP of tools/tr.py) en wat je moet weten
// over het token. De knoppen en commando's zelf staan bij Instellingen, Agents.

import Card from "@/components/Card";
import { ButtonLink } from "@/components/ds";
import { A, Check, stepExplain } from "@/components/onboarding/steps";
import { useOnboarding } from "@/lib/onboarding";

export default function HelpClaude() {
  const o = useOnboarding().data ?? null;
  const ex = stepExplain("agent", o);
  const tokens = o?.status.agents.tokens ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Claude als coach" action={<ButtonLink href="/instellingen/agents/" size="sm" variant={tokens ? "secondary" : "primary"}>Naar Agents</ButtonLink>}>
        <div className="flex max-w-[46rem] flex-col gap-3 text-[13.5px] leading-relaxed">
          <p>{ex.intro}</p>
          {o && (
            <p className="flex items-center gap-2 text-[13px]">
              <Check done={tokens > 0} size={18} />
              {tokens > 0 ? `${tokens} ${tokens === 1 ? "token" : "tokens"} actief.` : "Nog geen token gemaakt."}
            </p>
          )}
        </div>
      </Card>

      <Card title="Koppelen">
        <ol className="flex max-w-[46rem] list-decimal flex-col gap-2 pl-5 text-[13.5px] leading-relaxed">
          <li>Maak bij <A href="/instellingen/agents/">Instellingen, Agents</A> een token. Je ziet het één keer; de site bewaart alleen een hash.</li>
          <li><b>Claude-app of claude.ai</b>: Instellingen, Connectors, &ldquo;Add custom connector&rdquo;, met de connector-URL van die pagina.</li>
          <li><b>Claude Code</b>: voer het <code className="font-mono text-[12px]">claude mcp add</code>-commando van die pagina één keer uit in een terminal.</li>
          <li>Vraag Claude daarna bijvoorbeeld hoe je week ging, of om een schema naar je doel toe.</li>
        </ol>
      </Card>

      <Card title="Goed om te weten">
        <ul className="flex max-w-[46rem] list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-relaxed">
          <li>Een token geeft toegang tot al je trainings- en herstelgegevens. Behandel het (en de connector-URL) als een wachtwoord.</li>
          <li>Maak per plek een eigen token; zo trek je er één in zonder de rest.</li>
          <li>Wat Claude schrijft staat bij <A href="/log/">Logboek</A> en <A href="/plan/">Schema</A>, met &ldquo;agent&rdquo; als auteur.</li>
          <li>Garmin koppelen en tokens maken kan alleen ingelogd op de site, niet via Claude.</li>
        </ul>
      </Card>
    </div>
  );
}
