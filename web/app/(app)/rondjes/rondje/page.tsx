"use client";

// Eén rondje: kaart, tempo (lopen) of snelheid (fietsen) door de tijd met trendlijn, en elke keer dat je het
// liep of fietste. Hernoemen kan hier.

import { Suspense, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button } from "@/components/ds";
import TrendChart from "@/components/charts/TrendChart";
import { api } from "@/lib/api";
import { type RouteDetail, fmtClock, fmtKm, ZONE_COLOUR, ZONES } from "@/lib/training";
import { WORDS, asSport, fmtEffort, kmhFromPace, listHref } from "../sport";

const RoutesMap = dynamic(() => import("@/components/map/RoutesMap"), { ssr: false });
const fmtDay = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "2-digit" });

function Rename({ route }: { route: RouteDetail }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(route.name ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Hernoemen</Button>;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.patch(`/api/routes/${route.id}`, { name });
          setOpen(false);
          qc.invalidateQueries({ queryKey: ["route", route.id] });
          qc.invalidateQueries({ queryKey: ["routes"] });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Mislukt");
        }
      }}
    >
      <input className="ds-input h-8 w-56 text-[13px]" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Naam" />
      <Button size="sm" variant="primary" type="submit">Opslaan</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button>
      {error && <span className="text-[12px] text-loss">{error}</span>}
    </form>
  );
}

function Detail({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["route", id], queryFn: () => api.get<RouteDetail>(`/api/routes/${encodeURIComponent(id)}`) });
  if (q.isLoading) return <p className="text-sm text-ink-muted">Laden…</p>;
  if (!q.data) return <p className="text-sm text-ink-muted">Rondje niet gevonden.</p>;
  const r = q.data;
  const sport = asSport(r.sport);
  const ride = sport === "ride";
  const runs = r.history.filter((h) => h.pace_s_per_km);
  const hrRuns = r.history.filter((h) => h.avg_hr);
  const effRuns = r.history.filter((h) => h.m_per_beat);

  return (
    <div className="flex flex-col gap-4">
      <Link href={listHref(sport)} className="text-[12.5px] text-ink-muted hover:underline">← Rondjes</Link>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[27px] font-light leading-tight">{r.name ?? r.id}</h1>
            <p className="text-[12.5px] tabular-nums text-ink-muted">
              {fmtKm(r.distance_km)} · {r.is_loop ? "rondje" : "route"}{r.elevation_gain_m ? ` · ${Math.round(r.elevation_gain_m)} hoogtemeters` : ""} · {r.runs}× {WORDS[sport].done} sinds {r.first_run ? fmtDay(r.first_run) : "–"}
            </p>
          </div>
          <Rename route={r} />
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card title="Kaart">
          <RoutesMap
            height={400}
            lines={[
              ...(r.variants ?? []).map((v) => ({ id: v.id, label: v.date, points: v.track, variant: true })),
              { id: r.id, label: "Meest typische keer", points: r.track },
            ]}
          />
          <p className="mt-2 text-[11.5px] text-ink-muted">
            Dikke lijn: de meest typische keer (lijkt het meest op alle andere). Dun en licht: de {r.variants?.length ?? 0} andere keren, zodat je ziet waar je afweek of eerder of later begon.
          </p>
        </Card>
        <div className="flex flex-col gap-4">
          {ride ? (
            <Card title="Snelheid op dit rondje">
              <TrendChart label="Snelheid" points={runs.map((h) => ({ d: h.date, v: kmhFromPace(h.pace_s_per_km)! }))} format={(v) => v.toFixed(1).replace(".", ",")} unit=" km/u" height={150} />
            </Card>
          ) : (
            <Card title="Tempo op dit rondje">
              <TrendChart label="Tempo" points={runs.map((h) => ({ d: h.date, v: h.pace_s_per_km! }))} format={(v) => fmtClock(v)} unit="/km" lowerIsBetter height={150} />
            </Card>
          )}
          <Card title="Efficiëntie: meter per hartslag">
            <TrendChart label="Efficiëntie" points={effRuns.map((h) => ({ d: h.date, v: h.m_per_beat! }))} format={(v) => v.toFixed(2).replace(".", ",")} unit=" m" height={120} colour="var(--chart-6)" />
            <p className="mt-2 text-[11.5px] text-ink-muted">Snelheid gedeeld door hartslag. Omhoog = meer meters per slag = fitter. {ride
                ? "Minder gevoelig voor hoe hard je fietste dan snelheid, maar wind en groepjes tellen mee: vergelijk vooral ritten van dezelfde soort."
                : "Minder gevoelig voor hoe hard je liep dan tempo, maar niet ongevoelig: vergelijk vooral runs van dezelfde soort."} Gemiddelde hartslag: {hrRuns.length ? Math.round(hrRuns.reduce((s, h) => s + h.avg_hr!, 0) / hrRuns.length) : "–"} bpm.</p>
          </Card>
        </div>
      </div>
      <Card title="Alle keren">
        <table className="w-full text-[12.5px] tabular-nums">
          <thead>
            <tr className="text-left text-[11.5px] text-ink-muted">
              <th className="pb-2 font-normal">Datum</th><th className="pb-2 font-normal">Tijd</th><th className="pb-2 font-normal">{ride ? "Snelheid" : "Tempo"}</th><th className="pb-2 font-normal">HR</th><th className="pb-2 font-normal">m/slag</th><th className="hidden w-1/4 pb-2 font-normal sm:table-cell">Zones</th>
            </tr>
          </thead>
          <tbody>
            {[...r.history].reverse().map((h) => {
              const z = h.hr_zones_s;
              const total = z ? ZONES.reduce((s, k) => s + (z[k] ?? 0), 0) : 0;
              return (
                <tr key={h.id} className="border-t border-border">
                  <td className="py-1.5"><Link href={`/historie/activiteit/?id=${encodeURIComponent(h.id)}`} className="hover:underline">{fmtDay(h.date)}</Link></td>
                  <td className="py-1.5">{fmtClock(h.moving_time_s)}</td>
                  <td className={`py-1.5 ${r.best?.activity_id === h.id ? "font-semibold" : ""}`}>{fmtEffort(sport, h.pace_s_per_km)}</td>
                  <td className="py-1.5">{h.avg_hr ?? "–"}</td>
                  <td className="py-1.5">{h.m_per_beat ? h.m_per_beat.toFixed(2).replace(".", ",") : "–"}</td>
                  <td className="hidden py-1.5 sm:table-cell">
                    {total > 0 && (
                      <span className="flex h-1.5 overflow-hidden rounded-full">
                        {ZONES.map((k) => (z![k] ? <span key={k} style={{ width: `${(z![k] / total) * 100}%`, background: ZONE_COLOUR[k] }} /> : null))}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function WithId() {
  const id = useSearchParams().get("id");
  return id ? <Detail id={id} /> : <p className="text-sm text-ink-muted">Geen rondje gekozen.</p>;
}

export default function RondjePage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Laden…</p>}>
      <WithId />
    </Suspense>
  );
}
