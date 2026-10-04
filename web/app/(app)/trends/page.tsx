"use client";

// Trends: inzichten (op het eigen doel uit het schema), vorm, volume per week per sport, tijd per zone over tijd,
// Z2-tempo, VO2max, langste run per week, herstel (met HRV als die er is), slaap tegen belasting, records en
// wedstrijden.
//
// Eén tijdvenster voor de hele pagina (TimeFilterBar, plakt onder de bovenbalk; staat in de adresbalk), en één
// sportfilter (ook in de adresbalk). Elke grafiek deelt die tijdas; schuiven of zoomen in één grafiek verzet het
// venster voor alle. Hardloopkaarten (tempo, records, voorspellingen) staan er alleen bij "Alle sporten" of
// "Hardlopen". Alle tekst komt uit lib/texts.ts (T.trends).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Select, Tabs } from "@/components/ds";
import TimeChart, { DAILY_MA, WEEKLY_MA, type ChartSeries } from "@/components/charts/TimeChart";
import TrendChart from "@/components/charts/TrendChart";
import TimeFilterBar from "@/components/timefilter/TimeFilterBar";
import { useTimeRange } from "@/components/timefilter/useTimeRange";
import RecordTable from "@/components/trends/RecordTable";
import SleepLoad from "@/components/trends/SleepLoad";
import { ALL_SPORTS, useSportFilter } from "@/components/trends/useSportFilter";
import ZonesOverTime from "@/components/zones/ZonesOverTime";
import { api } from "@/lib/api";
import { T } from "@/lib/texts";
import { fmtDate } from "@/lib/timeline";
import { type RecordKey, type TrendsPlus, fmtClock, fmtKm, sportLabel } from "@/lib/training";

type RecoveryKey = "resting_hr" | "sleep_h" | "body_battery_high" | "stress_avg" | "hrv";

const TT = T.trends;
const MAIN = ["run", "ride", "swim"];
const SPORT_COLOUR: Record<string, string> = { run: "var(--chart-1)", ride: "var(--chart-4)", swim: "var(--chart-3)" };
const RECORD_COLOUR: Record<RecordKey, string> = { "1k": "var(--chart-4)", "5k": "var(--chart-1)", "10k": "var(--chart-3)", "21k": "var(--chart-5)" };
const href = (id: string) => `/historie/activiteit/?id=${encodeURIComponent(id)}`;
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const dec = (v: number, digits = 1) => v.toFixed(digits).replace(".", ",");
const levelColour = (level: string) => (level === "goed" ? "var(--zone-2)" : level === "let_op" ? "var(--zone-4)" : "var(--zone-1)");

export default function TrendsPage() {
  const [metric, setMetric] = useState<"hours" | "km">("hours");
  const q = useQuery({ queryKey: ["trends"], queryFn: () => api.get<TrendsPlus>("/api/trends") });
  const { sport, choose: chooseSport, all } = useSportFilter();

  const t = q.data;
  // Het venster loopt van de eerste meting (welke reeks ook) tot vandaag.
  const first = useMemo(() => {
    if (!t) return "";
    const starts = [t.form[0]?.date, t.weekly[0]?.week, t.z2_pace[0]?.week, t.vo2max[0]?.date, t.recovery_daily?.[0]?.date, t.recovery_weekly[0]?.week, t.longest_runs?.[0]?.week].filter(Boolean) as string[];
    return starts.length ? starts.sort()[0] : t.today;
  }, [t]);
  const last = t?.today ?? "";
  const range = useTimeRange(first, last);
  const win = range.window;
  const from = win.from;
  const shared = { window: win, domain: { from: first, to: last }, onWindow: range.change, onReset: range.reset };

  // Sporten met data, de drie hoofdsporten eerst.
  const sports = useMemo(() => {
    const seen = new Set<string>();
    for (const w of t?.weekly ?? []) for (const s of Object.keys(w.sports)) seen.add(s);
    return [...MAIN.filter((s) => seen.has(s)), ...[...seen].filter((s) => !MAIN.includes(s)).sort()];
  }, [t]);
  const running = all || sport === "run";

  const volume = useMemo(() => {
    if (!t) return { series: [] as ChartSeries[], avg: 0, weeks: 0 };
    const val = (v: { km: number; seconds: number }) => (metric === "hours" ? v.seconds / 3600 : v.km);
    const one = (s: string): ChartSeries => ({
      key: s,
      label: sportLabel(s),
      colour: SPORT_COLOUR[s] ?? "var(--chart-5)",
      kind: "bar",
      ma: true,
      points: t.weekly.map((w) => ({ d: w.week, v: w.sports[s] ? val(w.sports[s]) : 0 })),
    });
    const series: ChartSeries[] = all ? MAIN.map(one) : [one(sport)];
    if (all && metric === "hours") {
      series.push({
        key: "other",
        label: TT.volume.other,
        colour: "var(--chart-5)",
        kind: "bar",
        ma: true,
        points: t.weekly.map((w) => ({ d: w.week, v: Object.entries(w.sports).filter(([s]) => !MAIN.includes(s)).reduce((sum, [, v]) => sum + val(v), 0) })),
      });
    }
    // Gemiddelde per week over de hele weken in het venster: de lopende week telt niet mee (die is nog niet af
    // en zou het gemiddelde omlaag trekken), en het aantal weken is wat er echt is, niet de vensterbreedte / 7.
    const monday = (() => {
      const d = new Date(t.today + "T12:00:00");
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const counts = (s: string) => (all ? metric === "hours" || MAIN.includes(s) : s === sport);
    const weeks = t.weekly.filter((w) => w.week >= from && w.week <= win.to && w.week < monday);
    const total = weeks.reduce((sum, w) => sum + Object.entries(w.sports).filter(([s]) => counts(s)).reduce((x, [, v]) => x + val(v), 0), 0);
    return { series, avg: weeks.length ? total / weeks.length : 0, weeks: weeks.length };
  }, [t, from, win.to, metric, all, sport]);

  if (q.isLoading) return <p className="text-sm text-ink-muted">{TT.loading}</p>;
  if (!t) return <p className="text-sm text-ink-muted">{TT.loadError}</p>;

  const inRange = <R extends { date?: string; week?: string }>(rows: R[]) => rows.filter((r) => (r.date ?? r.week ?? "") >= win.from && (r.date ?? r.week ?? "") <= win.to);
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
  const longest = (t.longest_runs ?? []).map((r) => ({ d: r.week, v: r.km }));
  const flags = t.hr_flags ?? [];
  const flagsInView = inRange(flags);
  const reasonText = (reasons: string[]) => reasons.map((r) => TT.hrReason[r as keyof typeof TT.hrReason] ?? r).join("; ");
  const flagMarkers = flags.map((f) => ({ d: f.date, label: TT.z2.marker(reasonText(f.reasons)) }));

  const recovery = t.recovery_daily ?? [];
  const daily = recovery.length > 0;
  const series = (key: RecoveryKey) =>
    daily
      ? recovery.filter((r) => r[key] != null).map((r) => ({ d: r.date, v: r[key] as number }))
      : t.recovery_weekly.filter((r) => r[key] != null).map((r) => ({ d: r.week, v: r[key] as number }));
  const recoveryMa = daily ? DAILY_MA : WEEKLY_MA;
  const hrv = series("hrv");
  const hasSleep = recovery.some((r) => r.sleep_h != null);

  const raceName = (r: TrendsPlus["races"][number]) => (r.sport === "triathlon" ? TT.races.triathlon : r.detected === "hartslag" ? TT.races.byHeartRate(r.name) : r.name);
  const races = t.races.filter((r) => all || r.sport === sport);
  const raceMarkers = races.map((r) => ({ d: r.date, label: raceName(r) }));
  const hasRecords = Object.values(t.records).some((rows) => rows.length > 0);
  const raceRecord = Object.values(t.records).some((rows) => rows.some((r) => r.source === "race"));
  const predictDays = t.rules?.predict_days ?? 180;
  const p42 = t.predictions["42k"];

  return (
    <div className="flex flex-col gap-4">
      <TimeFilterBar range={range} first={first} last={last} overview={t.form.map((r) => ({ d: r.date, v: r.ctl }))} />

      {sports.length > 1 && (
        <div className="-mt-2 flex flex-wrap items-center justify-end gap-2">
          <Select aria-label={TT.sport.label} value={sport} onChange={(e) => chooseSport(e.target.value)} className="!h-[32px] !w-auto min-w-[9rem]">
            <option value={ALL_SPORTS}>{TT.sport.all}</option>
            {(sports.includes(sport) || all ? sports : [...sports, sport]).map((s) => (
              <option key={s} value={s}>{sportLabel(s)}</option>
            ))}
          </Select>
        </div>
      )}

      <div className={`grid gap-4 ${running ? "lg:grid-cols-[1fr_1fr]" : ""}`}>
        <Card title={TT.insights.title}>
          {t.insights.length === 0 ? (
            <p className="text-[13px] text-ink-muted">{t.form.length ? TT.insights.none : TT.insights.empty}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {t.insights.map((i, n) => {
                const { title, text } = TT.insight(i);
                return (
                  <li key={i.code + n} className="flex gap-3 text-[13px]">
                    <span className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full" style={{ background: levelColour(i.level) }} />
                    <span><span className="font-medium">{title}.</span> <span className="text-ink-muted">{text}</span></span>
                  </li>
                );
              })}
            </ul>
          )}
          {t.form.length > 0 && <p className="mt-3 text-[11.5px] text-ink-muted">{t.goal ? TT.insights.goal(t.goal.text) : TT.insights.noGoal}</p>}
        </Card>
        {running && (
          <Card title={TT.predictions.title}>
            {Object.keys(t.predictions).length === 0 ? (
              <p className="text-[13px] text-ink-muted">{TT.predictions.none(predictDays)}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                  {(["5k", "10k", "21k", "42k"] as const).map((k) => {
                    const p = t.predictions[k];
                    return (
                      <div key={k} className="flex flex-col">
                        <span className="text-[11.5px] text-ink-muted">{TT.predictions.label[k]}</span>
                        <span className="whitespace-nowrap font-display text-[19px] leading-tight tabular-nums xl:text-[21px]">{p ? fmtClock(p.seconds) : "–"}</span>
                        {p && <span className="text-[11px] tabular-nums text-ink-muted">{fmtClock(p.pace_s_per_km)}/km</span>}
                        {p && (
                          <Link className="text-[11px] tabular-nums text-ink-muted underline-offset-2 hover:underline" href={href(p.from.activity_id)} title={TT.predictions.fromTitle(fmtKm(p.from.km), fmtClock(p.from.seconds), fmtDay(p.from.date))}>
                            {TT.predictions.from(fmtKm(p.from.km))}
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
                {p42 && (
                  <p className="mt-3 text-[11.5px] text-ink-muted">
                    {TT.predictions.basedOn}{" "}
                    <Link className="underline underline-offset-2" href={href(p42.from.activity_id)}>
                      {TT.predictions.fromTitle(fmtKm(p42.from.km), fmtClock(p42.from.seconds), fmtDay(p42.from.date))}
                    </Link>
                    . {T.prediction(predictDays)}
                  </p>
                )}
              </>
            )}
          </Card>
        )}
      </div>

      <Card title={TT.form.title}>
        {now && (
          <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] tabular-nums text-ink-muted">
            <span>{TT.form.fitnessNow} <b className="text-ink">{Math.round(now.ctl)}</b></span>
            <span>{TT.form.fatigue} <b className="text-ink">{Math.round(now.atl)}</b></span>
            <span>{TT.form.form} <b className="text-ink">{now.tsb > 0 ? "+" : ""}{Math.round(now.tsb)}</b></span>
            {peakCtl && <span>{TT.form.peak(Math.round(peakCtl.ctl), fmtDate(peakCtl.date))}</span>}
          </div>
        )}
        <TimeChart
          {...shared}
          ariaLabel={TT.form.title}
          height={260}
          baseline={0}
          format={(v) => String(Math.round(v))}
          maOptions={DAILY_MA}
          storageKey="trends-form"
          markers={raceMarkers}
          series={[
            { key: "ctl", label: TT.form.fitness, colour: "var(--chart-1)", width: 2.25, peak: "max", points: t.form.map((r) => ({ d: r.date, v: r.ctl })) },
            { key: "atl", label: TT.form.fatigue, colour: "var(--chart-3)", points: t.form.map((r) => ({ d: r.date, v: r.atl })) },
            { key: "tsb", label: TT.form.form, colour: "var(--chart-4)", dash: "dashed", ma: true, points: t.form.map((r) => ({ d: r.date, v: r.tsb })) },
          ]}
        />
        {t.stopped_at_sync && t.form_until && <p className="mt-2 text-[12px] text-ink-muted">{TT.form.stopped(fmtDate(t.form_until))}</p>}
        <p className="mt-2 text-[11.5px] text-ink-muted">{T.formMethod} {T.formChartNote}</p>
      </Card>

      <Card title={TT.volume.title} action={<Tabs variant="segmented" items={[{ id: "hours", label: TT.volume.hours }, { id: "km", label: TT.volume.km }]} value={metric} onChange={(v) => setMetric(v as "hours" | "km")} ariaLabel={TT.volume.unit} />}>
        {t.weekly.length > 0 && (
          <p className="mb-2 text-[12.5px] tabular-nums text-ink-muted">{volume.weeks > 0 ? TT.volume.avg(fmtVol(volume.avg), volume.weeks) : TT.volume.noWholeWeek}</p>
        )}
        <TimeChart {...shared} ariaLabel={TT.volume.aria} height={220} format={fmtVol} maOptions={WEEKLY_MA} storageKey="trends-volume" totalLabel={TT.volume.total} series={volume.series} />
      </Card>

      <ZonesOverTime window={win} sport={sport} />

      {running ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={TT.z2.title}>
              <TrendChart {...shared} label={TT.z2.label} points={z2} format={(v) => fmtClock(v)} unit="/km" lowerIsBetter clock maOptions={WEEKLY_MA} storageKey="trends-z2" markers={flagMarkers} />
              <p className="mt-2 text-[11.5px] text-ink-muted">{T.z2Pace}</p>
              {flagsInView.length > 0 && (
                <details className="mt-2 text-[11.5px] text-ink-muted">
                  <summary className="cursor-pointer">{TT.z2.excluded(flagsInView.length)}</summary>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {flagsInView.map((f) => (
                      <li key={f.id}>
                        <Link className="underline underline-offset-2" href={href(f.id)}>{fmtDay(f.date)}{f.name ? ` · ${f.name}` : ""}</Link>: {reasonText(f.reasons)}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5">{TT.hrMethod}</p>
                </details>
              )}
            </Card>
            <Card title={TT.vo2.title}>
              <TrendChart {...shared} label={TT.vo2.label} points={vo2} format={(v) => v.toFixed(0)} maOptions={DAILY_MA} storageKey="trends-vo2" />
              <p className="mt-2 text-[11.5px] text-ink-muted">{T.vo2max}</p>
            </Card>
          </div>

          <Card title={TT.longest.title}>
            <TrendChart {...shared} label={TT.longest.label} points={longest} format={(v) => dec(v)} unit=" km" maOptions={WEEKLY_MA} storageKey="trends-longest" colour="var(--chart-3)" />
            <p className="mt-2 text-[11.5px] text-ink-muted">{TT.longest.note}</p>
          </Card>
        </>
      ) : (
        <p className="text-[12.5px] text-ink-muted">{TT.sport.runOnly}</p>
      )}

      <Card title={daily ? TT.recovery.titleDay : TT.recovery.titleWeek}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">{TT.recovery.rhr}</h3>
            <TrendChart label={TT.recovery.rhr} {...shared} maOptions={recoveryMa} maDefault={daily ? 7 : 0} storageKey="trends-rhr" points={series("resting_hr")} format={(v) => v.toFixed(0)} unit=" bpm" lowerIsBetter height={140} colour="var(--chart-6)" />
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">{TT.recovery.sleep}</h3>
            <TrendChart label={TT.recovery.sleep} {...shared} maOptions={recoveryMa} maDefault={daily ? 7 : 0} storageKey="trends-sleep" points={series("sleep_h")} format={(v) => dec(v)} unit=" u" height={140} colour="var(--chart-5)" />
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">{TT.recovery.bb}</h3>
            <TrendChart label={TT.recovery.bbShort} {...shared} maOptions={recoveryMa} maDefault={daily ? 7 : 0} storageKey="trends-bb" points={series("body_battery_high")} format={(v) => v.toFixed(0)} height={140} colour="var(--chart-1)" />
          </div>
          <div>
            <h3 className="mb-1 text-[12.5px] font-medium">{TT.recovery.stress}</h3>
            <TrendChart label={TT.recovery.stress} {...shared} maOptions={recoveryMa} maDefault={daily ? 7 : 0} storageKey="trends-stress" points={series("stress_avg")} format={(v) => v.toFixed(0)} lowerIsBetter height={140} colour="var(--chart-4)" />
          </div>
          {hrv.length > 0 && (
            <div>
              <h3 className="mb-1 text-[12.5px] font-medium">{TT.recovery.hrv}</h3>
              <TrendChart label={TT.recovery.hrv} {...shared} maOptions={recoveryMa} maDefault={daily ? 7 : 0} storageKey="trends-hrv" points={hrv} format={(v) => v.toFixed(0)} unit=" ms" height={140} colour="var(--chart-3)" />
              <p className="mt-2 text-[11.5px] text-ink-muted">{TT.recovery.hrvNote}</p>
            </div>
          )}
        </div>
      </Card>

      {hasSleep && t.form.length > 0 && (
        <Card title={TT.sleepLoad.title}>
          <SleepLoad form={t.form} recovery={recovery} window={win} today={t.today} />
        </Card>
      )}

      {/* Records over de hele breedte: het verloop per afstand heeft ruimte nodig. */}
      <div className="grid gap-4">
        {running && (
          <Card title={TT.records.title}>
            {!hasRecords ? (
              <p className="text-[13px] text-ink-muted">{TT.records.empty}</p>
            ) : (
              <RecordTable records={t.records} recent={t.recent_records ?? []} window={win} recentDays={t.rules?.recent_record_days ?? 14} href={href} colours={RECORD_COLOUR} />
            )}
            <p className="mt-2 text-[11.5px] text-ink-muted">
              {TT.records.method}
              {raceRecord ? ` ${TT.records.raceRule(t.rules?.race_short_pct ?? 2)}` : ""}
              {hasRecords ? ` ${TT.records.progressNote}` : ""}
            </p>
          </Card>
        )}

        <Card title={TT.races.title}>
          {races.length === 0 ? (
            <p className="text-[13px] text-ink-muted">{TT.races.none}</p>
          ) : (
            <ul className="flex flex-col">
              {[...races].reverse().map((r) => (
                <li key={r.date + r.name + r.activity_ids[0]} className="grid grid-cols-[1fr_auto] gap-2 border-t border-border py-2 text-[13px] first:border-t-0">
                  <Link href={href(r.activity_ids[r.activity_ids.length - 1])} className="hover:underline">
                    <span className="font-medium">{raceName(r)}</span> <span className="text-ink-muted">· {fmtDay(r.date)}</span>
                  </Link>
                  <span className="tabular-nums text-ink-muted">{fmtKm(r.distance_km)} · {fmtClock(r.seconds)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11.5px] text-ink-muted">{T.races(t.rules ?? { race_min_km: 5, race_hard_pct: 85 })}</p>
        </Card>
      </div>
    </div>
  );
}
