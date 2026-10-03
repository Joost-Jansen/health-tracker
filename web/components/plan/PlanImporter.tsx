"use client";

// "Plakken uit tabel": een schema uit een markdowntabel of CSV (zoals een agent of spreadsheet hem maakt). De
// tweede route naast de editor; eerst controleren, dan opslaan als actief schema.

import { useState } from "react";
import { Button, Tag } from "@/components/ds";
import { api } from "@/lib/api";
import type { Plan, PlanSession } from "@/lib/training";
import { capitalise, fmtDayMonth, fmtNum, fmtWeekday, sportName } from "./plan";
import { SportBadge } from "./SportIcon";
import ZoneChip from "./ZoneChip";

type ImportResponse = { sessions: PlanSession[]; warnings: string[]; saved: boolean; plan?: Plan };

const EXAMPLE = `| Datum | Sport | Type | Km | Zone | Omschrijving |
|---|---|---|---|---|---|
| 2026-10-06 | lopen | Duurloop | 14 | Z2 | rustig, laatste 2 km iets sneller |
| 2026-10-07 | rust | | | | |
| 2026-10-08 | lopen | Tempo | 10 | Z3-Z4 | 3 × 2 km op HM-tempo |
| 2026-10-09 | zwemmen | Techniek | 2 | Z2 | |`;

export default function PlanImporter({ onDone, onCancel, onEditor }: { onDone: () => void; onCancel?: () => void; onEditor?: () => void }) {
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">Nieuw schema</span>
          <h1 className="mt-1 font-display text-[28px] font-light leading-tight">Plakken uit tabel</h1>
          <p className="mt-1 max-w-prose text-[12.5px] text-ink-muted">
            Plak een markdowntabel of CSV (komma, puntkomma of tab), of kies een bestand. Kolommen: datum (verplicht), sport, type, km, duur, zone, omschrijving, rondje. Het nieuwe schema wordt het actieve; het vorige gaat naar afgerond.
          </p>
        </div>
        <div className="flex gap-2">
          {onEditor && <Button size="sm" onClick={onEditor}>Zelf invullen</Button>}
          {onCancel && <Button size="sm" variant="ghost" onClick={onCancel}>Annuleren</Button>}
        </div>
      </div>
      <section className="rounded border border-border bg-surface p-4 sm:p-[18px]">
        <div className="grid gap-3 sm:grid-cols-3">
          <input className="ds-input" placeholder="Titel, bijv. Opbouw najaar" aria-label="Titel" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="ds-input" placeholder="Doel, bijv. 10 km onder 50 minuten" aria-label="Doel" value={goal} onChange={(e) => setGoal(e.target.value)} />
          <input className="ds-input" placeholder="Wedstrijd en datum" aria-label="Wedstrijd" value={race} onChange={(e) => setRace(e.target.value)} />
        </div>
        <textarea className="ds-input mt-3 h-44 w-full py-2 font-mono text-[12px]" aria-label="Tabel" placeholder={EXAMPLE} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} />
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
          <div className="mt-4 border-t border-border pt-3">
            {preview.warnings.map((w) => <p key={w} className="text-[12.5px] text-loss">{w}</p>)}
            <p className="mb-2 text-[12.5px] text-ink-muted">{preview.sessions.length} sessies herkend:</p>
            <ul className="flex flex-col">
              {preview.sessions.map((s, i) => (
                <li key={i} className="flex items-center gap-3 border-t border-[var(--border-subtle)] py-2 text-[13px] first:border-t-0">
                  <span className="w-[72px] flex-none text-[12px] text-ink-muted">{fmtWeekday(s.date)} {fmtDayMonth(s.date)}</span>
                  <SportBadge sport={s.sport} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{s.kind ? capitalise(s.kind) : sportName(s.sport)}</span>
                    {s.distance_km ? <span className="tabular-nums"> · {fmtNum(s.distance_km)} km</span> : s.duration_min ? <span className="tabular-nums"> · {s.duration_min} min</span> : null}
                    {s.description && <span className="block truncate text-[12px] text-ink-muted">{s.description}</span>}
                  </span>
                  <ZoneChip zone={s.target_zone} />
                  {s.route_id && <Tag>{s.route_id}</Tag>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
