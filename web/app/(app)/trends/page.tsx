"use client";

// Trends: vorm (fitheid/vermoeidheid/vorm), volume per week per sport, tijd per zone over tijd, Z2-tempo, VO2max, herstel,
// records en wedstrijden. Elke reeks met een trendlijn en de piek in de kop.
//
// Eén tijdvenster voor de hele pagina (TimeFilterBar, plakt onder de bovenbalk; staat in de adresbalk).
// Elke grafiek deelt die tijdas; schuiven of zoomen in één grafiek verzet het venster voor alle.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Tabs } from "@/components/ds";
import TimeChart, { DAILY_MA, WEEKLY_MA, type ChartSeries } from "@/components/charts/TimeChart";
import TrendChart from "@/components/charts/TrendChart";
import TimeFilterBar from "@/components/timefilter/TimeFilterBar";
import { useTimeRange } from "@/components/timefilter/useTimeRange";
import ZonesOverTime from "@/components/zones/ZonesOverTime";
import { api } from "@/lib/api";
import { fmtDate, windowDays } from "@/lib/timeline";
import { type Trends, fmtClock, fmtKm, sportLabel } from "@/lib/training";

// De dagelijkse herstelreeks (api/trends.py recovery_daily). Lokaal getypeerd zodat lib/training.ts
// ongemoeid blijft; oudere API-versies zonder dit veld vallen terug op de weekgemiddelden.
type RecoveryDay = { date: string; resting_hr: number | null; sleep_h: number | null; body_battery_high: number | null; stress_avg: number | null; hrv: number | null };
type TrendsData = Trends & { recovery_daily?: RecoveryDay[] };
type RecoveryKey = "resting_hr" | "sleep_h" | "body_battery_high" | "stress_avg";

const SPORT_COLOUR: Record<string, string> = { run: "var(--chart-1)", ride: "var(--chart-4)", swim: "var(--chart-3)" };
const RECORD_LABEL: Record<string, string> = { "1k": "1 km", "5k": "5 km", "10k": "10 km", "21k": "Halve marathon" };
const href = (id: string) => `/historie/activiteit/?id=${encodeURIComponent(id)}`;
const RECORD_KM: Record<string, number> = { "1k": 1, "5k": 5, "10k": 10, "21k": 21.0975 };
const RECORD_COLOUR: Record<string, string> = { "1k": "var(--chart-4)", "5k": "var(--chart-1)", "10k": "var(--chart-3)", "21k": "var(--chart-5)" };
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

export default function TrendsPage() {
  const [metric, setMetric] = useState<"hours" | "km">("hours");
  const q = useQuery({ queryKey: ["trends"], queryFn: () => api.get<TrendsData>("/api/trends") });

  const t = q.data;
  // Het venster loopt van de eerste meting (welke reeks ook) tot vandaag.
  const first = useMemo(() => {
    if (!t) return "";
    const starts = [t.form[0]?.date, t.weekly[0]?.week, t.z2_pace[0]?.week, t.vo2max[0]?.date, t.recovery_daily?.[0]?.date, t.recovery_weekly[0]?.week].filter(Boolean) as string[];
    return starts.length ? starts.sort()[0] : t.today;
  }, [t]);
  const last = t?.today ?? "";
  const range = useTimeRange(first, last);
  const win = range.window;
  const from = win.from;
  const inRange = <T extends { date?: string; week?: string }>(rows: T[]) => rows.filter((r) => (r.date ?? r.week ?? "") >= win.from && (r.date ?? r.week ?? "") <= win.to);
  const shared = { window: win, domain: { from: first, to: last }, onWindow: range.change, onReset: range.reset };

  const volume = useMemo(() => {
    if (!t) return { series: [] as ChartSeries[], avg: 0 };
    const main = ["run", "ride", "swim"];
    const val = (v: { km: number; seconds: number }) => (metric === "hours" ? v.seconds / 3600 : v.km);
    const series: ChartSeries[] = main.map((s) => ({
      key: s,
      label: sportLabel(s),
      colour: SPORT_COLOUR[s],
      kind: "bar",
      ma: true,
      points: t.weekly.map((w) => ({ d: w.week, v: w.sports[s] ? val(w.sports[s]) : 0 })),
    }));
    if (metric === "hours") {
      series.push({
        key: "other",
        label: "Overig",
        colour: "var(--chart-5)",
        kind: "bar",
        ma: true,
        points: t.weekly.map((w) => ({ d: w.week, v: Object.entries(w.sports).filter(([s]) => !main.includes(s)).reduce((sum, [, v]) => sum + val(v), 0) })),
      });
    }
    // Gemiddelde per week over de weken die (grotendeels) in het venster vallen.
    const weeks = t.weekly.filter((w) => w.week >= from && w.week <= win.to);
    const total = weeks.reduce((sum, w) => sum + Object.entries(w.sports).filter(([s]) => metric === "hours" || main.includes(s)).reduce((x, [, v]) => x + val(v), 0), 0);
    return { series, avg: weeks.length ? total / weeks.length : 0 };
  }, [t, from, win.to, metric]);

  if (q.isLoading) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!t) return <p className="text-sm text-ink-muted">Kon de trends niet laden.</p>;

  const form = inRange(t.form);
  const peakCtl = form.length ? form.reduce((b, r) => (r.ctl > b.ctl ? r : b), form[0]) : null;
  const now = t.form[t.form.length - 1];
  // Uren als u:mm (fmtClock gaf onder het uur m:ss, waardoor 30 minuten als "30 u" las).
  const fmtVol = (v: number) => {
    if (metric !== "hours") return fmtKm(v);
    const min = Math.round(v * 60);
    return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} u`;
  };

  const z2 = t.z2_pace.map((r) => ({ d: r.week, v: r.pace_s_per_km }));
  const vo2 = t.vo2max.map((r) => ({ d: r.date, v: r.value }));
  const daily = (t.recovery_daily?.length ?? 0) > 0;
  const series = (key: RecoveryKey) =>
    daily
      ? t.recovery_daily!.filter((r) => r[key] != null).map((r) => ({ d: r.date, v: r[key] as number }))
      : t.recovery_weekly.filter((r) => r[key] != null).map((r) => ({ d: r.week, v: r[key] as number }));
  const recoveryMa = daily ? DAILY_MA : WEEKLY_MA;
  const races = t.races.map((r) => ({ d: r.date, label: r.name }));
  const recordSeries: ChartSeries[] = (Object.keys(RECORD_LABEL) as (keyof Trends["records"])[])
    .filter((k) => (t.records[k] ?? []).length > 0)
    .map((k) => ({ key: k, label: RECORD_LABEL[k], colour: RECORD_COLOUR[k], kind: "step", points: t.records[k].map((r) => ({ d: r.date, v: r.seconds / RECORD_KM[k] })) }));

  return (
    <div className="flex flex-col gap-4">
      <TimeFilterBar range={range} first={first} last={last} overview={t.form.map((r) => ({ d: r.date, v: r.ctl }))} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="Inzichten">
          {t.insights.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Niets bijzonders.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {t.insights.map((i) => (
                <li key={i.title} className="flex gap-3 text-[13px]">
                  <span className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full" style={{ background: i.level === "goed" ? "var(--zone-2)" : i.level === "let_op" ? "var(--zone-4)" : "var(--zone-1)" }} />
                  <span><span className="font-medium">{i.title}.</span> <span className="text-ink-muted">{i.text}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Voorspelde wedstrijdtijden">
          {Object.keys(t.predictions).length === 0 ? (
            <p className="text-[13px] text-ink-muted">Geen snelle inspanning in de laatste 180 dagen om van uit te gaan.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {(["5k", "10k", "21k", "42k"] as const).map((k) => {
                  const p = t.predictions[k];
                  return (
                    <div key={k} className="flex flex-col">
                      <span className="text-[11.5px] text-ink-muted">{{ "5k": "5 km", "10k": "10 km", "21k": "Halve marathon", "42k": "Marathon" }[k]}</span>
                      <span className="font-display text-[21px] leading-tight tabular-nums">{p ? fmtClock(p.seconds) : "–"}</span>
                      {p && <span className="text-[11px] tabular-nums text-ink-muted">{fmtClock(p.pace_s_per_km)}/km</span>}
                    </div>
                  );
                })}
              </div>
              {t.predictions["42k"] && (
                <p className="mt-3 text-[11.5px] text-ink-muted">
                  Riegel-formule vanaf je langste snelle inspanning van de laatste 180 dagen:{" "}
                  <Link className="underline underline-offset-2" href={href(t.predictions["42k"].from.activity_id)}>
                    {fmtKm(t.predictions["42k"].from.km)} in {fmtClock(t.predictions["42k"].from.seconds)} ({fmtDay(t.predictions["42k"].from.date)})
                  </Link>
                  . Voor de marathon optimistisch zonder genoeg lange duurlopen van 30+ km; reken op enkele minuten meer.
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      <Card title="Vorm: fitheid, vermoeidheid en frisheid">
        {now && (
          <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] tabular-nums text-ink-muted">
            <span>Fitheid nu <b className="text-ink">{Math.round(now.ctl)}</b></span>
            <span>Vermoeidheid <b className="text-ink">{Math.round(now.atl)}</b></span>
            <span>Vorm <b className="text-ink">{now.tsb > 0 ? "+" : ""}{Math.round(now.tsb)}</b></span>
            {peakCtl && <span>Piek fitheid in periode {Math.round(peakCtl.ctl)} op {fmtDate(peakCtl.date)}</span>}
          </div>
        )}
        <TimeChart
          {...shared}
          ariaLabel="Fitheid, vermoeidheid en vorm"
          height={260}
          baseline={0}
          format={(v) => String(Math.round(v))}
          maOptions={DAILY_MA}
          storageKey="trends-form"
          markers={races}
          series={[
            { key: "ctl", label: "Fitheid", colour: "var(--chart-1)", width: 2.25, peak: "max", points: t.form.map((r) => ({ d: r.date, v: r.ctl })) },
            { key: "atl", label: "Vermoeidheid", colour: "var(--chart-3)", points: t.form.map((r) => ({ d: r.date, v: r.atl })) },
            { key: "tsb", label: "Vorm", colour: "var(--chart-4)", dash: "dashed", ma: true, points: t.form.map((r) => ({ d: r.date, v: r.tsb })) },
          ]}
        />
        <p className="mt-2 text-[11.5px] text-ink-muted">Belasting per training = TRIMP uit gemiddelde hartslag. Fitheid is het 42-daags gemiddelde, vermoeidheid 7 dagen, vorm het verschil. Het gemiddelde geldt voor de vorm; ruitjes zijn wedstrijden en tests.</p>
      </Card>

      <Card title="Volume per week" action={<Tabs variant="segmented" items={[{ id: "hours", label: "Uren" }, { id: "km", label: "Km" }]} value={metric} onChange={(v) => setMetric(v as "hours" | "km")} ariaLabel="Eenheid" />}>
        <p className="mb-2 text-[12.5px] tabular-nums text-ink-muted">
          Gemiddeld <b className="text-ink">{fmtVol(volume.avg)}</b> per week over {Math.max(1, Math.round(windowDays(win) / 7))} weken
        </p>
        <TimeChart
          {...shared}
          ariaLabel="Volume per week per sport"
          height={220}
          format={fmtVol}
          maOptions={WEEKLY_MA}
          storageKey="trends-volume"
          totalLabel="Totaal"
          series={volume.series}
        />
      </Card>

      <ZonesOverTime window={win} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tempo in Z2 (hardlopen)">
          <TrendChart {...shared} label="Tempo in Z2" points={z2} format={(v) => fmtClock(v)} unit="/km" lowerIsBetter clock maOptions={WEEKLY_MA} storageKey="trends-z2" />
          <p className="mt-2 text-[11.5px] text-ink-muted">Gemiddeld tempo van alle seconden in Z2 per week, losse runs buiten (geen loopband, geen run na zwemmen of fietsen). Sneller bij dezelfde hartslag = betere aerobe basis.</p>
        </Card>
        <Card title="VO2max (Garmin)">
          <TrendChart {...shared} label="VO2max" points={vo2} format={(v) => v.toFixed(0)} maOptions={DAILY_MA} storageKey="trends-vo2" />
          <p className="mt-2 text-[11.5px] text-ink-muted">Schatting van het horloge na buitenruns met GPS en hartslag.</p>
        </Card>
      </div>

      <Card title={daily ? "Herstel per dag" : "Herstel per week"}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">Rusthartslag</h3>
            <TrendChart label="Rusthartslag" {...shared} maOptions={recoveryMa} maDefault={daily ? 7 : 0} storageKey="trends-rhr" points={series("resting_hr")} format={(v) => v.toFixed(0)} unit=" bpm" lowerIsBetter height={140} colour="var(--chart-6)" />
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">Slaap</h3>
            <TrendChart label="Slaap" {...shared} maOptions={recoveryMa} maDefault={daily ? 7 : 0} storageKey="trends-sleep" points={series("sleep_h")} format={(v) => v.toFixed(1).replace(".", ",")} unit=" u" height={140} colour="var(--chart-5)" />
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">Body Battery (hoogste van de dag)</h3>
            <TrendChart label="Body Battery" {...shared} maOptions={recoveryMa} maDefault={daily ? 7 : 0} storageKey="trends-bb" points={series("body_battery_high")} format={(v) => v.toFixed(0)} height={140} colour="var(--chart-1)" />
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">Stress</h3>
            <TrendChart label="Stress" {...shared} maOptions={recoveryMa} maDefault={daily ? 7 : 0} storageKey="trends-stress" points={series("stress_avg")} format={(v) => v.toFixed(0)} lowerIsBetter height={140} colour="var(--chart-4)" />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Records (snelste stuk in een run)">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="text-left text-[11.5px] text-ink-muted">
                <th className="pb-2 font-normal">Afstand</th>
                <th className="pb-2 font-normal">Tijd</th>
                <th className="pb-2 font-normal">Tempo</th>
                <th className="pb-2 font-normal">Datum</th>
                <th className="pb-2 font-normal">Verbeterd</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(RECORD_LABEL) as (keyof Trends["records"])[]).map((k) => {
                const rows = t.records[k] ?? [];
                const best = rows[rows.length - 1];
                const km = { "1k": 1, "5k": 5, "10k": 10, "21k": 21.0975 }[k];
                return (
                  <tr key={k} className="border-t border-border">
                    <td className="py-2">{RECORD_LABEL[k]}</td>
                    <td className="py-2 font-medium">{best ? fmtClock(best.seconds) : "–"}</td>
                    <td className="py-2 text-ink-muted">{best ? `${fmtClock(best.seconds / km)}/km` : "–"}</td>
                    <td className="py-2">{best ? <Link className="underline underline-offset-2" href={href(best.activity_id)}>{fmtDay(best.date)}</Link> : "–"}</td>
                    <td className="py-2 text-ink-muted" title={rows.map((r) => `${r.date}: ${fmtClock(r.seconds)}`).join("\n")}>{rows.length}×</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-ink-muted">Garmins snelste split binnen een run, geen officiële wedstrijdtijd. Houd de muis op "verbeterd" voor de hele reeks.</p>
          {recordSeries.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-1 text-[12.5px] font-medium">Verloop van de records (tempo per km)</h3>
              <TimeChart {...shared} ariaLabel="Verloop van de records" height={170} invert clock format={(v) => fmtClock(v)} unit="/km" series={recordSeries} empty="Nog geen records." />
            </div>
          )}
        </Card>

        <Card title="Wedstrijden en tests">
          {t.races.length === 0 ? (
            <p className="text-[13px] text-ink-muted">Nog geen wedstrijden herkend.</p>
          ) : (
            <ul className="flex flex-col">
              {[...t.races].reverse().map((r) => (
                <li key={r.date + r.name} className="grid grid-cols-[1fr_auto] gap-2 border-t border-border py-2 text-[13px] first:border-t-0">
                  <Link href={href(r.activity_ids[r.activity_ids.length - 1])} className="hover:underline">
                    <span className="font-medium">{r.name}</span> <span className="text-ink-muted">· {fmtDay(r.date)}</span>
                  </Link>
                  <span className="tabular-nums text-ink-muted">{fmtKm(r.distance_km)} · {fmtClock(r.seconds)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11.5px] text-ink-muted">Herkend aan zwemmen + fietsen + lopen op één dag, een naam met race, benchmark, marathon, of een run van 5+ km met 85%+ in Z4-Z5. Tijd is bewegende tijd zonder wissels.</p>
        </Card>
      </div>
    </div>
  );
}
