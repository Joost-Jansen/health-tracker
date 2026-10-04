// Schema deze week: per sport gepland tegenover gedaan, hoeveel sessies gedaan, gemist en te gaan, en bovenaan het
// aftellen naar de eerstvolgende wedstrijd van het schema. Alleen met een actief schema.

import Card from "@/components/Card";
import InfoPopover from "@/components/InfoPopover";
import { SportBadge } from "@/components/plan/SportIcon";
import { fmtLong } from "@/components/plan/plan";
import { T } from "@/lib/texts";
import { fmtDuration, fmtKm, type NextRace, type PlanWeekSport, type PlanWeekSummary, sportLabel } from "@/lib/training";

const SPORT_ORDER = ["run", "ride", "swim"];
const bySportOrder = (a: string, b: string) => (SPORT_ORDER.indexOf(a) + 1 || 99) - (SPORT_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b);

function Countdown({ race }: { race: NextRace }) {
  const t = T.vandaag.race;
  const today = race.days === 0;
  return (
    <div className="mb-3.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 rounded-md bg-[var(--surface-brand-soft)] px-3.5 py-2.5">
      <span className="font-display text-[30px] font-light leading-none tabular-nums text-brand">{today ? t.today : race.days}</span>
      <span className="text-[13px] text-[var(--text-secondary)]">
        {today ? t.todayIs(race.name) : `${t.days(race.days)} ${t.until(race.name)}`}
      </span>
      <span className="w-full text-[12px] text-ink-muted sm:ml-auto sm:w-auto">
        {[fmtLong(race.date), race.distance_km ? fmtKm(race.distance_km) : null].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

/** Kilometers als het schema afstanden heeft, anders de tijd. */
function SportRow({ sport, row }: { sport: string; row: PlanWeekSport }) {
  const t = T.vandaag.planWeek;
  const byKm = row.planned_km > 0;
  const planned = byKm ? row.planned_km : row.planned_s;
  const done = byKm ? row.done_km : row.done_s;
  const pct = planned ? Math.min(100, (done / planned) * 100) : row.sessions ? (row.done / row.sessions) * 100 : 0;
  const amount = byKm ? t.ofPlanned(fmtKm(row.done_km), fmtKm(row.planned_km)) : planned ? t.ofPlanned(fmtDuration(row.done_s), fmtDuration(row.planned_s)) : t.ofPlanned(String(row.done), String(row.sessions));
  return (
    <li className="grid grid-cols-[22px_1fr_auto] items-center gap-x-2.5 gap-y-1 border-t border-border py-2 text-[13px] first:border-t-0">
      <SportBadge sport={sport} size={22} />
      <span className="min-w-0">
        <span className="font-medium">{sportLabel(sport)}</span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--surface-inset)]">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: "var(--data-gain)" }} />
        </span>
      </span>
      <span className="text-right tabular-nums">
        <span className="block">{amount}</span>
        {byKm && row.planned_s > 0 && <span className="block text-[11.5px] text-ink-muted">{t.ofPlanned(fmtDuration(row.done_s), fmtDuration(row.planned_s))}</span>}
      </span>
    </li>
  );
}

export default function PlanWeekCard({ week, race, className = "" }: { week: PlanWeekSummary; race?: NextRace | null; className?: string }) {
  const t = T.vandaag.planWeek;
  const sports = Object.keys(week.sports).sort(bySportOrder);
  const c = week.sessions;
  return (
    <Card title={t.title} className={className} action={<InfoPopover label={t.info}>{t.method}</InfoPopover>}>
      {race && <Countdown race={race} />}
      {sports.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{t.empty}</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {sports.map((s) => <SportRow key={s} sport={s} row={week.sports[s]} />)}
          </ul>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] tabular-nums text-ink-muted">
            <span className="font-medium text-[var(--text-primary)]">{t.done(c.done, c.total)}</span>
            {c.missed > 0 && <span className="text-loss">{t.missed(c.missed)}</span>}
            {c.upcoming > 0 && <span>{t.upcoming(c.upcoming)}</span>}
          </p>
        </>
      )}
    </Card>
  );
}
