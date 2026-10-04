"use client";

// Trends: tijd per hartslagzone over tijd. Bovenaan de verdeling per week of
// maand binnen de gekozen periode van de tijdbalk, eronder de lopende of de
// vorige periode tegen het gemiddelde van de X perioden daarvoor.

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Select, Tabs } from "@/components/ds";
import { api } from "@/lib/api";
import { fmtDuration, sportLabel, ZONE_COLOUR, ZONES, type Zone, type ZoneHistory, type ZonePeriod } from "@/lib/training";
import { compareZones, fmtPct, fmtPp } from "./compare";
import ZoneStackChart, { type ZoneStackBar } from "./ZoneStackChart";

const CHOICES: Record<ZonePeriod, number[]> = { week: [4, 8, 12, 26], month: [3, 6, 12] };
const DEFAULT_X: Record<ZonePeriod, number> = { week: 4, month: 3 };
// Eén keer de hele beschikbare geschiedenis ophalen (de API-grens), dan hoeven de tijdbalk
// en de keuze van X niets opnieuw te laden.
const COUNT: Record<ZonePeriod, number> = { week: 104, month: 36 };
const FALLBACK_SHOWN = 12;
const MONTHS_SHORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const unit = (p: ZonePeriod, n: number) => (p === "week" ? (n === 1 ? "week" : "weken") : n === 1 ? "maand" : "maanden");

function short(period: ZonePeriod, start: string): string {
  const d = new Date(start + "T12:00:00");
  if (period === "week") return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return MONTHS_SHORT[d.getMonth()];
}

// Twee rijen in één grid (zie gebruik), zodat beide balken op dezelfde x beginnen.
function MiniBar({ pct, label }: { pct: Record<Zone, number> | null; label: string }) {
  return (
    <>
      <span className="text-[12px] text-ink-muted">{label}</span>
      <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--surface-inset)" }} role="img"
        aria-label={pct ? ZONES.map((z) => `${z} ${Math.round(pct[z])}%`).join(", ") : "geen data"}>
        {pct && ZONES.map((z) => pct[z] > 0 && <div key={z} style={{ width: `${pct[z]}%`, background: ZONE_COLOUR[z] }} />)}
      </div>
    </>
  );
}

export default function ZonesOverTime({ window: win }: { window?: { from: string; to: string } }) {
  const [period, setPeriod] = useState<ZonePeriod>("week");
  const [sport, setSport] = useState("all");
  const [x, setX] = useState(DEFAULT_X.week);
  const [which, setWhich] = useState<"current" | "previous">("current");

  const q = useQuery({
    queryKey: ["zones-history", period, sport],
    queryFn: () => api.get<ZoneHistory>(`/api/zones/history?period=${period}&count=${COUNT[period]}&sport=${encodeURIComponent(sport)}`),
    placeholderData: keepPreviousData,
  });
  const h = q.data;

  const bars = useMemo<ZoneStackBar[]>(() => {
    if (!h) return [];
    const last = h.items[h.items.length - 1];
    // De perioden die de gekozen tijdspanne raken; zonder tijdbalk de laatste 12.
    const items = win?.from && win?.to
      ? h.items.filter((it) => it.end >= win.from && it.start <= win.to)
      : h.items.slice(-FALLBACK_SHOWN);
    return items.map((it) => ({ ...it, short: short(h.period, it.start), partial: it === last }));
  }, [h, win?.from, win?.to]);

  const cmp = useMemo(() => (h ? compareZones(h.items, x, which) : null), [h, x, which]);

  const switchPeriod = (p: ZonePeriod) => {
    setPeriod(p);
    setX(DEFAULT_X[p]);
  };

  const sports = h ? h.sports : [];
  const withData = bars.filter((b) => b.total_s > 0);
  const avgOver = (items: typeof bars) => {
    const tot = items.reduce((s, b) => s + b.total_s, 0);
    return tot ? ZONES.map((z) => `${z} ${Math.round((items.reduce((s, b) => s + b.seconds[z], 0) / tot) * 100)}%`).join(" · ") : "";
  };
  const thisName = period === "week" ? (which === "current" ? "Deze week" : "Vorige week") : which === "current" ? "Deze maand" : "Vorige maand";
  const avgName = `Gem. vorige ${x} ${unit(period, x)}`;

  return (
    <Card
      title="Tijd per hartslagzone over tijd"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Sport" value={sport} onChange={(e) => setSport(e.target.value)} className="!h-[32px] !w-auto min-w-[9rem]">
            <option value="all">Alle sporten</option>
            {(sports.includes(sport) || sport === "all" ? sports : [...sports, sport]).map((s) => (
              <option key={s} value={s}>{sportLabel(s)}</option>
            ))}
          </Select>
          <Tabs variant="segmented" items={[{ id: "week", label: "Week" }, { id: "month", label: "Maand" }]} value={period} onChange={(v) => switchPeriod(v as ZonePeriod)} ariaLabel="Week of maand" />
        </div>
      }
    >

      {q.isLoading ? (
        <p className="py-6 text-center text-sm text-ink-muted">Laden…</p>
      ) : !h ? (
        <p className="py-6 text-center text-sm text-ink-muted">Kon de zones niet laden.</p>
      ) : !h.items.some((it) => it.total_s > 0) ? (
        // Nog nergens hartslagdata (nieuw account, of deze sport nooit met hartslag): geen lege staven en een tabel vol streepjes.
        <p className="py-6 text-center text-sm text-ink-muted">Nog geen trainingen met hartslag{sport === "all" ? "" : ` voor ${sportLabel(sport).toLowerCase()}`}.</p>
      ) : (
        <div className={`transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
          <ZoneStackChart
            bars={bars}
            labelEvery={Math.max(1, Math.ceil(bars.length / (period === "week" ? 10 : 12)))}
            ariaLabel={`Verdeling over hartslagzones per ${period === "week" ? "week" : "maand"}, ${bars.length} ${unit(period, bars.length)}`}
            summary={withData.length ? `${bars.length} ${unit(period, bars.length)} samen: ${avgOver(withData)}` : "Geen hartslagdata in deze periode."}
          />

          {cmp && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
                <Tabs
                  variant="segmented"
                  items={[{ id: "current", label: period === "week" ? "Deze week" : "Deze maand" }, { id: "previous", label: period === "week" ? "Vorige week" : "Vorige maand" }]}
                  value={which}
                  onChange={(v) => setWhich(v as "current" | "previous")}
                  ariaLabel="Welke periode vergelijken"
                />
                <label className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                  vergelijk met gemiddelde van de vorige
                  <Select aria-label="Aantal perioden" value={String(x)} onChange={(e) => setX(Number(e.target.value))} className="!h-[32px] !w-auto">
                    {CHOICES[period].map((n) => <option key={n} value={n}>{n} {unit(period, n)}</option>)}
                  </Select>
                </label>
              </div>

              <div className="mb-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                <MiniBar label={thisName} pct={cmp.target.total_s ? cmp.target.pct : null} />
                <MiniBar label={avgName} pct={cmp.avgPct} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] tabular-nums sm:text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] text-ink-muted">
                      <th className="pb-2 font-normal">Zone</th>
                      <th className="pb-2 text-right font-normal">{thisName}</th>
                      <th className="pb-2 text-right font-normal" title={avgName}>Gem.</th>
                      <th className="pb-2 text-right font-normal">Verschil</th>
                      <th className="pb-2 text-right font-normal">Uren</th>
                      <th className="pb-2 text-right font-normal" title={`Gemiddelde uren per ${period === "week" ? "week" : "maand"}`}>Gem. uren</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cmp.rows.map((r) => {
                      // neutral on purpose: more or less time in a zone is not good or bad by itself
                      const tone = r.diff == null || Math.abs(r.diff) < 1 ? "text-ink-muted" : "text-ink";
                      return (
                        <tr key={r.zone} className="border-t border-border">
                          <td className="py-1.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: ZONE_COLOUR[r.zone] }} />
                              {r.zone}
                            </span>
                          </td>
                          <td className="py-1.5 text-right font-medium">{fmtPct(r.pct)}</td>
                          <td className="py-1.5 text-right text-ink-muted">{fmtPct(r.avgPct)}</td>
                          <td className={`py-1.5 text-right ${tone}`}>{fmtPp(r.diff)}</td>
                          <td className="py-1.5 text-right">{fmtDuration(r.seconds)}</td>
                          <td className="py-1.5 text-right text-ink-muted">{fmtDuration(r.avgSeconds)}</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-border-strong">
                      <td className="py-1.5 font-medium">Totaal</td>
                      <td className="py-1.5" />
                      <td className="py-1.5" />
                      <td className="py-1.5" />
                      <td className="py-1.5 text-right font-medium">{fmtDuration(cmp.total.seconds)}</td>
                      <td className="py-1.5 text-right text-ink-muted">{fmtDuration(cmp.total.avgSeconds)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-[11.5px] text-ink-muted">
                {cmp.target.label.charAt(0).toUpperCase() + cmp.target.label.slice(1)}
                {which === "current" ? " loopt nog: het aandeel is al te vergelijken, de uren nog niet." : "."}
                {cmp.target.total_s === 0 && " Geen hartslagdata in deze periode."}
                {" "}Gemiddeld aandeel is tijdgewogen over {cmp.periods} {unit(period, cmp.periods)} ({cmp.withData} met hartslagdata); uren zijn per {period === "week" ? "week" : "maand"} (u:mm).
                {sport === "all" && " Alle sporten telt elke sport met zijn eigen zones."}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
