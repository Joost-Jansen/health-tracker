"use client";

// Zones en profiel: je eigen hartslagzones per sport (als % van je max) en een paar vaste gegevens. Alles op de site
// rekent met deze zones; na opslaan wordt de tijd per zone van al je activiteiten opnieuw berekend.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button, Checkbox, Input } from "@/components/ds";
import { api, ApiError } from "@/lib/api";
import { sportLabel, ZONE_COLOUR, ZONES } from "@/lib/training";

type SportZone = { max_hr: number; bounds: number[]; estimate?: boolean };
type ZonesResp = { percent: number[]; zones: Record<string, SportZone>; suggested_max: Record<string, number | null>; estimate_offset: Record<string, number> };
type Facts = { birth_year?: number; weight_kg?: number; height_cm?: number; resting_hr?: number };
const SPORTS = ["run", "ride", "swim"] as const;

function boundsFor(max: number, p: number[]) {
  return [Math.round((max * p[0]) / 100), ...p.slice(1).map((x) => Math.round((max * x) / 100) + 1)];
}

function ZonePreview({ max, percent }: { max: number; percent: number[] }) {
  const b = boundsFor(max, percent);
  const ranges = [`< ${b[0]}`, `${b[0]}-${b[1] - 1}`, `${b[1]}-${b[2] - 1}`, `${b[2]}-${b[3] - 1}`, `≥ ${b[3]}`];
  return (
    <div className="grid grid-cols-5 gap-1 text-[11.5px] tabular-nums">
      {ZONES.map((z, i) => (
        <span key={z} className="rounded px-1.5 py-1" style={{ background: `color-mix(in srgb, ${ZONE_COLOUR[z]} 45%, transparent)` }}>
          <span className="font-medium">{z}</span> {ranges[i]}
        </span>
      ))}
    </div>
  );
}

function ZonesCard({ data }: { data: ZonesResp }) {
  const qc = useQueryClient();
  const [percent, setPercent] = useState(data.percent.map(String));
  const [max, setMax] = useState<Record<string, string>>({});
  const [estimate, setEstimate] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    setMax(Object.fromEntries(SPORTS.map((s) => [s, data.zones[s]?.max_hr ? String(data.zones[s].max_hr) : ""])));
    setEstimate(Object.fromEntries(SPORTS.map((s) => [s, Boolean(data.zones[s]?.estimate)])));
  }, [data]);
  const p = percent.map(Number);
  const runMax = Number(max.run) || data.suggested_max.run || null;

  async function save() {
    setMsg(null);
    try {
      await api.put("/api/settings/zones", {
        percent: p,
        sports: Object.fromEntries(SPORTS.map((s) => [s, { max_hr: max[s] ? Number(max[s]) : null, estimate: estimate[s] }])),
      });
      setMsg({ ok: true, text: "Opgeslagen. De tijd per zone van je activiteiten wordt opnieuw berekend; dat duurt even." });
      qc.invalidateQueries();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Opslaan mislukt" });
    }
  }

  return (
    <Card title="Hartslagzones" action={<Button size="sm" variant="primary" onClick={save}>Opslaan</Button>}>
      <p className="mb-4 max-w-prose text-[12.5px] leading-relaxed text-ink-muted">
        Zones als percentage van je maximale hartslag, per sport. Ken je je max niet, neem dan het voorstel uit je eigen data (je hoogste gemeten hartslag, zonder uitschieters) of schat fietsen en zwemmen vanaf je loopmax en vink "schatting" aan.
      </p>
      <div className="flex flex-col gap-5">
        {SPORTS.map((s) => {
          const suggestion = data.suggested_max[s];
          const fallback = s !== "run" && runMax ? runMax - (data.estimate_offset[s] ?? 0) : null;
          const m = Number(max[s]);
          return (
            <div key={s} className="flex flex-col gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-end gap-3">
                <Input label={`${sportLabel(s)}: max hartslag`} inputMode="numeric" className="w-28" value={max[s] ?? ""} onChange={(e) => setMax({ ...max, [s]: e.target.value.replace(/\D/g, "") })} />
                <Checkbox label="Schatting" checked={estimate[s] ?? false} onChange={(v) => setEstimate({ ...estimate, [s]: v })} />
                {suggestion && String(suggestion) !== max[s] && (
                  <Button size="sm" variant="ghost" onClick={() => setMax({ ...max, [s]: String(suggestion) })}>Voorstel uit je data: {suggestion}</Button>
                )}
                {!suggestion && fallback && !max[s] && (
                  <Button size="sm" variant="ghost" onClick={() => { setMax({ ...max, [s]: String(fallback) }); setEstimate({ ...estimate, [s]: true }); }}>
                    Schatten vanaf lopen: {fallback}
                  </Button>
                )}
              </div>
              {m >= 100 && m <= 230 ? <ZonePreview max={m} percent={p} /> : <p className="text-[12px] text-ink-muted">Zonder max geen zones voor {sportLabel(s).toLowerCase()}.</p>}
            </div>
          );
        })}
      </div>
      <details className="mt-5 text-[12.5px]">
        <summary className="cursor-pointer text-ink-muted">Grenzen tussen de zones (% van max)</summary>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {["Z2", "Z3", "Z4", "Z5"].map((z, i) => (
            <Input key={z} label={`${z} vanaf`} inputMode="decimal" className="w-20" value={percent[i]} onChange={(e) => setPercent(percent.map((x, j) => (j === i ? e.target.value.replace(",", ".") : x)))} />
          ))}
          <Button size="sm" variant="ghost" onClick={() => setPercent(["70", "77", "85", "92.5"])}>Standaard</Button>
        </div>
      </details>
      {msg && <p className={`mt-3 text-[12.5px] ${msg.ok ? "text-gain" : "text-loss"}`}>{msg.text}</p>}
    </Card>
  );
}

function FactsCard() {
  const q = useQuery({ queryKey: ["profile-facts"], queryFn: () => api.get<Facts>("/api/settings/profile") });
  const [f, setF] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (q.data) setF(Object.fromEntries(Object.entries(q.data).map(([k, v]) => [k, String(v)])));
  }, [q.data]);
  const field = (k: keyof Facts, label: string) => (
    <Input label={label} inputMode="decimal" className="w-28" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(",", ".") })} />
  );
  return (
    <Card title="Profiel">
      <p className="mb-4 max-w-prose text-[12.5px] text-ink-muted">Optioneel. Coachingagents gebruiken dit bij hun advies; de site rekent er niet mee.</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
            await api.put("/api/settings/profile", body);
            setMsg("Opgeslagen.");
          } catch (err) {
            setMsg(err instanceof ApiError ? err.message : "Opslaan mislukt");
          }
        }}
      >
        {field("birth_year", "Geboortejaar")}
        {field("height_cm", "Lengte (cm)")}
        {field("weight_kg", "Gewicht (kg)")}
        {field("resting_hr", "Rusthartslag")}
        <Button type="submit" size="sm" variant="primary">Opslaan</Button>
        {msg && <span className="text-[12.5px] text-ink-muted">{msg}</span>}
      </form>
    </Card>
  );
}

export default function ZonesPage() {
  const q = useQuery({ queryKey: ["settings-zones"], queryFn: () => api.get<ZonesResp>("/api/settings/zones") });
  if (!q.data) return <p className="text-sm text-ink-muted">Laden…</p>;
  return (
    <div className="flex flex-col gap-4">
      <ZonesCard data={q.data} />
      <FactsCard />
    </div>
  );
}
