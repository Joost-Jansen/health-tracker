"use client";

// Vandaag: hoe de week en de maand er in zones uitzien, hoeveel je deed tegenover je gewone week,
// hoe fris je bent, en je laatste activiteiten en herstel.

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import ZoneBar from "@/components/ZoneBar";
import OnboardingCard from "@/components/onboarding/Checklist";
import PeriodNav from "@/components/zones/PeriodNav";
import LoadCard from "@/components/dashboard/LoadCard";
import PlanWeekCard from "@/components/dashboard/PlanWeekCard";
import ReadinessCard from "@/components/dashboard/ReadinessCard";
import RecentActivities from "@/components/dashboard/RecentActivities";
import Upcoming from "@/components/dashboard/Upcoming";
import LineChart from "@/components/charts/LineChart";
import { api } from "@/lib/api";
import { T } from "@/lib/texts";
import {
  type Dashboard,
  fmtDate,
  fmtDuration,
  fmtKm,
  sportLabel,
  type ZonesForPeriod,
} from "@/lib/training";

const FORM_LINES = [
  { label: "Fitheid", colour: "var(--chart-1)", dash: false },
  { label: "Vermoeidheid", colour: "var(--chart-3)", dash: false },
  { label: "Vorm", colour: "var(--chart-4)", dash: true },
];

const SPORT_ORDER = ["run", "ride", "swim"];

const dayNo = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 86_400_000;
const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
/** "In balans" en niet "In Balans" (CSS capitalize zet elke woordletter groot). */
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtHours = (h: number) => `${h.toFixed(1).replace(".", ",")} u`;
const bySportOrder = (a: string, b: string) =>
  (SPORT_ORDER.indexOf(a) + 1 || 99) - (SPORT_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);

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
  const bounds = zp?.bounds ?? d.zone_bounds;
  const zoneSports = Object.keys(zones).filter((s) => s !== "all").sort(bySportOrder);
  const multiSport = zoneSports.length > 1;
  const volSports = Array.from(new Set([...Object.keys(d.volume.week), ...Object.keys(d.volume.avg4w)])).sort(bySportOrder);
  const form = d.form;
  const syncDay = /^\d{4}-\d{2}-\d{2}/.test(d.last_sync ?? "") ? d.last_sync.slice(0, 10) : null;
  const syncAge = syncDay ? dayNo(d.today) - dayNo(syncDay) : 0;
  const lastSync = syncDay ? `${fmtDate(syncDay)}${d.last_sync.length > 10 ? `, ${d.last_sync.slice(11, 16)}` : ""}` : d.last_sync || "nog niet";
  // De lopende week (ma t/m vandaag) tegenover het gemiddelde van de vier hele weken ervoor.
  const weekThrough = new Date(d.today + "T12:00:00").toLocaleDateString("nl-NL", { weekday: "long" });
  // Herstel: alle zeven dagen, ook die zonder meting, zodat een gat zichtbaar is in plaats van weg te vallen.
  const recoveryByDay = new Map(d.recovery.days.map((w) => [w.date, w]));
  const recoveryDays = Array.from({ length: 7 }, (_, i) => isoOf(dayNo(d.today) - i));

  return (
    <div className="flex flex-col gap-4">
      {syncAge >= 2 ? (
        <p role="status" className="flex items-start gap-2 rounded border border-border bg-surface px-3 py-2 text-[12.5px] leading-relaxed">
          <span aria-hidden="true" className="mt-[6px] inline-block h-2 w-2 flex-none rounded-full bg-warn" />
          <span><span className="font-medium">Laatste sync: {lastSync}.</span> <span className="text-ink-muted">{T.syncStale(syncAge)}</span></span>
        </p>
      ) : (
        <p className="text-[12.5px] text-ink-muted">Laatste sync: {lastSync}</p>
      )}

      <OnboardingCard />

      {/* Alleen kaarten met iets te zeggen: zonder nachtdata, vorm of schema valt de kaart weg en vult de rest de rij. */}
      {(d.readiness || form) && (
        <div className={`grid gap-4 ${d.readiness && form ? "lg:grid-cols-[1.25fr_1fr]" : ""}`}>
          {d.readiness && <ReadinessCard r={d.readiness} />}
          {form && <LoadCard load={form.load} />}
        </div>
      )}

      {d.plan_week && (
        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <PlanWeekCard week={d.plan_week} race={d.race} />
          <Upcoming sessions={d.upcoming} title={d.plan_title} />
        </div>
      )}

      {form && (
        <Card title="Vorm" more="Alle trends" moreHref="/trends/">
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="flex flex-col gap-3">
              <div>
                <div className="font-display text-[27px] font-light">{sentence(form.status)}</div>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">{T.formStatus[form.status]}</p>
              </div>
              <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] tabular-nums">
                <div><dt className="text-ink-muted">Fitheid</dt><dd className="text-[17px]">{Math.round(form.ctl)}</dd></div>
                <div><dt className="text-ink-muted">Vermoeidheid</dt><dd className="text-[17px]">{Math.round(form.atl)}</dd></div>
                <div><dt className="text-ink-muted">Vorm</dt><dd className="text-[17px]">{form.tsb > 0 ? "+" : ""}{Math.round(form.tsb)}</dd></div>
              </dl>
              <p className="text-[11.5px] leading-relaxed text-ink-muted">{T.formTsb} Piek fitheid {Math.round(form.ctl_peak)} op {fmtDate(form.ctl_peak_date)}.</p>
              {form.stopped_at_sync && (
                <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-ink-muted">
                  <span aria-hidden="true" className="mt-[5px] inline-block h-1.5 w-1.5 flex-none rounded-full bg-warn" />
                  {T.vandaag.formStopped(fmtDate(form.until))}
                </p>
              )}
            </div>
            <div>
            <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-muted">
              {FORM_LINES.map((l) => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <svg width="16" height="6" aria-hidden><line x1="0" x2="16" y1="3" y2="3" stroke={l.colour} strokeWidth="2" strokeDasharray={l.dash ? "4 3" : undefined} /></svg>
                  {l.label}
                </span>
              ))}
            </div>
            <LineChart
              endLabels={false}
              height={190}
              ariaLabel="Fitheid, vermoeidheid en vorm, laatste 90 dagen"
              format={(v) => String(Math.round(v))}
              baseline={0}
              series={[
                { label: "Fitheid", colour: "var(--chart-1)", width: 2, points: form.series.map((r) => ({ d: r.date, v: r.ctl })) },
                { label: "Vermoeidheid", colour: "var(--chart-3)", points: form.series.map((r) => ({ d: r.date, v: r.atl })) },
                { label: "Vorm", colour: "var(--chart-4)", dash: "dashed", points: form.series.map((r) => ({ d: r.date, v: r.tsb })) },
              ]}
            />
            </div>
          </div>
        </Card>
      )}

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
              {multiSport ? (
                <>
                  <ZoneBar sport="all" share={zones.all} />
                  <div className="border-t border-border" />
                  {zoneSports.map((s) => <ZoneBar key={s} sport={s} share={zones[s]} bounds={bounds[s]} />)}
                </>
              ) : (
                <>
                  <ZoneBar sport={zoneSports[0]} share={zones[zoneSports[0]]} bounds={bounds[zoneSports[0]]} />
                  <p className="-mt-2 text-[11.5px] text-ink-muted">Alleen {sportLabel(zoneSports[0]).toLowerCase()} in deze periode.</p>
                </>
              )}
            </div>
          )}
          <p className="mt-4 text-[11.5px] text-ink-muted">{T.zonesFootnote(d.zone_estimates ?? [], d.zones_set ?? [])}</p>
        </Card>

        <div className="flex flex-col gap-4">
          <Card title="Volume deze week">
            {volSports.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Nog geen trainingen deze week of de vier weken ervoor.</p>
            ) : (
            <table className="w-full text-[13px] tabular-nums">
              <thead>
                <tr className="text-left text-[11.5px] text-ink-muted">
                  <th className="pb-2 font-normal">Sport</th>
                  <th className="pb-2 font-normal">Tot nu</th>
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
            )}
            {volSports.length > 0 && <p className="mt-2 text-[11.5px] text-ink-muted">{T.volumeWeek(weekThrough)}</p>}
          </Card>
          <Card title="Herstel, laatste 7 dagen" className="flex-1">
            {d.recovery.days.length === 0 ? (
              <p className="text-[13px] text-ink-muted">Geen hersteldata deze week (horloge 's nachts niet gedragen?).</p>
            ) : (
              <table className="w-full text-[12.5px] tabular-nums">
                <thead>
                  <tr className="text-left text-[11.5px] text-ink-muted">
                    <th className="pb-2 font-normal">Dag</th>
                    <th className="pb-2 font-normal">Slaap</th>
                    <th className="pb-2 font-normal">Rusthartslag</th>
                    <th className="pb-2 font-normal">Body Battery</th>
                  </tr>
                </thead>
                <tbody>
                  {recoveryDays.map((day) => {
                    const w = recoveryByDay.get(day);
                    const sleep = Number(w?.sleep_h);
                    return (
                      <tr key={day} className={`border-t border-border ${w ? "" : "text-ink-muted"}`}>
                        <td className="py-1.5">{fmtDate(day)}</td>
                        <td className="py-1.5">{sleep > 0 ? fmtHours(sleep) : "–"}</td>
                        <td className="py-1.5">{w?.resting_hr ?? "–"}</td>
                        <td className="py-1.5">{w?.body_battery_high ?? "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {d.recovery.baseline_rhr && <p className="mt-3 text-[11.5px] text-ink-muted">Je normale rusthartslag (mediaan 60 dagen): {Math.round(d.recovery.baseline_rhr)} bpm.</p>}
          </Card>
        </div>
      </div>

      <RecentActivities items={d.recent} />

    </div>
  );
}
