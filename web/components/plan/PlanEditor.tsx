"use client";

// Schema-editor (T24): een nieuw schema maken of het actieve aanpassen met een formulier in plaats van een tabel
// plakken. Sessies per week gegroepeerd en altijd op datum; per sessie datum, sport, soort, km of minuten,
// doelzone, een eigen rondje en een omschrijving. Opslaan via POST /api/plans of PATCH + PUT .../sessions.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Markdown from "@/components/log/Markdown";
import { Button, IconButton } from "@/components/ds";
import { CloseIcon } from "@/components/icons";
import { api } from "@/lib/api";
import type { Plan, PlanSession, RouteSummary } from "@/lib/training";
import {
  KIND_SUGGESTIONS,
  PLAN_SPORTS,
  ZONE_OPTIONS,
  addDays,
  fmtNum,
  fmtWeekRange,
  isValidIso,
  joinRace,
  sportColour,
  sportName,
  splitRace,
  todayIso,
  weekOf,
} from "./plan";
import { SportGlyph } from "./SportIcon";

type Row = {
  key: number;
  date: string;
  sport: string;
  kind: string;
  km: string;
  min: string;
  zone: string;
  route_id: string;
  description: string;
};
type Meta = { title: string; goal: string; raceName: string; raceDate: string; notes: string };
type Errors = { meta: Partial<Record<keyof Meta, string>>; rows: Record<number, Partial<Record<"date" | "km" | "min", string>>> };

const parseNum = (v: string) => (v.trim() === "" ? null : Number(v.trim().replace(",", ".")));
const showNum = (n?: number | null) => (n == null ? "" : String(n).replace(".", ","));
const hasAmount = (sport: string) => sport !== "rest";
const hasRoute = (sport: string) => sport === "run" || sport === "ride";

function validate(meta: Meta, rows: Row[]): Errors {
  const e: Errors = { meta: {}, rows: {} };
  if (!meta.title.trim()) e.meta.title = "Geef het schema een titel.";
  if (meta.raceDate && !isValidIso(meta.raceDate)) e.meta.raceDate = "Ongeldige datum.";
  for (const r of rows) {
    const re: Errors["rows"][number] = {};
    if (!isValidIso(r.date)) re.date = "Kies een datum.";
    if (hasAmount(r.sport)) {
      const km = parseNum(r.km);
      const min = parseNum(r.min);
      if (km != null && (Number.isNaN(km) || km < 0 || km > 400)) re.km = "0 tot 400 km";
      if (min != null && (Number.isNaN(min) || min < 0 || min > 1440 || !Number.isInteger(min))) re.min = "Hele minuten";
    }
    if (Object.keys(re).length) e.rows[r.key] = re;
  }
  return e;
}

const errorCount = (e: Errors) => Object.keys(e.meta).length + Object.keys(e.rows).length;

function toPayload(r: Row): Omit<PlanSession, "status"> {
  const rest = r.sport === "rest";
  return {
    date: r.date,
    sport: r.sport,
    kind: r.kind.trim() || null,
    distance_km: rest ? null : parseNum(r.km),
    duration_min: rest ? null : parseNum(r.min),
    target_zone: rest ? null : r.zone || null,
    description: r.description.trim() || null,
    route_id: hasRoute(r.sport) ? r.route_id || null : null,
  };
}

const byDate = (a: Row, b: Row) => a.date.localeCompare(b.date) || a.key - b.key;

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)] sm:sr-only">
      {children}
    </label>
  );
}

function RowEditor({
  row,
  errors,
  routes,
  onChange,
  onDuplicate,
  onDelete,
}: {
  row: Row;
  errors?: Errors["rows"][number];
  routes: RouteSummary[];
  onChange: (patch: Partial<Row>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const id = (f: string) => `r${row.key}-${f}`;
  const cell = "ds-input h-9 px-2.5 text-[13px]";
  const sel = "ds-select h-9 pl-2.5 text-[13px]";
  const rest = row.sport === "rest";
  const own = routes.filter((r) => r.sport === row.sport);
  return (
    <li
      className="grid grid-cols-6 gap-x-2 gap-y-2.5 rounded-md border border-border bg-surface p-3 pl-3.5 sm:grid-cols-[138px_132px_minmax(100px,1fr)_72px_72px_96px_minmax(130px,1.2fr)_64px] sm:gap-y-1.5 sm:border-0 sm:border-t sm:bg-transparent sm:p-0 sm:py-2.5 sm:pl-3"
      style={{ boxShadow: `inset 3px 0 0 ${sportColour(row.sport)}` }}
    >
      <div className="col-span-3 sm:col-span-1">
        <Label htmlFor={id("date")}>Datum</Label>
        <input id={id("date")} type="date" className={cell} value={row.date} aria-invalid={!!errors?.date || undefined} onChange={(e) => onChange({ date: e.target.value })} />
        {errors?.date && <span className="mt-0.5 block text-[11px] text-loss">{errors.date}</span>}
      </div>
      <div className="col-span-3 sm:col-span-1">
        <Label htmlFor={id("sport")}>Sport</Label>
        <select id={id("sport")} className={sel} value={row.sport} onChange={(e) => onChange({ sport: e.target.value, ...(e.target.value === "rest" ? { kind: row.kind || "rust" } : {}) })}>
          {PLAN_SPORTS.map((s) => <option key={s} value={s}>{sportName(s)}</option>)}
          {!PLAN_SPORTS.includes(row.sport as (typeof PLAN_SPORTS)[number]) && <option value={row.sport}>{sportName(row.sport)}</option>}
        </select>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <Label htmlFor={id("kind")}>Soort</Label>
        <input id={id("kind")} className={cell} list={`kinds-${row.sport}`} placeholder={rest ? "rust" : "bijv. duurloop"} value={row.kind} onChange={(e) => onChange({ kind: e.target.value })} />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <Label htmlFor={id("km")}>Km</Label>
        <input id={id("km")} inputMode="decimal" className={`${cell} tabular-nums`} placeholder="km" disabled={rest} value={rest ? "" : row.km} aria-invalid={!!errors?.km || undefined} onChange={(e) => onChange({ km: e.target.value })} />
        {errors?.km && <span className="mt-0.5 block text-[11px] text-loss">{errors.km}</span>}
      </div>
      <div className="col-span-2 sm:col-span-1">
        <Label htmlFor={id("min")}>Minuten</Label>
        <input id={id("min")} inputMode="numeric" className={`${cell} tabular-nums`} placeholder="min" disabled={rest} value={rest ? "" : row.min} aria-invalid={!!errors?.min || undefined} onChange={(e) => onChange({ min: e.target.value })} />
        {errors?.min && <span className="mt-0.5 block text-[11px] text-loss">{errors.min}</span>}
      </div>
      <div className={`${rest ? "hidden sm:block" : hasRoute(row.sport) ? "col-span-2" : "col-span-6"} sm:col-span-1`}>
        <Label htmlFor={id("zone")}>Zone</Label>
        <select id={id("zone")} className={sel} disabled={rest} value={rest ? "" : row.zone} onChange={(e) => onChange({ zone: e.target.value })}>
          <option value="">Zone</option>
          {ZONE_OPTIONS.map((z) => <option key={z} value={z}>{z.replace("-Z", "–")}</option>)}
          {row.zone && !ZONE_OPTIONS.includes(row.zone) && <option value={row.zone}>{row.zone}</option>}
        </select>
      </div>
      <div className={`${hasRoute(row.sport) ? "col-span-4" : "hidden sm:block"} sm:col-span-1`}>
        <Label htmlFor={id("route")}>Rondje</Label>
        <select id={id("route")} className={sel} disabled={!hasRoute(row.sport) || own.length === 0} value={hasRoute(row.sport) ? row.route_id : ""} onChange={(e) => onChange({ route_id: e.target.value })}>
          <option value="">{hasRoute(row.sport) ? (own.length ? "Automatisch voorstel" : "Geen rondjes") : "Geen rondje"}</option>
          {own.map((r) => <option key={r.id} value={r.id}>{r.name || r.id} · {fmtNum(r.distance_km)} km</option>)}
          {row.route_id && hasRoute(row.sport) && !own.some((r) => r.id === row.route_id) && <option value={row.route_id}>{row.route_id}</option>}
        </select>
      </div>
      <div className="order-last col-span-6 flex items-center justify-end gap-0.5 sm:order-none sm:col-span-1 sm:row-span-2 sm:flex-col sm:items-end sm:justify-start">
        <IconButton size="sm" label="Dupliceren" onClick={onDuplicate} icon={<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></svg>} />
        <IconButton size="sm" label="Verwijderen" onClick={onDelete} icon={<CloseIcon width={15} height={15} />} />
      </div>
      <div className="col-span-6 sm:col-span-7">
        <Label htmlFor={id("desc")}>Omschrijving</Label>
        <input id={id("desc")} className={`${cell} w-full bg-[var(--surface-sunken)]`} placeholder="Omschrijving, bijv. 2 km inlopen, 6 km op tempo, 2 km uitlopen" value={row.description} onChange={(e) => onChange({ description: e.target.value })} />
      </div>
    </li>
  );
}

export default function PlanEditor({
  plan,
  onSaved,
  onCancel,
  onPaste,
}: {
  /** Leeg = nieuw schema. */
  plan?: Plan | null;
  onSaved: () => void;
  onCancel?: () => void;
  /** Naar "plakken uit tabel" (alleen bij een nieuw schema). */
  onPaste?: () => void;
}) {
  const next = useRef(1);
  const mk = (s: Partial<PlanSession>): Row => ({
    key: next.current++,
    date: s.date ?? todayIso(),
    sport: s.sport ?? "run",
    kind: s.kind ?? "",
    km: showNum(s.distance_km),
    min: showNum(s.duration_min),
    zone: s.target_zone ?? "",
    route_id: s.route_id ?? "",
    description: s.description ?? "",
  });
  const race = splitRace(plan?.race);
  const [meta, setMeta] = useState<Meta>(() => ({ title: plan?.title ?? "", goal: plan?.goal ?? "", raceName: race.name, raceDate: race.date ?? "", notes: plan?.notes ?? "" }));
  const [rows, setRows] = useState<Row[]>(() => (plan?.sessions ?? []).map(mk));
  const initial = useRef(JSON.stringify({ meta, rows: rows.map(({ key, ...r }) => r) }));
  const [preview, setPreview] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useQuery({ queryKey: ["routes", "run"], queryFn: () => api.get<RouteSummary[]>("/api/routes?sport=run") });
  const ride = useQuery({ queryKey: ["routes", "ride"], queryFn: () => api.get<RouteSummary[]>("/api/routes?sport=ride") });
  const routes = useMemo(() => [...(run.data ?? []), ...(ride.data ?? [])], [run.data, ride.data]);

  const dirty = JSON.stringify({ meta, rows: rows.map(({ key, ...r }) => r) }) !== initial.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const errors = validate(meta, rows);
  // Getallen meteen controleren, ontbrekende titel of datum pas na de eerste keer opslaan.
  const shown: Errors = tried ? errors : { meta: {}, rows: Object.fromEntries(Object.entries(errors.rows).map(([k, v]) => [k, { km: v.km, min: v.min }])) };

  const sorted = [...rows].sort(byDate);
  const weeks = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of sorted) {
      const w = isValidIso(r.date) ? weekOf(r.date) : "";
      m.set(w, [...(m.get(w) ?? []), r]);
    }
    return [...m.entries()];
  }, [sorted]);

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const remove = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const duplicate = (key: number) => setRows((rs) => {
    const i = rs.findIndex((r) => r.key === key);
    return [...rs.slice(0, i + 1), { ...rs[i], key: next.current++ }, ...rs.slice(i + 1)];
  });
  const addInWeek = (monday: string) => {
    const taken = new Set(rows.map((r) => r.date));
    const free = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).find((d) => !taken.has(d) && d >= (monday <= todayIso() ? todayIso() : monday));
    setRows((rs) => [...rs, mk({ date: free ?? monday, sport: "run" })]);
  };
  const lastDate = sorted.filter((r) => isValidIso(r.date)).at(-1)?.date;
  const addSession = () => setRows((rs) => [...rs, mk({ date: lastDate ? addDays(lastDate, 1) : todayIso(), sport: "run" })]);
  const addWeek = () => {
    if (!lastDate) {
      const monday = addDays(weekOf(todayIso()), 7);
      setRows((rs) => [...rs, mk({ date: monday, sport: "run" })]);
      return;
    }
    const lastWeek = weekOf(lastDate);
    const copy = sorted.filter((r) => isValidIso(r.date) && weekOf(r.date) === lastWeek);
    setRows((rs) => [...rs, ...copy.map((r) => ({ ...r, key: next.current++, date: addDays(r.date, 7) }))]);
  };

  async function save() {
    setTried(true);
    setError(null);
    if (errorCount(errors)) return;
    const body = {
      title: meta.title.trim(),
      goal: meta.goal.trim(),
      race: joinRace(meta.raceName, meta.raceDate),
      notes: meta.notes.trim(),
    };
    const sessions = sorted.map(toPayload);
    setSaving(true);
    try {
      if (plan) {
        await api.patch(`/api/plans/${plan.id}`, body);
        await api.put(`/api/plans/${plan.id}/sessions`, sessions);
      } else {
        await api.post("/api/plans", { ...body, goal: body.goal || null, race: body.race || null, notes: body.notes || null, sessions });
      }
      initial.current = JSON.stringify({ meta, rows: rows.map(({ key, ...r }) => r) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  const cancel = () => {
    if (!dirty || confirm("Wijzigingen weggooien?")) onCancel?.();
  };

  const totals = useMemo(() => {
    const km: Record<string, number> = {};
    for (const r of rows) if (r.sport !== "rest") km[r.sport] = (km[r.sport] ?? 0) + (parseNum(r.km) || 0);
    return Object.entries(km).filter(([, v]) => v > 0);
  }, [rows]);
  const nErrors = errorCount(errors);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">{plan ? "Schema bewerken" : "Nieuw schema"}</span>
          <h1 className="mt-1 font-display text-[28px] font-light leading-tight">{meta.title.trim() || (plan ? plan.title : "Nieuw schema")}</h1>
          {!plan && <p className="mt-1 text-[12.5px] text-ink-muted">Wordt het actieve schema; een huidig actief schema gaat naar afgerond.</p>}
        </div>
        {onPaste && (
          <Button size="sm" variant="ghost" onClick={onPaste}>Plakken uit tabel</Button>
        )}
      </div>

      <section className="rounded border border-border bg-surface p-4 sm:p-[18px]">
        <h2 className="mb-3.5 text-[13.5px] font-semibold">Over het schema</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="pe-title" className="ds-field__label mb-1.5 block">Titel</label>
            <input id="pe-title" className="ds-input" placeholder="bijv. Opbouw najaar" value={meta.title} aria-invalid={!!shown.meta.title || undefined} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
            {shown.meta.title && <span className="mt-1 block text-[12px] text-loss">{shown.meta.title}</span>}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="pe-goal" className="ds-field__label mb-1.5 block">Doel</label>
            <input id="pe-goal" className="ds-input" placeholder="bijv. 10 km onder 50 minuten" value={meta.goal} onChange={(e) => setMeta({ ...meta, goal: e.target.value })} />
          </div>
          <div className="sm:col-span-1 lg:col-span-2">
            <label htmlFor="pe-race" className="ds-field__label mb-1.5 block">Wedstrijd</label>
            <input id="pe-race" className="ds-input" placeholder="bijv. Marathon Amsterdam" value={meta.raceName} onChange={(e) => setMeta({ ...meta, raceName: e.target.value })} />
          </div>
          <div className="sm:col-span-1 lg:col-span-2">
            <label htmlFor="pe-race-date" className="ds-field__label mb-1.5 block">Datum wedstrijd</label>
            <input id="pe-race-date" type="date" className="ds-input" value={meta.raceDate} aria-invalid={!!shown.meta.raceDate || undefined} onChange={(e) => setMeta({ ...meta, raceDate: e.target.value })} />
            {shown.meta.raceDate && <span className="mt-1 block text-[12px] text-loss">{shown.meta.raceDate}</span>}
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="pe-notes" className="ds-field__label">Notities</label>
              <span className="flex gap-1" role="group" aria-label="Notities">
                {[false, true].map((p) => (
                  <button key={String(p)} type="button" aria-pressed={preview === p} onClick={() => setPreview(p)} className={`h-7 rounded-md px-2.5 text-[12px] ${preview === p ? "bg-[var(--surface-active)] font-semibold" : "text-ink-muted hover:bg-[var(--surface-hover)]"}`}>
                    {p ? "Voorbeeld" : "Schrijven"}
                  </button>
                ))}
              </span>
            </div>
            {preview ? (
              <div className="min-h-[120px] rounded-md bg-[var(--surface-sunken)] p-3">
                {meta.notes.trim() ? <Markdown text={meta.notes} className="text-[13px]" /> : <p className="text-[13px] text-ink-muted">Nog geen notities.</p>}
              </div>
            ) : (
              <textarea id="pe-notes" className="ds-input h-32 py-2 leading-relaxed" placeholder="Uitleg bij het schema: opbouw, aandachtspunten, racetempo. Markdown mag: **vet**, - lijstjes, ## kopjes." value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
            )}
          </div>
        </div>
      </section>

      <section className="rounded border border-border bg-surface p-4 sm:p-[18px]">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[13.5px] font-semibold">Sessies</h2>
          <span className="text-[12px] tabular-nums text-ink-muted">
            {rows.length} {rows.length === 1 ? "sessie" : "sessies"}
            {totals.map(([s, km]) => ` · ${sportName(s).toLowerCase()} ${fmtNum(km)} km`).join("")}
          </span>
        </div>

        {rows.length === 0 && (
          <div className="rounded-md border border-dashed border-[var(--border-strong)] px-4 py-8 text-center">
            <p className="text-[13.5px] font-medium">Nog geen sessies</p>
            <p className="mt-1 text-[12.5px] text-ink-muted">Voeg een sessie of een hele week toe. Een week kopiëren gaat daarna met één klik.</p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="hidden grid-cols-[138px_132px_minmax(100px,1fr)_72px_72px_96px_minmax(130px,1.2fr)_64px] gap-x-2 pb-1.5 pl-3 text-[11.5px] text-ink-muted sm:grid">
            <span>Datum</span><span>Sport</span><span>Soort</span><span>Km</span><span>Minuten</span><span>Zone</span><span>Rondje</span><span />
          </div>
        )}

        <div className="flex flex-col gap-5">
          {weeks.map(([monday, list]) => (
            <div key={monday || "zonder-datum"}>
              <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-[var(--surface-sunken)] px-3 py-1.5">
                <span className="text-[12.5px] font-semibold">
                  {monday ? `Week van ${fmtWeekRange(monday)}` : "Zonder datum"}
                  <span className="ml-2 font-normal tabular-nums text-ink-muted">
                    {fmtNum(list.reduce((s, r) => s + (r.sport === "rest" ? 0 : parseNum(r.km) || 0), 0))} km
                  </span>
                </span>
                {monday && <Button size="sm" variant="ghost" onClick={() => addInWeek(monday)}>+ Sessie</Button>}
              </div>
              <ul className="flex flex-col gap-2 sm:gap-0">
                {list.map((r) => (
                  <RowEditor key={r.key} row={r} errors={shown.rows[r.key]} routes={routes} onChange={(p) => patch(r.key, p)} onDuplicate={() => duplicate(r.key)} onDelete={() => remove(r.key)} />
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={addSession} icon={<SportGlyph sport="run" width={15} height={15} />}>Sessie toevoegen</Button>
          <Button size="sm" variant="ghost" onClick={addWeek}>{lastDate ? "+ Week (kopie van de laatste)" : "+ Week"}</Button>
        </div>
        {Object.entries(KIND_SUGGESTIONS).map(([sport, kinds]) => (
          <datalist key={sport} id={`kinds-${sport}`}>
            {kinds.map((k) => <option key={k} value={k} />)}
          </datalist>
        ))}
      </section>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-[var(--surface-page)] px-4 py-3 sm:mx-0 sm:rounded sm:border sm:bg-surface">
        <span className="min-w-0 flex-1 text-[12.5px]">
          {error ? <span className="text-loss">{error}</span>
            : tried && nErrors ? <span className="text-loss">{nErrors === 1 ? "Eén veld klopt nog niet." : `${nErrors} velden kloppen nog niet.`}</span>
            : <span className="text-ink-muted">{dirty ? "Niet opgeslagen wijzigingen" : "Geen wijzigingen"}</span>}
        </span>
        {onCancel && <Button size="sm" variant="ghost" onClick={cancel}>Annuleren</Button>}
        <Button size="sm" variant="primary" onClick={save} disabled={saving || (!!plan && !dirty)}>
          {saving ? "Opslaan…" : plan ? "Opslaan" : "Schema opslaan"}
        </Button>
      </div>
    </div>
  );
}
