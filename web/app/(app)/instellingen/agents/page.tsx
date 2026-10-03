"use client";

// Instellingen: toegang voor coachingagents. Een token maak je hier; daarmee praat Claude met je data
// (MCP-connector in de Claude-app, Claude Code, of tools/tr.py). Alleen de hash wordt bewaard.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button } from "@/components/ds";
import { api } from "@/lib/api";

type TokenRow = { id: string; name: string; created_at: string };
type NewToken = TokenRow & { token: string };

function Copy({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] text-ink-muted">{label}</span>
      <div className="flex items-start gap-2">
        <code className={`min-w-0 flex-1 whitespace-pre-wrap break-all rounded bg-[var(--surface-sunken)] px-2 py-1.5 font-mono text-[12px] ${secret ? "select-all" : ""}`}>{value}</code>
        <Button
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }}
        >
          {done ? "Gekopieerd" : "Kopieer"}
        </Button>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agent-tokens"], queryFn: () => api.get<TokenRow[]>("/api/agent-tokens") });
  const [name, setName] = useState("Claude");
  const [made, setMade] = useState<NewToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function create() {
    setError(null);
    try {
      setMade(await api.post<NewToken>("/api/agent-tokens", { name }));
      qc.invalidateQueries({ queryKey: ["agent-tokens"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mislukt");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Toegang voor Claude (agents)">
        <p className="max-w-prose text-[13px] leading-relaxed text-ink-muted">
          Met een agent-token kan Claude je trainingsdata lezen en je schema, logboek en doelen bijwerken; je ziet het meteen hier op de site.
          Maak per plek een eigen token (bijvoorbeeld "Claude-app" en "Laptop"), dan kun je er één intrekken zonder de rest.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="ds-input w-56" value={name} onChange={(e) => setName(e.target.value)} aria-label="Naam van het token" />
          <Button variant="primary" size="sm" onClick={create} disabled={!name.trim()}>Nieuw token</Button>
          {error && <span className="text-[12.5px] text-loss">{error}</span>}
        </div>
      </Card>

      {made && (
        <Card title={`Token "${made.name}" (alleen nu zichtbaar)`} action={<Button size="sm" variant="ghost" onClick={() => setMade(null)}>Klaar</Button>}>
          <div className="flex flex-col gap-4">
            <Copy label="Token" value={made.token} secret />
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold">Claude-app of claude.ai</h3>
              <p className="mb-2 text-[12.5px] text-ink-muted">Instellingen, Connectors, "Add custom connector". Naam: Training. URL (bevat het token, behandel hem als wachtwoord):</p>
              <Copy label="Connector-URL" value={`${origin}/api/mcp/${made.token}`} secret />
            </div>
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold">Claude Code (laptop)</h3>
              <Copy label="Eén keer uitvoeren in een terminal" value={`claude mcp add --transport http --scope user training ${origin}/api/mcp --header "Authorization: Bearer ${made.token}"`} secret />
            </div>
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold">Claude Code in de cloud of tools/tr.py</h3>
              <p className="mb-2 text-[12.5px] text-ink-muted">
                Zet deze twee als variabelen in de omgeving (cloud: omgeving bewerken, Environment variables) en sta netwerktoegang tot{" "}
                <code className="font-mono text-[12px]">{origin.replace(/^https?:\/\//, "")}</code> toe.
              </p>
              <Copy label="Variabelen" value={`TRAINING_API_URL=${origin}\nTRAINING_API_TOKEN=${made.token}`} secret />
            </div>
          </div>
        </Card>
      )}

      <Card title="Actieve tokens">
        {q.isLoading ? (
          <p className="text-sm text-ink-muted">Laden…</p>
        ) : !q.data?.length ? (
          <p className="text-[13px] text-ink-muted">Nog geen tokens op de site gemaakt. (Een token uit tools/set_agent_token.py werkt ook en staat hier niet.)</p>
        ) : (
          <ul className="flex flex-col">
            {q.data.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-[13px] first:border-t-0">
                <span>
                  <span className="font-medium">{t.name}</span>
                  <span className="text-ink-muted"> · gemaakt {new Date(t.created_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}</span>
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (!confirm(`Token "${t.name}" intrekken? Wat ermee gekoppeld is, werkt daarna niet meer.`)) return;
                    await api.del(`/api/agent-tokens/${t.id}`);
                    qc.invalidateQueries({ queryKey: ["agent-tokens"] });
                  }}
                >
                  Intrekken
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
