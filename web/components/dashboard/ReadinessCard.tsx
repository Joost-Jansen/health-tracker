// Klaar voor vandaag? Het oordeel uit afgelopen nacht en de vorm. De API geeft codes en getallen
// (api/readiness.py); de zinnen komen uit T.vandaag.readiness.

import Card from "@/components/Card";
import { useT } from "@/lib/i18n";
import type { Readiness } from "@/lib/training";

const VERDICT_COLOUR: Record<Readiness["verdict"], string> = {
  klaar: "var(--zone-2)",
  "rustig aan": "var(--zone-3)",
  herstel: "var(--zone-5)",
  onbekend: "var(--zone-1)",
};
const LEVEL_COLOUR = { ok: "var(--zone-2)", attention: "var(--zone-3)", warn: "var(--zone-5)" };

export default function ReadinessCard({ r, className = "" }: { r: Readiness; className?: string }) {
  const T = useT().texts;
  const t = T.vandaag.readiness;
  const advice = r.verdict === "onbekend" ? t.unknown(r.signals.map((s) => t.label[s.key])) : t.advice[r.verdict];
  const text = r.no_night ? `${advice} ${t.noNight}` : advice;
  // zonder nachtdata is er weinig te zeggen: compact, zodat de kaart niet groter oogt dan wat hij weet
  const compact = !r.date;
  return (
    <Card title={t.title} className={className}>
      <div className="flex items-center gap-2.5">
        <span className={`inline-block rounded-full ${compact ? "h-2 w-2" : "h-3 w-3"}`} style={{ background: VERDICT_COLOUR[r.verdict] }} />
        <span className={compact ? "text-[15px] font-medium" : "font-display text-[23px] font-light"}>{t.verdict[r.verdict]}</span>
      </div>
      <p className={`mt-1 leading-relaxed text-ink-muted ${compact ? "text-[12px]" : "text-[12.5px]"}`}>{text}</p>
      {compact ? (
        <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] tabular-nums">
          {r.signals.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLOUR[s.level] }} />
              <dt className="text-ink-muted">{t.label[s.key]}</dt>
              <dd>{t.value(s.key, s.value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] tabular-nums">
          {r.signals.map((s) => {
            const note = t.note(s.note.code, s.note.params);
            return (
              <div key={s.key}>
                <dt className="flex items-center gap-1.5 text-ink-muted"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLOUR[s.level] }} />{t.label[s.key]}</dt>
                <dd><span className="text-[15px]">{t.value(s.key, s.value)}</span> {note && <span className="text-[11px] text-ink-muted">{note}</span>}</dd>
              </div>
            );
          })}
        </dl>
      )}
      <p className={`text-[11px] text-ink-muted ${compact ? "mt-2.5" : "mt-3"}`}>{T.readinessBasis} {T.noMedicalAdvice}</p>
    </Card>
  );
}
