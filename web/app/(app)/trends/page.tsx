"use client";

// Trends: vorm (fitheid/vermoeidheid/vorm), volume per week per sport, tijd per zone over tijd, Z2-tempo, VO2max, herstel,
// records en wedstrijden. Elke reeks met een trendlijn en de piek in de kop.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Tabs } from "@/components/ds";
import LineChart from "@/components/charts/LineChart";
import Bars, { type BarDatum } from "@/components/charts/Bars";
import TrendChart from "@/components/charts/TrendChart";
import ZonesOverTime from "@/components/zones/ZonesOverTime";
import { api } from "@/lib/api";
import { type Trends, fmtClock, fmtKm, sportLabel } from "@/lib/training";

const RANGES = [
  { id: "90", label: "3M" },
  { id: "182", label: "6M" },
  { id: "365", label: "1J" },
  { id: "all", label: "Alles" },
];

const SPORT_COLOUR: Record<string, string> = { run: "var(--chart-1)", ride: "var(--chart-4)", swim: "var(--chart-3)" };
const RECORD_LABEL: Record<string, string> = { "1k": "1 km", "5k": "5 km", "10k": "10 km", "21k": "Halve marathon" };
const href = (id: string) => `/historie/activiteit/?id=${encodeURIComponent(id)}`;
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

function since(range: string, today: string) {
  if (range === "all") return "";
  const d = new Date(today + "T12:00:00");
  d.setDate(d.getDate() - Number(range));
  return d.toISOString().slice(0, 10);
}

export default function TrendsPage() {
  const [range, setRange] = useState("182");
  const [metric, setMetric] = useState<"hours" | "km">("hours");
  const q = useQuery({ queryKey: ["trends"], queryFn: () => api.get<Trends>("/api/trends") });

  const t = q.data;
  const from = t ? since(range, t.today) : "";
  const inRange = <T extends { date?: string; week?: string }>(rows: T[]) => rows.filter((r) => !from || (r.date ?? r.week ?? "") >= from);

  const volume = useMemo(() => {
    if (!t) return { bars: [] as BarDatum[], sports: [] as string[] };
    const weeks = t.weekly.filter((w) => !from || w.week >= from).slice(range === "all" ? -104 : undefined);
    const main = ["run", "ride", "swim"];
    const every = Math.max(1, Math.ceil(weeks.length / 8));
    const bars = weeks.map((w, i) => {
      const other = Object.entries(w.sports).filter(([s]) => !main.includes(s));
      const val = (v: { km: number; seconds: number }) => (metric === "hours" ? v.seconds / 3600 : v.km);
      const segments = main.filter((s) => w.sports[s]).map((s) => ({ key: s, value: val(w.sports[s]), colour: SPORT_COLOUR[s] }));
      const otherVal = other.reduce((s, [, v]) => s + val(v), 0);
      if (otherVal > 0 && metric === "hours") segments.push({ key: "other", value: otherVal, colour: "var(--chart-5)" });
      const label = (weeks.length - 1 - i) % every === 0 ? new Date(w.week + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "";
      return { key: w.week, label, title: `Week van ${fmtDay(w.week)}`, segments };
    });
    return { bars, sports: [...main, ...(metric === "hours" ? ["other"] : [])] };
  }, [t, from, range, metric]);

  if (q.isLoading) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!t) return <p className="text-sm text-ink-muted">Kon de trends niet laden.</p>;

  const form = inRange(t.form);
  const peakCtl = form.length ? form.reduce((b, r) => (r.ctl > b.ctl ? r : b), form[0]) : null;
  const now = t.form[t.form.length - 1];
  const fmtVol = (v: number) => (metric === "hours" ? `${fmtClock(v * 3600).replace(/:\d\d$/, "")} u` : fmtKm(v));
  const totalVol = volume.bars.reduce((s, b) => s + b.segments.reduce((x, g) => x + g.value, 0), 0);

  const z2 = inRange(t.z2_pace).map((r) => ({ d: r.week, v: r.pace_s_per_km }));
  const vo2 = inRange(t.vo2max).map((r) => ({ d: r.date, v: r.value }));
  const rec = inRange(t.recovery_weekly);
  const series = (key: "resting_hr" | "sleep_h" | "body_battery_high" | "stress_avg") => rec.filter((r) => r[key] != null).map((r) => ({ d: r.week, v: r[key] as number }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] text-ink-muted">Periode voor alle grafieken</p>
        <Tabs variant="quiet" items={RANGES} value={range} onChange={setRange} ariaLabel="Periode" />
      </div>

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
        {now && peakCtl && (
          <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] tabular-nums text-ink-muted">
            <span>Fitheid nu <b className="text-ink">{Math.round(now.ctl)}</b></span>
            <span>Vermoeidheid <b className="text-ink">{Math.round(now.atl)}</b></span>
            <span>Vorm <b className="text-ink">{now.tsb > 0 ? "+" : ""}{Math.round(now.tsb)}</b></span>
            <span>Piek fitheid in periode {Math.round(peakCtl.ctl)} op {fmtDay(peakCtl.date)}</span>
          </div>
        )}
        <LineChart
          ariaLabel="Fitheid, vermoeidheid en vorm"
          height={240}
          baseline={0}
          format={(v) => String(Math.round(v))}
          xFormat={(d) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "2-digit" })}
          series={[
            { label: "Fitheid", colour: "var(--chart-1)", width: 2, points: form.map((r) => ({ d: r.date, v: r.ctl })) },
            { label: "Vermoeid", colour: "var(--chart-3)", points: form.map((r) => ({ d: r.date, v: r.atl })) },
            { label: "Vorm", colour: "var(--chart-4)", dash: "dashed", points: form.map((r) => ({ d: r.date, v: r.tsb })) },
          ]}
        />
        <p className="mt-2 text-[11.5px] text-ink-muted">Belasting per training = TRIMP uit gemiddelde hartslag. Fitheid is het 42-daags gemiddelde, vermoeidheid 7 dagen, vorm het verschil.</p>
      </Card>

      <Card title="Volume per week" action={<Tabs variant="segmented" items={[{ id: "hours", label: "Uren" }, { id: "km", label: "Km" }]} value={metric} onChange={(v) => setMetric(v as "hours" | "km")} ariaLabel="Eenheid" />}>
        <Bars
          bars={volume.bars}
          ariaLabel="Volume per week per sport"
          format={fmtVol}
          maxBarWidth={28}
          summary={volume.bars.length ? `gemiddeld ${fmtVol(totalVol / volume.bars.length)} per week` : ""}
          legend={volume.sports.map((s) => ({ key: s, label: s === "other" ? "Overig" : sportLabel(s), colour: SPORT_COLOUR[s] ?? "var(--chart-5)" }))}
        />
      </Card>

      <ZonesOverTime />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tempo in Z2 (hardlopen)">
          <TrendChart label="Tempo in Z2" points={z2} format={(v) => fmtClock(v)} unit="/km" lowerIsBetter />
          <p className="mt-2 text-[11.5px] text-ink-muted">Gemiddeld tempo van alle seconden in Z2 per week, losse runs buiten (geen loopband, geen run na zwemmen of fietsen). Sneller bij dezelfde hartslag = betere aerobe basis.</p>
        </Card>
        <Card title="VO2max (Garmin)">
          <TrendChart label="VO2max" points={vo2} format={(v) => v.toFixed(0)} />
          <p className="mt-2 text-[11.5px] text-ink-muted">Schatting van het horloge na buitenruns met GPS en hartslag.</p>
        </Card>
      </div>

      <Card title="Herstel per week">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">Rusthartslag</h3>
            <TrendChart label="Rusthartslag" points={series("resting_hr")} format={(v) => v.toFixed(0)} unit=" bpm" lowerIsBetter height={140} colour="var(--chart-6)" />
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">Slaap</h3>
            <TrendChart label="Slaap" points={series("sleep_h")} format={(v) => v.toFixed(1).replace(".", ",")} unit=" u" height={140} colour="var(--chart-5)" />
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">Body Battery (hoogste van de dag)</h3>
            <TrendChart label="Body Battery" points={series("body_battery_high")} format={(v) => v.toFixed(0)} height={140} colour="var(--chart-1)" />
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">Stress</h3>
            <TrendChart label="Stress" points={series("stress_avg")} format={(v) => v.toFixed(0)} lowerIsBetter height={140} colour="var(--chart-4)" />
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
