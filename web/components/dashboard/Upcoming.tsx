// De volgende sessies van het actieve schema.

import Card from "@/components/Card";
import { T } from "@/lib/texts";
import { fmtDate, fmtKm, type PlanSession, sportLabel } from "@/lib/training";

export default function Upcoming({ sessions, title, className = "" }: { sessions: PlanSession[]; title?: string; className?: string }) {
  const t = T.vandaag.upcoming;
  return (
    <Card title={t.title} more={t.more} moreHref="/plan/" className={className}>
      {sessions.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{t.none}</p>
      ) : (
        <ul className="flex flex-col">
          {sessions.slice(0, 4).map((s, i) => (
            <li key={`${s.date}-${i}`} className="grid grid-cols-[72px_1fr] items-baseline gap-3 border-t border-border py-2 text-[13px] first:border-t-0 sm:grid-cols-[92px_1fr]">
              <span className={s.status === "vandaag" ? "font-semibold" : "text-ink-muted"}>{s.status === "vandaag" ? t.today : fmtDate(s.date)}</span>
              <span className="truncate">
                <span className="font-medium">{s.sport === "rest" ? t.rest : sportLabel(s.sport)}</span>
                {[s.kind, s.distance_km ? fmtKm(s.distance_km) : null, s.duration_min ? `${s.duration_min} min` : null, s.target_zone].filter(Boolean).map((x) => <span key={String(x)} className="text-ink-muted"> · {x}</span>)}
                {s.status === "gedaan" && <span className="text-gain"> · {t.done}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {title && <p className="mt-1 truncate text-[11.5px] text-ink-muted">{title}</p>}
    </Card>
  );
}
