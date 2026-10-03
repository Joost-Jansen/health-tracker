"use client";

// Schema: het actieve trainingsplan per week, elke sessie naast wat je echt deed (gedaan, gemist, vandaag,
// gepland), met een voorgesteld rondje. Importeren uit een CSV of markdowntabel, en bewerken op de site.
// Coachingagents schrijven via dezelfde API.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button, Tag } from "@/components/ds";
import { api } from "@/lib/api";
import { type Plan, type PlanSession, type SessionStatus, fmtDate, fmtDuration, fmtKm, sportLabel } from "@/lib/training";

type ActiveResponse = { persistent: boolean; plan: Plan | null };
type ImportResponse = { sessions: PlanSession[]; warnings: string[]; saved: boolean; plan?: Plan };

const EXAMPLE = `| Datum | Sport | Type | Km | Zone | Omschrijving |
|---|---|---|---|---|---|
| 2026-10-06 | lopen | Duurloop | 14 | Z2 | rustig, laatste 2 km iets sneller |
| 2026-10-07 | rust | | | | |
| 2026-10-08 | lopen | Tempo | 10 | Z3-Z4 | 3 × 2 km op HM-tempo |
| 2026-10-09 | zwemmen | Techniek | 2 | Z2 | |`;

const STATUS: Record<SessionStatus, { label: string; colour: string }> = {
  gedaan: { label: "Gedaan", colour: "var(--zone-2)" },
  gemist: { label: "Gemist", colour: "var(--zone-5)" },
  vandaag: { label: "Vandaag", colour: "var(--zone-3)" },
  gepland: { label: "Gepland", colour: "var(--surface-inset)" },
  rust: { label: "Rust", colour: "var(--zone-1)" },
};
const SPORT_OPTIONS = ["run", "ride", "swim", "strength_training", "rest"];
const href = (id: string) => `/historie/activiteit/?id=${encodeURIComponent(id)}`;

function weekOf(day: string) {
  const d = new Date(day + "T12:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function planned(s: PlanSession) {
  const bits = [s.kind, s.distance_km ? fmtKm(s.distance_km) : null, s.duration_min ? `${s.duration_min} min` : null, s.target_zone].filter(Boolean);
  return bits.join(" · ");
}

function Importer({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [race, setRace] = useState("");
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(save: boolean) {
    setError(null);
    try {
      const res = await api.post<ImportResponse>("/api/plans/import", { text, title: title || undefined, goal: goal || undefined, race: race || undefined, preview: !save });
      setPreview(res);
      if (save && res.saved) onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Importeren mislukt");
    }
  }

  return (
    <Card title="Schema importeren" action={onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Annuleren</Button>}>
      <p className="mb-3 text-[12.5px] text-ink-muted">
        Plak een markdowntabel of CSV (komma, puntkomma of tab), of kies een bestand. Kolommen: datum (verplicht), sport, type, km, duur, zone, omschrijving, rondje. Het nieuwe schema wordt het actieve; het vorige gaat naar afgerond.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input className="ds-input" placeholder="Titel, bijv. Opbouw najaar" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="ds-input" placeholder="Doel, bijv. 10 km onder 50 minuten" value={goal} onChange={(e) => setGoal(e.target.value)} />
        <input className="ds-input" placeholder="Wedstrijd en datum" value={race} onChange={(e) => setRace(e.target.value)} />
      </div>
      <textarea className="ds-input mt-3 h-44 w-full py-2 font-mono text-[12px]" placeholder={EXAMPLE} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="ds-btn ds-btn--secondary ds-btn--sm cursor-pointer">
          Bestand kiezen
          <input type="file" accept=".csv,.md,.txt,.tsv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setPreview(null); } }} />
        </label>
        <Button size="sm" variant="ghost" onClick={() => { setText(EXAMPLE); setPreview(null); }}>Voorbeeld invullen</Button>
        <span className="flex-1" />
        <Button size="sm" onClick={() => run(false)} disabled={!text.trim()}>Controleren</Button>
        <Button size="sm" variant="primary" onClick={() => run(true)} disabled={!preview || preview.sessions.length === 0}>Opslaan als actief schema</Button>
      </div>
      {error && <p className="mt-3 text-[12.5px] text-loss">{error}</p>}
      {preview && (
        <div className="mt-4">
          {preview.warnings.map((w) => <p key={w} className="text-[12.5px] text-loss">{w}</p>)}
          <p className="mb-2 text-[12.5px] text-ink-muted">{preview.sessions.length} sessies herkend:</p>
          <SessionTable sessions={preview.sessions} />
        </div>
      )}
    </Card>
  );
}

function SessionTable({ sessions }: { sessions: PlanSession[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] tabular-nums">
        <thead>
          <tr className="text-left text-[11.5px] text-ink-muted">
            <th className="pb-1.5 pr-3 font-normal">Datum</th><th className="pb-1.5 pr-3 font-normal">Sport</th><th className="pb-1.5 pr-3 font-normal">Sessie</th><th className="pb-1.5 font-normal">Omschrijving</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr key={i} className="border-t border-border">
              <td className="whitespace-nowrap py-1.5 pr-3">{fmtDate(s.date)}</td>
              <td className="py-1.5 pr-3">{s.sport === "rest" ? "Rust" : sportLabel(s.sport)}</td>
              <td className="py-1.5 pr-3">{planned(s) || "–"}</td>
              <td className="py-1.5 text-ink-muted">{s.description ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionRow({ s }: { s: PlanSession }) {
  const st = STATUS[s.status ?? "gepland"];
  const zoneOk = s.done?.zone_pct;
  return (
    <li className="grid grid-cols-[84px_1fr] gap-x-3 gap-y-1 border-t border-border py-2.5 text-[13px] first:border-t-0 sm:grid-cols-[96px_1fr_auto]">
      <span className="text-ink-muted">{fmtDate(s.date)}</span>
      <span>
        <span className="font-medium">{s.sport === "rest" ? "Rust" : sportLabel(s.sport)}</span>
        {planned(s) && <span className="text-ink-muted"> · {planned(s)}</span>}
        {s.description && <span className="block text-[12px] text-ink-muted">{s.description}</span>}
        {s.done && (
          <span className="block text-[12px]">
            Gedaan: {fmtKm(s.done.distance_km)} in {fmtDuration(s.done.moving_time_s)} u{s.done.avg_hr ? ` · ${s.done.avg_hr} bpm` : ""}
            {zoneOk != null && s.target_zone && (
              <span className={zoneOk >= 80 ? "text-gain" : zoneOk >= 60 ? "text-ink-muted" : "text-loss"}> · {zoneOk}% volgens zone {s.target_zone}</span>
            )}
            {s.activity_ids?.[0] && <> · <Link className="underline underline-offset-2" href={href(s.activity_ids[0])}>bekijk</Link></>}
          </span>
        )}
        {s.route_suggestion && (
          <span className="block text-[12px] text-ink-muted">
            Rondje: {s.route_suggestion.names.join(" + ")} ({fmtKm(s.route_suggestion.total_km)}{s.route_suggestion.within_tolerance ? "" : ", dichtstbij"}) · <Link className="underline underline-offset-2" href="/rondjes/">rondjes</Link>
          </span>
        )}
      </span>
      <span className="col-start-2 sm:col-start-auto">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px]" style={{ background: `color-mix(in srgb, ${st.colour} 45%, transparent)` }}>
          {st.label}
        </span>
      </span>
    </li>
  );
}

function Editor({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const [rows, setRows] = useState<PlanSession[]>(() => plan.sessions.map(({ date, sport, kind, distance_km, duration_min, target_zone, description, route_id }) => ({ date, sport, kind, distance_km, duration_min, target_zone, description, route_id })));
  const [meta, setMeta] = useState({ title: plan.title, goal: plan.goal ?? "", race: plan.race ?? "", notes: plan.notes ?? "" });
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<PlanSession>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  async function save() {
    setError(null);
    try {
      await api.patch(`/api/plans/${plan.id}`, meta);
      await api.put(`/api/plans/${plan.id}/sessions`, rows.filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date)));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  }

  const cell = "ds-input h-8 px-2 text-[12.5px]";
  return (
    <Card title="Schema bewerken" action={<span className="flex gap-2"><Button size="sm" variant="ghost" onClick={onDone}>Annuleren</Button><Button size="sm" variant="primary" onClick={save}>Opslaan</Button></span>}>
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <input className="ds-input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} aria-label="Titel" />
        <input className="ds-input" placeholder="Doel" value={meta.goal} onChange={(e) => setMeta({ ...meta, goal: e.target.value })} />
        <input className="ds-input" placeholder="Wedstrijd" value={meta.race} onChange={(e) => setMeta({ ...meta, race: e.target.value })} />
        <textarea className="ds-input h-16 py-2 sm:col-span-3" placeholder="Notities bij het schema" value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[12.5px]">
          <thead>
            <tr className="text-left text-[11.5px] text-ink-muted">
              <th className="pb-1.5 font-normal">Datum</th><th className="pb-1.5 font-normal">Sport</th><th className="pb-1.5 font-normal">Type</th><th className="pb-1.5 font-normal">Km</th><th className="pb-1.5 font-normal">Min</th><th className="pb-1.5 font-normal">Zone</th><th className="pb-1.5 font-normal">Omschrijving</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-1 pr-1"><input type="date" className={`${cell} w-[140px]`} value={r.date} onChange={(e) => set(i, { date: e.target.value })} /></td>
                <td className="py-1 pr-1">
                  <select className={`ds-select h-8 px-2 text-[12.5px]`} value={r.sport} onChange={(e) => set(i, { sport: e.target.value })}>
                    {SPORT_OPTIONS.map((s) => <option key={s} value={s}>{s === "rest" ? "Rust" : sportLabel(s)}</option>)}
                  </select>
                </td>
                <td className="py-1 pr-1"><input className={`${cell} w-[120px]`} value={r.kind ?? ""} onChange={(e) => set(i, { kind: e.target.value || null })} /></td>
                <td className="py-1 pr-1"><input inputMode="decimal" className={`${cell} w-[64px]`} value={r.distance_km ?? ""} onChange={(e) => set(i, { distance_km: num(e.target.value) })} /></td>
                <td className="py-1 pr-1"><input inputMode="numeric" className={`${cell} w-[60px]`} value={r.duration_min ?? ""} onChange={(e) => set(i, { duration_min: num(e.target.value) })} /></td>
                <td className="py-1 pr-1"><input className={`${cell} w-[72px]`} placeholder="Z2" value={r.target_zone ?? ""} onChange={(e) => set(i, { target_zone: e.target.value || null })} /></td>
                <td className="py-1 pr-1"><input className={`${cell} w-full min-w-[160px]`} value={r.description ?? ""} onChange={(e) => set(i, { description: e.target.value || null })} /></td>
                <td className="py-1"><Button size="sm" variant="ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Verwijderen">×</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => {
          const last = rows[rows.length - 1]?.date;
          const d = last ? new Date(last + "T12:00:00") : new Date();
          if (last) d.setDate(d.getDate() + 1);
          setRows([...rows, { date: d.toISOString().slice(0, 10), sport: "run" }]);
        }}>+ Sessie</Button>
      </div>
      {error && <p className="mt-3 text-[12.5px] text-loss">{error}</p>}
    </Card>
  );
}

export default function PlanPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit" | "import">("view");
  const [showPast, setShowPast] = useState(false);
  const q = useQuery({ queryKey: ["plan-active"], queryFn: () => api.get<ActiveResponse>("/api/plans/active") });
  const finish = useMutation({
    mutationFn: (id: number) => api.patch(`/api/plans/${id}`, { status: "afgerond" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan-active"] }),
  });
  const refresh = () => {
    setMode("view");
    qc.invalidateQueries({ queryKey: ["plan-active"] });
  };

  const plan = q.data?.plan;
  const today = new Date().toISOString().slice(0, 10);
  const weeks = useMemo(() => {
    if (!plan) return [];
    const groups = new Map<string, PlanSession[]>();
    plan.sessions.forEach((s) => {
      const w = weekOf(s.date);
      groups.set(w, [...(groups.get(w) ?? []), s]);
    });
    return [...groups.entries()].map(([week, sessions]) => ({ week, sessions, summary: plan.weeks.find((w) => w.week === week) }));
  }, [plan]);

  if (q.isLoading) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!q.data) return <p className="text-sm text-ink-muted">Kon het schema niet laden.</p>;

  const warn = !q.data.persistent && (
    <p className="rounded border border-border bg-[var(--surface-sunken)] px-3 py-2 text-[12.5px] text-ink-muted">
      Let op: de database is nog niet gekoppeld (DATABASE_URL). Schema's worden tijdelijk opgeslagen en verdwijnen bij een nieuwe deploy.
    </p>
  );

  if (!plan || mode === "import") {
    return (
      <div className="flex flex-col gap-4">
        {warn}
        {!plan && <p className="text-[13px] text-ink-muted">Nog geen actief schema. Importeer er een, of laat een coachingagent er een maken (die schrijft via dezelfde API).</p>}
        <Importer onDone={refresh} onCancel={plan ? () => setMode("view") : undefined} />
      </div>
    );
  }
  if (mode === "edit") return <Editor plan={plan} onDone={refresh} />;

  const current = weekOf(today);
  const shown = showPast ? weeks : weeks.filter((w) => w.week >= current);
  const past = weeks.filter((w) => w.week < current);
  const done = plan.sessions.filter((s) => s.status === "gedaan").length;
  const due = plan.sessions.filter((s) => s.status === "gedaan" || s.status === "gemist").length;
  const totalKm = plan.weeks.reduce((s, w) => s + w.planned_km, 0);

  return (
    <div className="flex flex-col gap-4">
      {warn}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[27px] font-light leading-tight">{plan.title}</h1>
            <p className="text-[12.5px] text-ink-muted">
              {[plan.goal, plan.race].filter(Boolean).join(" · ") || "Geen doel ingevuld"} · {weeks.length} weken · {fmtKm(totalKm)} gepland · gemaakt door {plan.author}
            </p>
            {plan.notes && <p className="mt-2 max-w-prose whitespace-pre-line text-[13px]">{plan.notes}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setMode("edit")}>Bewerken</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("import")}>Nieuw schema</Button>
            <Button size="sm" variant="ghost" onClick={() => confirm("Schema afronden?") && finish.mutate(plan.id)}>Afronden</Button>
          </div>
        </div>
        {due > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[12px] text-ink-muted"><span>Uitgevoerd tot nu</span><span className="tabular-nums">{done} van {due} sessies ({Math.round((done / due) * 100)}%)</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-inset)]"><div className="h-full" style={{ width: `${(done / due) * 100}%`, background: "var(--zone-2)" }} /></div>
          </div>
        )}
      </Card>

      {past.length > 0 && (
        <button type="button" className="self-start text-[12.5px] text-ink-muted underline underline-offset-2" onClick={() => setShowPast(!showPast)}>
          {showPast ? "Verberg afgelopen weken" : `Toon ${past.length} afgelopen ${past.length === 1 ? "week" : "weken"}`}
        </button>
      )}
      {shown.map(({ week, sessions, summary }) => (
        <Card
          key={week}
          title={`${week === current ? "Deze week" : "Week"} van ${fmtDate(week)}`}
          action={summary && <span className="text-[12px] tabular-nums text-ink-muted">{summary.done_km > 0 ? `${fmtKm(summary.done_km)} van ` : ""}{fmtKm(summary.planned_km)}{summary.missed ? ` · ${summary.missed} gemist` : ""}</span>}
        >
          <ul className="flex flex-col">{sessions.map((s, i) => <SessionRow key={`${s.date}-${i}`} s={s} />)}</ul>
        </Card>
      ))}
      {shown.length === 0 && <p className="text-[13px] text-ink-muted">Alle weken van dit schema liggen achter je. <Tag>klaar</Tag></p>}
    </div>
  );
}
