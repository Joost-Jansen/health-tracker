// The next sessions of the active plan.

import Card from "@/components/Card";
import { useFormat, useT } from "@/lib/i18n";
import type { PlanSession } from "@/lib/training";

export default function Upcoming({ sessions, title, className = "" }: { sessions: PlanSession[]; title?: string; className?: string }) {
  const tt = useT();
  const t = tt.texts.today.upcoming;
  const f = useFormat();
  return (
    <Card title={t.title} more={t.more} moreHref="/plan/" className={className}>
      {sessions.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{t.none}</p>
      ) : (
        <ul className="flex flex-col">
          {sessions.slice(0, 4).map((s, i) => (
            <li key={`${s.date}-${i}`} className="grid grid-cols-[72px_1fr] items-baseline gap-3 border-t border-border py-2 text-[13px] first:border-t-0 sm:grid-cols-[92px_1fr]">
              <span className={s.status === "today" ? "font-semibold" : "text-ink-muted"}>{s.status === "today" ? t.today : f.weekdayDay(s.date)}</span>
              <span className="truncate">
                <span className="font-medium">{s.sport === "rest" ? t.rest : tt.sport(s.sport)}</span>
                {[s.kind, s.distance_km ? f.km(s.distance_km) : null, s.duration_min ? `${s.duration_min} min` : null, s.target_zone].filter(Boolean).map((x) => <span key={String(x)} className="text-ink-muted"> · {x}</span>)}
                {s.status === "done" && <span className="text-gain"> · {t.done}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {title && <p className="mt-1 truncate text-[11.5px] text-ink-muted">{title}</p>}
    </Card>
  );
}
