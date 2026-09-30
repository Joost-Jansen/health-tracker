"use client";

// Log of analyses: nieuwste eerst, per maand, met zoeken en een formulier voor een nieuwe entry.
// Wie het schreef (joost of agent) staat erbij.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button } from "@/components/ds";
import Markdown from "@/components/log/Markdown";
import { api } from "@/lib/api";

export type Entry = { id: number; kind: "log" | "analysis"; day: string; title: string; body: string; author: string; created_at: string };

const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
const month = (d: string) => new Date(d.slice(0, 7) + "-15T12:00:00").toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

function NewEntry({ kind, onDone }: { kind: Entry["kind"]; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [day, setDay] = useState(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card title={kind === "log" ? "Nieuwe logentry" : "Nieuwe analyse"}>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api.post("/api/entries", { kind, title, body, day });
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Opslaan mislukt");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex flex-wrap gap-2">
          <input type="date" className="ds-input w-[150px]" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Datum" />
          <input className="ds-input min-w-0 flex-1" placeholder="Onderwerp" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <textarea className="ds-input h-40 py-2 text-[13px]" placeholder="Markdown: vraag, belangrijkste data, besluit of advies" value={body} onChange={(e) => setBody(e.target.value)} required />
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={busy || !title.trim() || !body.trim()}>Opslaan</Button>
          <Button size="sm" variant="ghost" onClick={onDone}>Annuleren</Button>
          {error && <span className="text-[12.5px] text-loss">{error}</span>}
        </div>
      </form>
    </Card>
  );
}

export default function Entries({ kind }: { kind: Entry["kind"] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const q = useQuery({ queryKey: ["entries", kind], queryFn: () => api.get<Entry[]>(`/api/entries?kind=${kind}&limit=500`) });

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const items = (q.data ?? []).filter((e) => !needle || e.title.toLowerCase().includes(needle) || e.body.toLowerCase().includes(needle) || e.day.includes(needle));
    const out: { month: string; items: Entry[] }[] = [];
    for (const e of items) {
      const m = e.day.slice(0, 7);
      if (out[out.length - 1]?.month !== m) out.push({ month: m, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [q.data, search]);

  if (q.isLoading) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!q.data) return <p className="text-sm text-ink-muted">Kon {kind === "log" ? "het logboek" : "de analyses"} niet laden.</p>;
  const first = q.data[0]?.id;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className="ds-input h-9 min-w-0 flex-1 text-[13px] sm:max-w-[280px]" placeholder="Zoek in titel en tekst" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="text-[12px] text-ink-muted tabular-nums">{q.data.length} {kind === "log" ? "entries" : "analyses"}</span>
        <span className="flex-1" />
        {!adding && <Button size="sm" onClick={() => setAdding(true)}>+ {kind === "log" ? "Logentry" : "Analyse"}</Button>}
      </div>
      {adding && <NewEntry kind={kind} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["entries", kind] }); }} />}
      {q.data.length === 0 && (
        <p className="text-[13px] text-ink-muted">
          {kind === "log" ? "Nog geen logentries." : "Nog geen analyses. Coachingagents schrijven ze met `tr.py`; je kunt er ook zelf een toevoegen."}
        </p>
      )}
      {groups.map((g) => (
        <section key={g.month} className="flex flex-col gap-3">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{month(g.month)}</h2>
          {g.items.map((e) => {
            const expanded = open[e.id] ?? (e.id === first || !!search);
            return (
              <Card key={e.id}>
                <button type="button" className="flex w-full flex-wrap items-baseline justify-between gap-x-3 text-left" onClick={() => setOpen({ ...open, [e.id]: !expanded })} aria-expanded={expanded}>
                  <span className="text-[14px] font-semibold">{e.title}</span>
                  <span className="text-[12px] text-ink-muted">{fmtDay(e.day)} · {e.author}</span>
                </button>
                {expanded ? <Markdown text={e.body} className="mt-3" /> : <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-muted">{e.body.replace(/[#*|`>-]/g, " ").slice(0, 240)}</p>}
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
}
