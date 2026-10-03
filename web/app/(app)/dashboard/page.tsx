"use client";

// Vandaag: hoe de week en de maand er in zones uitzien, hoeveel je deed tegenover je gewone week,
// hoe fris je bent, en je laatste activiteiten en herstel.

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import ZoneBar from "@/components/ZoneBar";
import PeriodNav from "@/components/zones/PeriodNav";
import LineChart from "@/components/charts/LineChart";
import { api } from "@/lib/api";
import {
  type Dashboard,
  fmtDate,
  fmtDuration,
  fmtIntensity,
  fmtKm,
  type PlanSession,
  type Readiness,
  sportLabel,
  type ZonesForPeriod,
} from "@/lib/training";

const VERDICT: Record<Readiness["verdict"], { label: string; colour: string }> = {
  klaar: { label: "Klaar voor training", colour: "var(--zone-2)" },
  "rustig aan": { label: "Rustig aan", colour: "var(--zone-3)" },
  herstel: { label: "Herstel eerst", colour: "var(--zone-5)" },
  onbekend: { label: "Geen nachtdata", colour: "var(--zone-1)" },
};
const LEVEL_COLOUR = { ok: "var(--zone-2)", attention: "var(--zone-3)", warn: "var(--zone-5)" };

function ReadinessCard({ r }: { r: Readiness }) {
  const v = VERDICT[r.verdict];
  return (
    <Card title="Klaar voor vandaag?">
      <div className="flex items-center gap-2.5">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: v.colour }} />
        <span className="font-display text-[23px] font-light">{v.label}</span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{r.text}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] tabular-nums">
        {r.signals.map((s) => (
          <div key={s.key}>
            <dt className="flex items-center gap-1.5 text-ink-muted"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLOUR[s.level] }} />{s.label}</dt>
            <dd><span className="text-[15px]">{s.value}</span> {s.note && <span className="text-[11px] text-ink-muted">{s.note}</span>}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-ink-muted">Vergelijkt afgelopen nacht met je eigen normaal. Geen medisch advies: voel je je ziek of heb je pijn, train niet.</p>
    </Card>
  );
}

function Upcoming({ sessions, title }: { sessions: PlanSession[]; title?: string }) {
  return (
    <Card title="Komende trainingen" more="Schema" moreHref="/plan/">
      {sessions.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{title ? "Geen sessies meer in het schema." : "Nog geen actief schema."} <Link href="/plan/" className="underline underline-offset-2">Schema</Link></p>
      ) : (
        <ul className="flex flex-col">
          {sessions.map((s, i) => (
            <li key={`${s.date}-${i}`} className="grid grid-cols-[92px_1fr] gap-3 border-t border-border py-2 text-[13px] first:border-t-0">
              <span className={s.status === "vandaag" ? "font-semibold" : "text-ink-muted"}>{s.status === "vandaag" ? "Vandaag" : fmtDate(s.date)}</span>
              <span>
                <span className="font-medium">{s.sport === "rest" ? "Rust" : sportLabel(s.sport)}</span>
                {[s.kind, s.distance_km ? fmtKm(s.distance_km) : null, s.duration_min ? `${s.duration_min} min` : null, s.target_zone].filter(Boolean).map((x) => <span key={String(x)} className="text-ink-muted"> · {x}</span>)}
                {s.status === "gedaan" && <span className="text-gain"> · gedaan</span>}
                {s.route_suggestion && <span className="block text-[12px] text-ink-muted">Rondje: {s.route_suggestion.names.join(" + ")}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {title && <p className="mt-2 text-[11.5px] text-ink-muted">Uit: {title}</p>}
    </Card>
  );
}

const SPORT_ORDER = ["run", "ride", "swim"];
const bySportOrder = (a: string, b: string) =>
  (SPORT_ORDER.indexOf(a) + 1 || 99) - (SPORT_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);

const STATUS_TEXT: Record<string, string> = {
  fris: "Fris: je hebt ruimte voor een zware training of een wedstrijd.",
  "in balans": "In balans: belasting en herstel houden elkaar in evenwicht.",
  vermoeid: "Vermoeid: je bouwt op; plan binnenkort een rustiger dag.",
  "zeer vermoeid": "Zeer vermoeid: neem rust, de belasting is hoog tegenover wat je gewend bent.",
};

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="ds-segmented" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id}
          className={`ds-segmented__item ${value === o.id ? "ds-segmented__item--active" : ""}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/api/dashboard") });
  const zq = useQuery({
    queryKey: ["zones", period, offset],
    queryFn: () => api.get<ZonesForPeriod>(`/api/zones?period=${period}&offset=${offset}`),
    placeholderData: keepPreviousData,
  });
  if (q.isLoading) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!q.data) return <p className="text-sm text-ink-muted">Kon het dashboard niet laden.</p>;
  const d = q.data;

  // Tot /api/zones er is, de huidige periode uit het dashboard; daarna blijft de vorige staan tijdens het laden.
  const zp = zq.data;
  const zones = zp ? zp.zones : d.zones[period];
  const zonesCurrent = zp ? zp.is_current : true;
  const zoneSports = Object.keys(zones).filter((s) => s !== "all").sort(bySportOrder);
  const multiSport = zoneSports.length > 1;
  const volSports = Array.from(new Set([...Object.keys(d.volume.week), ...Object.keys(d.volume.avg4w)])).sort(bySportOrder);
  const form = d.form;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-ink-muted">Laatste sync: {d.last_sync} (Europe/Amsterdam)</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {d.readiness ? <ReadinessCard r={d.readiness} /> : <Card title="Klaar voor vandaag?"><p className="text-[13px] text-ink-muted">Geen hersteldata.</p></Card>}
        <Upcoming sessions={d.upcoming} title={d.plan_title} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Tijd per hartslagzone" action={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={period} onChange={(p) => { setPeriod(p); setOffset(0); }} options={[{ id: "week", label: "Week" }, { id: "month", label: "Maand" }]} />
            <PeriodNav label={zp?.label ?? (period === "week" ? "Deze week" : "Deze maand")} offset={offset} onChange={setOffset} loading={zq.isPlaceholderData} />
          </div>
        }>
          {zoneSports.length === 0 ? (
            <p className="text-[13px] text-ink-muted">{zonesCurrent ? `Nog geen training met hartslag ${period === "week" ? "deze week" : "deze maand"}.` : "Geen training met hartslag in deze periode."}</p>
          ) : (
            <div className="flex flex-col gap-5">
              <ZoneBar sport="all" share={zones.all} />
              {multiSport && <div className="border-t border-border" />}
              {multiSport && zoneSports.map((s) => <ZoneBar key={s} sport={s} share={zones[s]} bounds={d.zone_bounds[s]} />)}
              {!multiSport && <p className="-mt-2 text-[11.5px] text-ink-muted">Alleen {sportLabel(zoneSports[0]).toLowerCase()} in deze periode.</p>}
            </div>
          )}
          <p className="mt-4 text-[11.5px] text-ink-muted">Alle sporten telt elke sport met zijn eigen zones. Fiets- en zwemzones zijn geschat.</p>
        </Card>

        <Card title="Volume deze week">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-left text-[11.5px] text-ink-muted">
                <th className="pb-2 font-normal">Sport</th>
                <th className="pb-2 font-normal">Deze week</th>
                <th className="pb-2 font-normal">Gem. 4 weken</th>
              </tr>
            </thead>
            <tbody>
              {volSports.map((s) => {
                const w = d.volume.week[s];
                const a = d.volume.avg4w[s];
                return (
                  <tr key={s} className="border-t border-border">
                    <td className="py-2">{sportLabel(s)}</td>
                    <td className="py-2">{w ? `${fmtKm(w.km)} · ${fmtDuration(w.seconds)}` : "–"}</td>
                    <td className="py-2 text-ink-muted">{a ? `${fmtKm(a.km)} · ${fmtDuration(a.seconds)}` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {form && (
        <Card title="Vorm" more="Alle trends" moreHref="/trends/">
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="flex flex-col gap-3">
              <div>
                <div className="font-display text-[27px] font-light capitalize">{form.status}</div>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">{STATUS_TEXT[form.status]}</p>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-[12px] tabular-nums">
                <div><dt className="text-ink-muted">Fitheid</dt><dd className="text-[17px]">{Math.round(form.ctl)}</dd></div>
                <div><dt className="text-ink-muted">Moeheid</dt><dd className="text-[17px]">{Math.round(form.atl)}</dd></div>
                <div><dt className="text-ink-muted">Vorm</dt><dd className="text-[17px]">{form.tsb > 0 ? "+" : ""}{Math.round(form.tsb)}</dd></div>
              </dl>
              <p className="text-[11.5px] text-ink-muted">Piek fitheid {Math.round(form.ctl_peak)} op {fmtDate(form.ctl_peak_date)}.</p>
            </div>
            <LineChart
              ariaLabel="Fitheid, vermoeidheid en vorm, laatste 90 dagen"
              format={(v) => String(Math.round(v))}
              baseline={0}
              series={[
                { label: "Fitheid", colour: "var(--chart-1)", width: 2, points: form.series.map((r) => ({ d: r.date, v: r.ctl })) },
                { label: "Vermoeid", colour: "var(--chart-3)", points: form.series.map((r) => ({ d: r.date, v: r.atl })) },
                { label: "Vorm", colour: "var(--chart-4)", dash: "dashed", points: form.series.map((r) => ({ d: r.date, v: r.tsb })) },
              ]}
            />
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Laatste activiteiten" more="Historie" moreHref="/historie/">
          <ul className="flex flex-col">
            {d.recent.map((a) => (
              <li key={a.id} className="grid grid-cols-[92px_1fr_auto] items-baseline gap-3 border-t border-border py-2 text-[13px] first:border-t-0">
                <span className="text-ink-muted">{fmtDate(a.start_local)}</span>
                <span className="truncate">
                  <span className="font-medium">{sportLabel(a.sport)}</span>
                  {a.name && <span className="text-ink-muted"> · {a.name}</span>}
                </span>
                <span className="tabular-nums text-ink-muted">
                  {a.distance_km ? fmtKm(a.distance_km) : fmtDuration(a.moving_time_s)} · {fmtIntensity(a)}{a.avg_hr ? ` · ${a.avg_hr} bpm` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Herstel, laatste 7 dagen">
          {d.recovery.days.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Geen hersteldata deze week (horloge 's nachts niet gedragen?).</p>
          ) : (
            <table className="w-full text-[12.5px] tabular-nums">
              <thead>
                <tr className="text-left text-[11.5px] text-ink-muted">
                  <th className="pb-2 font-normal">Dag</th>
                  <th className="pb-2 font-normal">Slaap</th>
                  <th className="pb-2 font-normal">Rust-HR</th>
                  <th className="pb-2 font-normal">Body Battery</th>
                </tr>
              </thead>
              <tbody>
                {d.recovery.days.slice().reverse().map((w) => (
                  <tr key={w.date} className="border-t border-border">
                    <td className="py-1.5">{fmtDate(w.date)}</td>
                    <td className="py-1.5">{w.sleep_h ? `${String(w.sleep_h).replace(".", ",")} u` : "–"}</td>
                    <td className="py-1.5">{w.resting_hr ?? "–"}</td>
                    <td className="py-1.5">{w.body_battery_high ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {d.recovery.baseline_rhr && <p className="mt-3 text-[11.5px] text-ink-muted">Rust-HR normaal (60 dagen): {d.recovery.baseline_rhr} bpm.</p>}
        </Card>
      </div>
    </div>
  );
}
