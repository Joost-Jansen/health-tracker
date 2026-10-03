"use client";

// Eén activiteit: kaart gekleurd per zone, hartslag/tempo/hoogte, tijd per zone, kilometers en ronden,
// en wat de data erover zegt (drift, vergelijking met eerdere keren op hetzelfde rondje, meerkamp op die dag).
// Statische export: het id staat in de query (?id=...), niet in het pad.

import { Suspense, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import ZoneBar from "@/components/ZoneBar";
import StreamChart from "@/components/charts/StreamChart";
import LineChart from "@/components/charts/LineChart";
import { api } from "@/lib/api";
import { T } from "@/lib/texts";
import { SportBadge } from "@/components/plan/SportIcon";
import { type ActivityDetail, fmtClock, fmtDate, fmtDuration, fmtIntensity, fmtKm, fmtPaceS, sportLabel, zoneShare } from "@/lib/training";

const ActivityMap = dynamic(() => import("@/components/map/ActivityMap"), { ssr: false, loading: () => <div className="h-[360px] animate-pulse rounded bg-[var(--surface-inset)]" /> });

const href = (id: string) => `/historie/activiteit/?id=${encodeURIComponent(id)}`;

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11.5px] text-ink-muted">{label}</span>
      <span className="font-display text-[21px] leading-tight tabular-nums">{value}</span>
      {note && <span className="text-[11px] text-ink-muted">{note}</span>}
    </div>
  );
}

function Insights({ a }: { a: ActivityDetail }) {
  const items: { title: string; text: string; tone?: "good" | "warn" }[] = [];
  const multi = a.same_day.filter((x) => ["swim", "ride", "run"].includes(x.sport) && x.start_local < a.start_local);
  if (a.sport === "run" && multi.some((x) => x.sport !== "run")) {
    items.push({ title: "Na zwemmen of fietsen", text: T.afterMultisport(multi.map((x) => x.sport)), tone: "warn" });
  }
  if (a.decoupling_pct != null) {
    const d = a.decoupling_pct;
    items.push(
      d <= 5
        ? { title: `Drift ${d.toLocaleString("nl-NL")}%`, text: T.driftGood, tone: "good" }
        : { title: `Drift ${d.toLocaleString("nl-NL")}%`, text: T.driftHigh, tone: "warn" },
    );
  }
  const hist = a.route?.history.filter((r) => r.pace_s_per_km) ?? [];
  if (a.route && hist.length >= 2) {
    const me = hist.find((r) => r.id === a.id);
    const others = hist.filter((r) => r.id !== a.id);
    const sorted = [...hist].sort((x, y) => x.pace_s_per_km! - y.pace_s_per_km!);
    const rank = me ? sorted.findIndex((r) => r.id === a.id) + 1 : null;
    const avgHr = others.filter((r) => r.avg_hr).map((r) => r.avg_hr!);
    const hrText = me?.avg_hr && avgHr.length ? ` Hartslag ${me.avg_hr} tegen gemiddeld ${Math.round(avgHr.reduce((s, v) => s + v, 0) / avgHr.length)} op dit rondje.` : "";
    if (rank) items.push({ title: `${rank}e van ${hist.length} op dit rondje`, text: `Snelste keer ${fmtPaceS(sorted[0].pace_s_per_km)} op ${fmtDate(sorted[0].date)}.${hrText}` });
  }
  const bounds = a.zone_bounds;
  const z = a.hr_zones_s;
  if (z && bounds) {
    const total = Object.values(z).reduce((s, v) => s + v, 0);
    const easy = total ? ((z.Z1 + z.Z2) / total) * 100 : 0;
    if (total > 1200 && easy >= 80) items.push({ title: "Rustige duurtraining", text: T.easySession(Math.round(easy), bounds[1]), tone: "good" });
    else if (total > 1200 && (z.Z4 + z.Z5) / total >= 0.25) items.push({ title: "Zware training", text: T.hardSession(Math.round(((z.Z4 + z.Z5) / total) * 100)) });
  }
  if (!items.length) return null;
  return (
    <Card title="Wat de data zegt">
      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.title} className="flex gap-3 text-[13px]">
            <span className="mt-1.5 inline-block h-2 w-2 flex-none rounded-full" style={{ background: i.tone === "good" ? "var(--zone-2)" : i.tone === "warn" ? "var(--zone-4)" : "var(--zone-1)" }} />
            <span>
              <span className="font-medium">{i.title}.</span> <span className="text-ink-muted">{i.text}</span>
            </span>
          </li>
        ))}
      </ul>
      {a.decoupling_pct != null && <p className="mt-3 text-[11.5px] text-ink-muted">{T.driftMethod}</p>}
    </Card>
  );
}

function Detail({ id }: { id: string }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["activity", id], queryFn: () => api.get<ActivityDetail>(`/api/activities/${encodeURIComponent(id)}`) });
  if (q.isLoading) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!q.data) return <p className="text-sm text-ink-muted">Activiteit niet gevonden.</p>;
  const a = q.data;
  const share = zoneShare(a.hr_zones_s);
  const s = a.series;
  const routeRuns = a.route?.history.filter((r) => r.pace_s_per_km) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        <Link href="/historie/" className="text-ink-muted hover:underline">← Historie</Link>
        <span className="flex gap-4">
          {a.prev_id && <Link href={href(a.prev_id)} className="text-ink-muted hover:underline">← Vorige</Link>}
          {a.next_id && <Link href={href(a.next_id)} className="text-ink-muted hover:underline">Volgende →</Link>}
        </span>
      </div>

      <Card>
        <div className="mb-4 flex items-start gap-3">
          <span className="mt-1"><SportBadge sport={a.sport} size={36} /></span>
          <div className="min-w-0">
          <div className="text-[12.5px] text-ink-muted">
            {fmtDate(a.start_local)} {new Date(a.start_local).getFullYear()} · {a.start_local.slice(11, 16)} · {sportLabel(a.sport)}
          </div>
          <h1 className="font-display text-[27px] font-light leading-tight">{a.name ?? sportLabel(a.sport)}</h1>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {a.distance_km ? <Stat label="Afstand" value={fmtKm(a.distance_km)} /> : null}
          <Stat label="Tijd" value={fmtClock(a.moving_time_s)} note={a.elapsed_time_s && a.elapsed_time_s - (a.moving_time_s ?? 0) > 60 ? `${fmtClock(a.elapsed_time_s)} totaal` : undefined} />
          {a.distance_km ? <Stat label={a.sport === "ride" ? "Snelheid" : "Tempo"} value={fmtIntensity(a)} /> : null}
          {a.avg_hr ? <Stat label="Hartslag" value={`${a.avg_hr}`} note={a.max_hr ? `max ${a.max_hr}` : undefined} /> : null}
          {a.elevation_gain_m ? <Stat label="Hoogtemeters" value={`${Math.round(a.elevation_gain_m)} m`} /> : null}
          {a.avg_cadence_spm ? <Stat label="Cadans" value={`${a.avg_cadence_spm}`} note="stappen/min" /> : a.vo2max ? <Stat label="VO2max" value={a.vo2max} /> : null}
        </div>
      </Card>

      {a.same_day.length > 0 && (
        <p className="text-[12.5px] text-ink-muted">
          Zelfde dag:{" "}
          {a.same_day.map((x, i) => (
            <span key={x.id}>
              {i > 0 && " · "}
              <Link className="underline underline-offset-2" href={href(x.id)}>{sportLabel(x.sport)} {x.start_local.slice(11, 16)}{x.distance_km ? ` (${fmtKm(x.distance_km)})` : ""}</Link>
            </span>
          ))}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {a.track && (
          <Card title="Route">
            <ActivityMap track={a.track} cursor={cursor} />
            <p className="mt-2 text-[11.5px] text-ink-muted">Lijn gekleurd per hartslagzone. Wijs in de grafiek aan om de plek op de kaart te zien.</p>
          </Card>
        )}
        <div className="flex flex-col gap-4">
          {share && (
            <Card title="Tijd per hartslagzone">
              <ZoneBar sport={a.sport} share={share} bounds={a.zone_bounds ?? undefined} />
              {a.zone_estimate && <p className="mt-3 text-[11.5px] text-ink-muted">{T.zoneEstimate(a.sport)}</p>}
            </Card>
          )}
          <Insights a={a} />
        </div>
      </div>

      {s && (
        <Card title="Verloop">
          <StreamChart time={s.time} heartrate={s.heartrate} velocity={s.velocity} altitude={s.altitude} bounds={a.zone_bounds} sport={a.sport} onCursor={setCursor} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {a.splits.length > 0 && (
          <Card title="Per kilometer">
            <SplitTable splits={a.splits} />
          </Card>
        )}
        {a.laps.length > 1 && !(a.splits.length > 0 && a.laps.slice(0, -1).every((l) => Math.abs((l.distance_km ?? 0) - 1) < 0.02)) && (
          <Card title="Ronden">
            <table className="w-full text-[12.5px] tabular-nums">
              <thead>
                <tr className="text-left text-[11.5px] text-ink-muted">
                  <th className="pb-2 font-normal">#</th>
                  <th className="pb-2 font-normal">Afstand</th>
                  <th className="pb-2 font-normal">Tijd</th>
                  <th className="pb-2 font-normal">Tempo</th>
                  <th className="pb-2 font-normal">HR</th>
                </tr>
              </thead>
              <tbody>
                {a.laps.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5 text-ink-muted">{i + 1}</td>
                    <td className="py-1.5">{fmtKm(l.distance_km)}</td>
                    <td className="py-1.5">{fmtClock(l.time_s)}</td>
                    <td className="py-1.5">{a.sport === "run" ? (l.pace ?? "–") : fmtIntensity({ sport: a.sport, moving_time_s: l.time_s, distance_km: l.distance_km })}</td>
                    <td className="py-1.5">{l.avg_hr ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>

      {a.route && routeRuns.length >= 2 && (
        <Card title={`Eerdere keren: ${a.route.name ?? a.route.id} (hoger = sneller)`} more="Rondjes" moreHref="/rondjes/">
          <LineChart
            ariaLabel="Tempo op dit rondje door de tijd"
            height={170}
            format={(v) => fmtClock(-v)}
            endLabels={false}
            xFormat={(d) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { month: "short", year: "2-digit" })}
            series={[{ label: "Tempo", colour: "var(--chart-1)", width: 2, fill: true, points: routeRuns.map((r) => ({ d: r.date, v: -r.pace_s_per_km! })) }]}
          />
          <ul className="mt-3 grid grid-cols-2 gap-x-4 text-[12px] tabular-nums sm:grid-cols-3">
            {[...routeRuns].reverse().slice(0, 9).map((r) => (
              <li key={r.id} className={r.id === a.id ? "font-semibold" : "text-ink-muted"}>
                <Link href={href(r.id)} className="hover:underline">{r.date} · {fmtPaceS(r.pace_s_per_km)}{r.avg_hr ? ` · ${r.avg_hr}` : ""}</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-[11px] text-ink-muted">Totale tijd bewegend {fmtDuration(a.moving_time_s)} u{a.calories ? ` · ${a.calories} kcal` : ""}. Hartslag van de pols: kijk bij een vreemd verloop naar de grafiek.</p>
    </div>
  );
}

function SplitTable({ splits }: { splits: ActivityDetail["splits"] }) {
  const fastest = Math.min(...splits.map((s) => s.seconds));
  const slowest = Math.max(...splits.map((s) => s.seconds));
  return (
    <table className="w-full text-[12.5px] tabular-nums">
      <thead>
        <tr className="text-left text-[11.5px] text-ink-muted">
          <th className="pb-2 font-normal">Km</th>
          <th className="pb-2 font-normal">Tempo</th>
          <th className="w-1/3 pb-2 font-normal" />
          <th className="pb-2 font-normal">HR</th>
          <th className="pb-2 font-normal">Hoogte</th>
        </tr>
      </thead>
      <tbody>
        {splits.map((s) => (
          <tr key={s.km} className="border-t border-border">
            <td className="py-1.5 text-ink-muted">{s.km}</td>
            <td className={`py-1.5 ${s.seconds === fastest ? "font-semibold" : ""}`}>{fmtClock(s.seconds)}</td>
            <td className="py-1.5 pr-3">
              <span className="block h-1.5 rounded-full" style={{ width: `${40 + (60 * (slowest - s.seconds)) / Math.max(1, slowest - fastest)}%`, background: "var(--chart-1)", opacity: 0.7 }} />
            </td>
            <td className="py-1.5">{s.avg_hr ?? "–"}</td>
            <td className="py-1.5 text-ink-muted">{s.elevation_m != null ? `${s.elevation_m > 0 ? "+" : ""}${Math.round(s.elevation_m)} m` : "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WithId() {
  const id = useSearchParams().get("id");
  if (!id) return <p className="text-sm text-ink-muted">Geen activiteit gekozen.</p>;
  return <Detail id={id} />;
}

export default function ActivityPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Laden…</p>}>
      <WithId />
    </Suspense>
  );
}
