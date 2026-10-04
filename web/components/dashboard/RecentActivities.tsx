// Laatste activiteiten: een run in stukken (minder dan 30 minuten pauze) is één regel met "N delen", wedstrijden
// krijgen een label (zelfde herkenning als Trends).

import Card from "@/components/Card";
import { SportBadge } from "@/components/plan/SportIcon";
import { useFormat, useT } from "@/lib/i18n";
import type { RecentItem } from "@/lib/training";

export default function RecentActivities({ items }: { items: RecentItem[] }) {
  const tt = useT();
  const t = tt.texts.vandaag.recent;
  const f = useFormat();
  return (
    <Card title={t.title} more={t.more} moreHref="/historie/">
      {items.length === 0 && <p className="text-[13px] text-ink-muted">{t.empty}</p>}
      <ul className="flex flex-col">
        {items.map((a) => (
          <li key={a.id} className="grid grid-cols-[72px_1fr] items-baseline gap-x-3 gap-y-0.5 border-t border-border py-2 text-[13px] first:border-t-0 sm:grid-cols-[92px_1fr_auto]">
            <span className="text-ink-muted">{f.weekdayDay(a.start_local.slice(0, 10))}</span>
            <span className="flex min-w-0 items-center gap-2">
              <SportBadge sport={a.sport} size={22} />
              <span className="truncate">
                <span className="font-medium">{tt.sport(a.sport)}</span>
                {a.name && <span className="text-ink-muted"> · {a.name}</span>}
              </span>
              {a.race && (
                <span className="flex-none rounded-full bg-[var(--surface-brand-soft)] px-2 py-px text-[11px] font-semibold text-brand">{t.race}</span>
              )}
            </span>
            <span className="col-start-2 tabular-nums text-ink-muted sm:col-start-auto">
              {a.distance_km ? f.km(a.distance_km) : f.duration(a.moving_time_s)} · {f.intensity(a)}{a.avg_hr ? ` · ${a.avg_hr} bpm` : ""}
              {a.parts && a.parts > 1 && <span title={t.partsHelp}> · {t.parts(a.parts)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
