"use client";

// Doelen of profiel: lezen als opgemaakte tekst, bewerken als markdown. Agents lezen en schrijven hetzelfde
// document via de API, dus wat je hier vastlegt is wat de coach de volgende sessie ziet.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button } from "@/components/ds";
import Markdown from "@/components/log/Markdown";
import { api, ApiError } from "@/lib/api";

type Doc = { key: string; body: string; updated_at: string | null; updated_by: string | null };

export default function DocEditor({ docKey, title }: { docKey: "profile" | "goals"; title: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["doc", docKey],
    queryFn: () =>
      api.get<Doc>(`/api/docs/${docKey}`).catch((e) => {
        if (e instanceof ApiError && e.status === 404) return { key: docKey, body: "", updated_at: null, updated_by: null };
        throw e;
      }),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (q.isLoading) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!q.data) return <p className="text-sm text-ink-muted">Kon {title.toLowerCase()} niet laden.</p>;
  const doc = q.data;
  const stamp = doc.updated_at
    ? `Bijgewerkt ${new Date(doc.updated_at).toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} door ${doc.updated_by}`
    : "";

  if (draft !== null) {
    return (
      <Card
        title={`${title} bewerken`}
        action={
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Annuleren</Button>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                try {
                  await api.put(`/api/docs/${docKey}`, { body: draft });
                  setDraft(null);
                  qc.invalidateQueries({ queryKey: ["doc", docKey] });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Opslaan mislukt");
                }
              }}
            >
              Opslaan
            </Button>
          </span>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <textarea className="ds-input h-[60vh] py-2 font-mono text-[12.5px]" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Markdown" />
          <div className="hidden max-h-[60vh] overflow-y-auto rounded border border-border p-3 lg:block">
            <Markdown text={draft} />
          </div>
        </div>
        {error && <p className="mt-2 text-[12.5px] text-loss">{error}</p>}
      </Card>
    );
  }

  return (
    <Card action={<span className="flex items-center gap-3"><span className="text-[11.5px] text-ink-muted">{stamp}</span><Button size="sm" onClick={() => setDraft(doc.body)}>Bewerken</Button></span>}>
      {doc.body ? <Markdown text={doc.body} /> : <p className="text-[13px] text-ink-muted">Nog leeg.</p>}
    </Card>
  );
}
