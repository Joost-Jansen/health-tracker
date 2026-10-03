"use client";

// Rondjes: lopen of fietsen. "Rondje voor X km" (vaste rondjes en combinaties vanaf dezelfde start, het langst
// niet gelopen/gefietst eerst) en alle herkende rondjes met hun vorm, beste tijd en of je er sneller op wordt.
// De sport staat in de url (?sport=ride), zodat terug vanaf een rondje op dezelfde sport uitkomt.

import { Suspense, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button, EmptyState, Tabs } from "@/components/ds";
import { RouteShape } from "@/components/map/RoutesMap";
import { api } from "@/lib/api";
import { type RouteOption, type RouteSport, type RouteSummary, fmtKm } from "@/lib/training";
import { SPORT_TABS, WORDS, asSport, fmtEffort, fmtTypical, kmhFromPace, listHref, routeHref as href } from "./sport";

const RoutesMap = dynamic(() => import("@/components/map/RoutesMap"), { ssr: false });

const fmtDay = (d?: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "–");

function describe(o: RouteOption) {
  const counts = new Map<string, number>();
  o.names.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  return [...counts.entries()].map(([n, c]) => (c > 1 ? `${c}× ${n}` : n)).join(" + ");
}

function Suggest({ sport, routes }: { sport: RouteSport; routes: RouteSummary[] }) {
  const [km, setKm] = useState("");
  const [asked, setAsked] = useState<number | null>(null);
  const [pick, setPick] = useState(0);
  const words = WORDS[sport];
  const q = useQuery({
    queryKey: ["route-suggest", sport, asked],
    queryFn: () => api.get<{ km: number; options: RouteOption[] }>(`/api/routes/suggest?km=${asked}&sport=${sport}`),
    enabled: asked != null,
  });
  const go = (v: number) => {
    setKm(String(v).replace(".", ","));
    setAsked(v);
    setPick(0);
  };
  const opts = q.data?.options ?? [];
  const chosen = opts[pick];

  return (
    <>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(km.replace(",", "."));
          if (v > 0) go(v);
        }}
      >
        <input className="ds-input w-24" inputMode="decimal" placeholder="km" value={km} onChange={(e) => setKm(e.target.value)} aria-label="Afstand in km" />
        <Button type="submit" variant="primary" size="sm">Zoek</Button>
        <span className="flex flex-wrap gap-1.5">
          {words.presets.map((p) => (
            <button key={p} type="button" className="rounded-full border border-border px-2.5 py-0.5 text-[12px] tabular-nums text-ink-muted hover:bg-[var(--surface-hover)]" onClick={() => go(p)}>
              {String(p).replace(".", ",")}
            </button>
          ))}
        </span>
      </form>

      {q.isLoading && <p className="mt-3 text-sm text-ink-muted">Zoeken…</p>}
      {asked != null && q.data && opts.length === 0 && <p className="mt-3 text-sm text-ink-muted">Geen rondjes gevonden.</p>}
      {opts.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <ul className="flex flex-col gap-2">
            {!opts[0].within_tolerance && <li className="text-[12.5px] text-ink-muted">Niets binnen 5% van {String(asked).replace(".", ",")} km; dit komt het dichtst in de buurt.</li>}
            {opts.map((o, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setPick(i)}
                  className={`w-full rounded border px-3 py-2 text-left text-[13px] ${i === pick ? "border-[var(--border-focus)] bg-[var(--surface-sunken)]" : "border-border hover:bg-[var(--surface-hover)]"}`}
                >
                  <span className="font-medium">{describe(o)}</span>
                  <span className="block text-[12px] tabular-nums text-ink-muted">
                    {fmtKm(o.total_km)} ({o.deviation_km >= 0 ? "+" : "−"}{Math.abs(o.deviation_km).toFixed(1).replace(".", ",")} km) · {o.days_since} dagen {words.notDone}
                  </span>
                </button>
              </li>
            ))}
            {chosen && (
              <li className="text-[12px] text-ink-muted">
                {[...new Set(chosen.parts)].map((p) => {
                  const r = routes.find((x) => x.id === p);
                  return r ? (
                    <span key={p} className="mr-3">
                      <Link href={href(p)} className="underline underline-offset-2">{r.name ?? p}</Link>: typisch {fmtTypical(r)} bij {r.median_hr ?? "–"} bpm
                    </span>
                  ) : null;
                })}
              </li>
            )}
          </ul>
          {chosen && <RoutesMap lines={[...new Set(chosen.parts)].map((p) => ({ id: p, label: chosen.names[chosen.parts.indexOf(p)], points: chosen.tracks[p] ?? [] }))} height={300} />}
        </div>
      )}
    </>
  );
}

function Trend({ r }: { r: RouteSummary }) {
  // Efficiëntie (meter per hartslag) corrigeert voor hoe hard je liep; tempo alleen zegt weinig als je
  // het rondje soms rustig en soms snel loopt.
  if (r.recent_efficiency && r.earlier_efficiency) {
    const pct = ((r.recent_efficiency - r.earlier_efficiency) / r.earlier_efficiency) * 100;
    if (Math.abs(pct) < 1.5) return <span className="text-ink-muted">efficiëntie gelijk</span>;
    return <span className={pct > 0 ? "text-gain" : "text-loss"}>{pct > 0 ? "efficiënter" : "minder efficiënt"} ({pct > 0 ? "+" : "−"}{Math.abs(pct).toFixed(0)}% m/slag)</span>;
  }
  if (!r.recent_pace_s_per_km || !r.earlier_pace_s_per_km) return null;
  if (asSport(r.sport) === "ride") {
    const d = kmhFromPace(r.recent_pace_s_per_km)! - kmhFromPace(r.earlier_pace_s_per_km)!;
    if (Math.abs(d) < 0.3) return <span className="text-ink-muted">gelijk</span>;
    return <span className={d > 0 ? "text-gain" : "text-loss"}>{d > 0 ? "sneller" : "trager"} ({d > 0 ? "+" : "−"}{Math.abs(d).toFixed(1).replace(".", ",")} km/u)</span>;
  }
  const diff = r.recent_pace_s_per_km - r.earlier_pace_s_per_km;
  if (Math.abs(diff) < 3) return <span className="text-ink-muted">gelijk</span>;
  return <span className={diff < 0 ? "text-gain" : "text-loss"}>{diff < 0 ? "sneller" : "trager"} ({diff < 0 ? "−" : "+"}{Math.abs(diff)} s/km)</span>;
}

function Routes({ sport, onSport }: { sport: RouteSport; onSport: (s: RouteSport) => void }) {
  const q = useQuery({ queryKey: ["routes", sport], queryFn: () => api.get<RouteSummary[]>(`/api/routes?sport=${sport}`) });
  const words = WORDS[sport];
  const routes = q.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Card title={words.suggestTitle} action={<Tabs variant="segmented" items={SPORT_TABS} value={sport} onChange={(v) => onSport(asSport(v))} ariaLabel="Sport" />}>
        {q.isLoading ? (
          <p className="text-sm text-ink-muted">Laden…</p>
        ) : !q.data ? (
          <p className="text-sm text-ink-muted">Kon de rondjes niet laden.</p>
        ) : routes.length === 0 ? (
          <EmptyState
            title={sport === "ride" ? "Nog geen vaste fietsrondjes" : "Nog geen vaste rondjes"}
            body={
              sport === "ride"
                ? "Een rit telt als rondje zodra je dezelfde route minstens 2 keer met GPS fietst. Ritten binnen (zonder GPS) tellen niet mee."
                : "Een loop telt als rondje zodra je dezelfde route minstens 3 keer met GPS loopt."
            }
          />
        ) : (
          <Suggest key={sport} sport={sport} routes={routes} />
        )}
      </Card>
      {routes.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {routes.map((r) => (
              <Link key={r.id} href={href(r.id)} className="group">
                <Card className="h-full transition-colors group-hover:border-[var(--border-strong)]">
                  <div className="flex gap-4">
                    <RouteShape points={r.track} className="h-24 w-24 flex-none" />
                    <div className="min-w-0 flex-1 text-[12.5px]">
                      <div className="truncate text-[14px] font-semibold">{r.name ?? r.id}</div>
                      <div className="tabular-nums text-ink-muted">{fmtKm(r.distance_km)} · {r.is_loop ? "rondje" : "route"}{r.elevation_gain_m ? ` · ${Math.round(r.elevation_gain_m)} hm` : ""}</div>
                      <div className="mt-1.5 tabular-nums">{r.runs}× {words.done}, laatst {fmtDay(r.last_run)}</div>
                      <div className="tabular-nums text-ink-muted">typisch {fmtTypical(r)} · {r.median_hr ?? "–"} bpm</div>
                      {r.best && <div className="tabular-nums">beste {fmtEffort(sport, r.best.pace_s_per_km)} ({fmtDay(r.best.date)})</div>}
                      <div className="text-[12px]"><Trend r={r} /></div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-muted">
            {sport === "ride"
              ? "Een fietsrondje is herkend als je minstens 2 keer vanaf dezelfde plek dezelfde route fietste. Trend: efficiëntie (meter per hartslag), mediaan van de laatste 5 keer tegen alle keren daarvoor."
              : "Een rondje is herkend als je minstens 3 keer vanaf dezelfde plek dezelfde lus liep. Trend: efficiëntie (meter per hartslag, minder afhankelijk van hoe hard je liep dan tempo), mediaan van de laatste 5 keer tegen alle keren daarvoor."}
          </p>
        </>
      )}
    </div>
  );
}

function WithSport() {
  const router = useRouter();
  const sport = asSport(useSearchParams().get("sport"));
  return <Routes sport={sport} onSport={(s) => router.replace(listHref(s), { scroll: false })} />;
}

export default function RondjesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Laden…</p>}>
      <WithSport />
    </Suspense>
  );
}
