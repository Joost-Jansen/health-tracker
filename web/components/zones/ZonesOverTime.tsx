"use client";

// Trends: time per heart-rate zone over time. At the top the distribution per week or
// month within the period chosen in the time bar, below it the current or the
// previous period against the average of the X periods before.

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Select, Tabs } from "@/components/ds";
import { api } from "@/lib/api";
import { useFormat, useT } from "@/lib/i18n";
import { periodLabel } from "@/lib/i18n/period";
import { ZONE_COLOUR, ZONES, type Zone, type ZoneHistory, type ZonePeriod } from "@/lib/training";
import { compareZones, fmtPct, fmtPp } from "./compare";
import EasyShare from "./EasyShare";
import ZoneStackChart, { type ZoneStackBar } from "./ZoneStackChart";

const CHOICES: Record<ZonePeriod, number[]> = { week: [4, 8, 12, 26], month: [3, 6, 12] };
const DEFAULT_X: Record<ZonePeriod, number> = { week: 4, month: 3 };
// Fetch the whole available history once (the API limit), then the time bar
// and the choice of X do not need to reload anything.
const COUNT: Record<ZonePeriod, number> = { week: 104, month: 36 };
const FALLBACK_SHOWN = 12;

// Two rows in one grid (see usage), so both bars start at the same x.
function MiniBar({ pct, label }: { pct: Record<Zone, number> | null; label: string }) {
  const t = useT();
  return (
    <>
      <span className="text-[12px] text-ink-muted">{label}</span>
      <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--surface-inset)" }} role="img"
        aria-label={pct ? ZONES.map((z) => `${z} ${Math.round(pct[z])}%`).join(", ") : t.zones.noData}>
        {pct && ZONES.map((z) => pct[z] > 0 && <div key={z} style={{ width: `${pct[z]}%`, background: ZONE_COLOUR[z] }} />)}
      </div>
    </>
  );
}

/** `sport`: the page's sport filter ("all" or one sport). Then the card follows it and shows no choice of its own. */
export default function ZonesOverTime({ window: win, sport: pageSport }: { window?: { from: string; to: string }; sport?: string }) {
  const t = useT();
  const f = useFormat();
  const z = t.zones;
  const unit = z.unit;
  const short = (p: ZonePeriod, start: string) => (p === "week" ? f.dayMonth(start) : f.monthShort(start));
  const [period, setPeriod] = useState<ZonePeriod>("week");
  const [ownSport, setSport] = useState("all");
  const sport = pageSport ?? ownSport;
  const [x, setX] = useState(DEFAULT_X.week);
  const [which, setWhich] = useState<"current" | "previous">("current");

  const q = useQuery({
    queryKey: ["zones-history", period, sport],
    queryFn: () => api.get<ZoneHistory>(`/api/zones/history?period=${period}&count=${COUNT[period]}&sport=${encodeURIComponent(sport)}`),
    placeholderData: keepPreviousData,
  });
  // The API's labels are Dutch; build them in the user's language from start and end.
  const h = useMemo<ZoneHistory | undefined>(
    () => (q.data ? { ...q.data, items: q.data.items.map((it) => ({ ...it, label: periodLabel(q.data!.period, it.start, it.end, t, f) })) } : undefined),
    [q.data, t, f],
  );

  const bars = useMemo<ZoneStackBar[]>(() => {
    if (!h) return [];
    const last = h.items[h.items.length - 1];
    // The periods that touch the chosen time span; without a time bar the last 12.
    const items = win?.from && win?.to
      ? h.items.filter((it) => it.end >= win.from && it.start <= win.to)
      : h.items.slice(-FALLBACK_SHOWN);
    return items.map((it) => ({ ...it, short: short(h.period, it.start), partial: it === last }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!tot) return "";
    const share = (z: Zone) => (items.reduce((s, b) => s + b.seconds[z], 0) / tot) * 100;
    return `${z.easyShort} ${Math.round(share("Z1") + share("Z2"))}% (${ZONES.map((zn) => `${zn} ${Math.round(share(zn))}%`).join(" · ")})`;
  };
  const thisName = (which === "current" ? z.current : z.previous)[period];
  const avgName = z.avgPrev(x, unit(period, x));

  return (
    <Card
      title={z.title}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {pageSport === undefined && (
            <Select aria-label={t.history.sport} value={sport} onChange={(e) => setSport(e.target.value)} className="!h-[32px] !w-auto min-w-[9rem]">
              <option value="all">{t.sport("all")}</option>
              {(sports.includes(sport) || sport === "all" ? sports : [...sports, sport]).map((s) => (
                <option key={s} value={s}>{t.sport(s)}</option>
              ))}
            </Select>
          )}
          <Tabs variant="segmented" items={[{ id: "week", label: t.dashboard.week }, { id: "month", label: t.dashboard.month }]} value={period} onChange={(v) => switchPeriod(v as ZonePeriod)} ariaLabel={z.weekOrMonth} />
        </div>
      }
    >

      {q.isLoading ? (
        <p className="py-6 text-center text-sm text-ink-muted">{t.common.loading}</p>
      ) : !h ? (
        <p className="py-6 text-center text-sm text-ink-muted">{z.loadFailed}</p>
      ) : !h.items.some((it) => it.total_s > 0) ? (
        // No heart-rate data anywhere yet (new account, or this sport never with heart rate): no empty bars and a table full of dashes.
        <p className="py-6 text-center text-sm text-ink-muted">{z.noHrYet(sport === "all" ? null : sport)}</p>
      ) : (
        <div className={`transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
          <ZoneStackChart
            bars={bars}
            labelEvery={Math.max(1, Math.ceil(bars.length / (period === "week" ? 10 : 12)))}
            ariaLabel={z.aria(period, bars.length, unit(period, bars.length))}
            summary={withData.length ? z.together(bars.length, unit(period, bars.length), avgOver(withData)) : z.noHrPeriod}
          />

          {cmp && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
                <Tabs
                  variant="segmented"
                  items={[{ id: "current", label: z.current[period] }, { id: "previous", label: z.previous[period] }]}
                  value={which}
                  onChange={(v) => setWhich(v as "current" | "previous")}
                  ariaLabel={z.whichAria}
                />
                <label className="flex items-center gap-2 text-[12.5px] text-ink-muted">
                  {z.compareWith}
                  <Select aria-label={z.countAria} value={String(x)} onChange={(e) => setX(Number(e.target.value))} className="!h-[32px] !w-auto">
                    {CHOICES[period].map((n) => <option key={n} value={n}>{n} {unit(period, n)}</option>)}
                  </Select>
                </label>
              </div>

              {cmp.target.total_s > 0 && <EasyShare pct={cmp.target.pct} className="mb-3" />}
              <div className="mb-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
                <MiniBar label={thisName} pct={cmp.target.total_s ? cmp.target.pct : null} />
                <MiniBar label={avgName} pct={cmp.avgPct} />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] tabular-nums sm:text-[13px]">
                  <thead>
                    <tr className="text-left text-[11.5px] text-ink-muted">
                      <th className="pb-2 font-normal">{z.zone}</th>
                      <th className="pb-2 text-right font-normal">{thisName}</th>
                      <th className="pb-2 text-right font-normal" title={avgName}>{z.avg}</th>
                      <th className="pb-2 text-right font-normal">{z.diff}</th>
                      <th className="pb-2 text-right font-normal">{z.hours}</th>
                      <th className="pb-2 text-right font-normal" title={z.avgHoursTitle(period)}>{z.avgHours}</th>
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
                          <td className={`py-1.5 text-right ${tone}`}>{fmtPp(r.diff, f)}</td>
                          <td className="py-1.5 text-right">{f.duration(r.seconds)}</td>
                          <td className="py-1.5 text-right text-ink-muted">{f.duration(r.avgSeconds)}</td>
                        </tr>
                      );
                    })}
                    {(() => {
                      const easy = (key: "pct" | "avgPct") => (cmp.rows[0][key] == null ? null : cmp.rows[0][key]! + cmp.rows[1][key]!);
                      const [now, avg] = [easy("pct"), easy("avgPct")];
                      return (
                        <tr className="border-t border-border-strong" title={z.easyMethod}>
                          <td className="py-1.5 font-medium">{z.easyShort}</td>
                          <td className="py-1.5 text-right font-medium">{fmtPct(now)}</td>
                          <td className="py-1.5 text-right text-ink-muted">{fmtPct(avg)}</td>
                          <td className="py-1.5 text-right">{fmtPp(now != null && avg != null ? now - avg : null, f)}</td>
                          <td className="py-1.5 text-right">{f.duration(cmp.rows[0].seconds + cmp.rows[1].seconds)}</td>
                          <td className="py-1.5 text-right text-ink-muted">{f.duration(cmp.rows[0].avgSeconds + cmp.rows[1].avgSeconds)}</td>
                        </tr>
                      );
                    })()}
                    <tr className="border-t border-border-strong">
                      <td className="py-1.5 font-medium">{z.total}</td>
                      <td className="py-1.5" />
                      <td className="py-1.5" />
                      <td className="py-1.5" />
                      <td className="py-1.5 text-right font-medium">{f.duration(cmp.total.seconds)}</td>
                      <td className="py-1.5 text-right text-ink-muted">{f.duration(cmp.total.avgSeconds)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className="mt-2 text-[11.5px] text-ink-muted">
                {cmp.target.label.charAt(0).toUpperCase() + cmp.target.label.slice(1)}
                {which === "current" ? z.runningNote : "."}
                {cmp.target.total_s === 0 && ` ${z.noHrPeriod}`}
                {" "}{z.method(cmp.periods, unit(period, cmp.periods), cmp.withData, period)}
                {sport === "all" && ` ${z.allSports}`}
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
