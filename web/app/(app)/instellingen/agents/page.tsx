"use client";

// Instellingen: toegang voor coachingagents. Een token maak je hier; daarmee praat Claude met je data
// (MCP-connector in de Claude-app, Claude Code, of tools/tr.py). Alleen de hash wordt bewaard.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button } from "@/components/ds";
import { api } from "@/lib/api";
import { errorText, useFormat, useT } from "@/lib/i18n";
import { rich } from "@/lib/i18n/rich";

type TokenRow = { id: string; name: string; created_at: string };
type NewToken = TokenRow & { token: string };

function Copy({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const t = useT();
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
          {done ? t.common.copied : t.common.copy}
        </Button>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const t = useT();
  const f = useFormat();
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
      setError(errorText(e, t, t.common.failed));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title={t.agents.title}>
        <p className="max-w-prose text-[13px] leading-relaxed text-ink-muted">
          {t.agents.intro1} {t.agents.intro2}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="ds-input w-56" value={name} onChange={(e) => setName(e.target.value)} aria-label={t.agents.tokenName} />
          <Button variant="primary" size="sm" onClick={create} disabled={!name.trim()}>{t.agents.newToken}</Button>
          {error && <span className="text-[12.5px] text-loss">{error}</span>}
        </div>
      </Card>

      {made && (
        <Card title={t.agents.madeTitle(made.name)} action={<Button size="sm" variant="ghost" onClick={() => setMade(null)}>{t.common.done}</Button>}>
          <div className="flex flex-col gap-4">
            <Copy label={t.agents.token} value={made.token} secret />
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold">{t.agents.appTitle}</h3>
              <p className="mb-2 text-[12.5px] text-ink-muted">
                {rich(t.agents.appText, {
                  link: (c) => <a className="underline" href="https://claude.ai/customize/connectors" target="_blank" rel="noreferrer">{c}</a>,
                })}
              </p>
              <Copy label={t.agents.connectorUrl} value={`${origin}/api/mcp/${made.token}`} secret />
            </div>
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold">{t.agents.codeTitle}</h3>
              <Copy label={t.agents.runOnce} value={`claude mcp add --transport http --scope user health-tracker ${origin}/api/mcp --header "Authorization: Bearer ${made.token}"`} secret />
            </div>
            <div>
              <h3 className="mb-1.5 text-[13px] font-semibold">{t.agents.cliTitle}</h3>
              <p className="mb-2 text-[12.5px] text-ink-muted">
                {rich(t.agents.cliText, { code: () => <code className="font-mono text-[12px]">{origin.replace(/^https?:\/\//, "")}</code> })}
              </p>
              <Copy label={t.agents.variables} value={`TRAINING_API_URL=${origin}\nTRAINING_API_TOKEN=${made.token}`} secret />
            </div>
          </div>
        </Card>
      )}

      <Card title={t.agents.active}>
        {q.isLoading ? (
          <p className="text-sm text-ink-muted">{t.common.loading}</p>
        ) : !q.data?.length ? (
          <p className="text-[13px] text-ink-muted">{t.agents.none}</p>
        ) : (
          <ul className="flex flex-col">
            {q.data.map((tok) => (
              <li key={tok.id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-[13px] first:border-t-0">
                <span>
                  <span className="font-medium">{tok.name}</span>
                  <span className="text-ink-muted"> · {t.agents.created(f.day(tok.created_at))}</span>
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    if (!confirm(t.agents.revokeConfirm(tok.name))) return;
                    await api.del(`/api/agent-tokens/${tok.id}`);
                    qc.invalidateQueries({ queryKey: ["agent-tokens"] });
                  }}
                >
                  {t.common.revoke}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
