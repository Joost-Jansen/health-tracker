"use client";

// Vandaag: hoe de week en de maand er in zones uitzien, hoeveel je deed tegenover je gewone week,
// hoe fris je bent, en je laatste activiteiten en herstel.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import ZoneBar from "@/components/ZoneBar";
import LineChart from "@/components/charts/LineChart";
import { api } from "@/lib/api";
import {
  type Dashboard,
  fmtDate,
  fmtDuration,
  fmtIntensity,
  fmtKm,
  sportLabel,
} from "@/lib/training";

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
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/api/dashboard") });
  if (q.isLoading) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!q.data) return <p className="text-sm text-ink-muted">Kon het dashboard niet laden.</p>;
  const d = q.data;

  const zones = d.zones[period];
  const zoneSports = Object.keys(zones).filter((s) => s !== "all").sort(bySportOrder);
  const multiSport = zoneSports.length > 1;
  const volSports = Array.from(new Set([...Object.keys(d.volume.week), ...Object.keys(d.volume.avg4w)])).sort(bySportOrder);
  const form = d.form;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-ink-muted">Laatste sync: {d.last_sync} (Europe/Amsterdam)</p>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Tijd per hartslagzone" action={
          <Segmented value={period} onChange={setPeriod} options={[{ id: "week", label: "Deze week" }, { id: "month", label: "Deze maand" }]} />
        }>
          {zoneSports.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Nog geen training met hartslag {period === "week" ? "deze week" : "deze maand"}.</p>
          ) : (
            <div className="flex flex-col gap-5">
              <ZoneBar sport="all" share={zones.all} />
              {multiSport && <div className="border-t border-border" />}
              {multiSport && zoneSports.map((s) => <ZoneBar key={s} sport={s} share={zones[s]} bounds={d.zone_bounds[s]} />)}
              {!multiSport && <p className="-mt-2 text-[11.5px] text-ink-muted">Alleen {sportLabel(zoneSports[0]).toLowerCase()} in deze periode.</p>}
            </div>
          )}
          <p className="mt-4 text-[11.5px] text-ink-muted">Alle sporten telt elke sport met zijn eigen zones (zones.json). Fiets- en zwemzones zijn geschat.</p>
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
