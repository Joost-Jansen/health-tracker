"use client";

// Heart rate through the day and the night before it (Today, Heart rate): the watch's readings about every 2 minutes,
// the sleep shaded with its stages, the normal resting heart rate as a reference, and the night in numbers, so a
// rise before waking shows as numbers and not only as a line. Static export: the day is in the query (?day=).

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Card from "@/components/Card";
import { Button, IconButton } from "@/components/ds";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import DayHeartChart, { clock, STAGE_COLOUR, type SleepStage } from "@/components/charts/DayHeartChart";
import { api } from "@/lib/api";
import { useFormat, useT } from "@/lib/i18n";
import type { HeartRateDay } from "@/lib/training";

const STAGES: SleepStage[] = ["deep", "light", "rem", "awake"];
const RISE_NOTABLE = 8; // beats; the same threshold as the sentence in T.heartRate.night

function Stat({ label, value, note, dot }: { label: string; value: React.ReactNode; note?: React.ReactNode; dot?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
        {dot && <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />}
        {label}
      </dt>
      <dd>
        <span className="font-display text-[21px] leading-tight tabular-nums">{value}</span>
        {note && <span className="block text-[11px] text-ink-muted tabular-nums">{note}</span>}
      </dd>
    </div>
  );
}

function HeartRate({ day }: { day: string | null }) {
  const t = useT();
  const f = useFormat();
  const h = t.heartRate;
  const router = useRouter();
  const q = useQuery({
    queryKey: ["heartrate", day],
    queryFn: () => api.get<HeartRateDay>(`/api/heartrate${day ? `?day=${day}` : ""}`),
    placeholderData: keepPreviousData,
  });
  if (q.isLoading) return <p className="text-sm text-ink-muted">{t.common.loading}</p>;
  if (!q.data) return <p className="text-sm text-ink-muted">{h.loadFailed}</p>;
  const v = q.data;
  const go = (d: string) => router.replace(`/dashboard/heart-rate/?day=${d}`);
  const n = v.night;
  const nav = (
    <div className="flex items-center gap-1">
      <IconButton label={h.previous} size="sm" icon={<ChevronLeftIcon width={15} height={15} />} disabled={!v.prev} onClick={() => v.prev && go(v.prev)} />
      <span aria-live="polite" className={`min-w-[9.5rem] text-center text-[12.5px] tabular-nums transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
        {f.weekdayDayYear(v.day)}
      </span>
      <IconButton label={h.next} size="sm" icon={<ChevronRightIcon width={15} height={15} />} disabled={!v.next} onClick={() => v.next && go(v.next)} />
      {v.latest && v.day !== v.latest && (
        <Button variant="ghost" size="sm" onClick={() => go(v.latest!)}>
          {h.latest}
        </Button>
      )}
    </div>
  );

  if (!v.latest) {
    return (
      <Card title={h.title}>
        <p className="text-[13px] text-ink-muted">{h.none}</p>
      </Card>
    );
  }
  const sleptFor = v.sleep ? h.sleptFrom(clock(v.sleep.start), clock(v.sleep.end), f.hours((v.sleep.end - v.sleep.start) * 60)) : null;
  const normal = v.normal_resting_hr != null ? Math.round(v.normal_resting_hr) : null;

  return (
    <div className="flex flex-col gap-4">
      <Card title={h.title} action={nav}>
        {v.points.length < 2 ? (
          <p className="text-[13px] text-ink-muted">{h.empty}</p>
        ) : (
          <>
            <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Stat label={h.restingHr} value={v.resting_hr != null ? h.bpm(v.resting_hr) : "–"} note={normal != null ? h.normal(normal) : undefined} />
              {n ? (
                <>
                  <Stat label={h.lowest} value={h.bpm(n.lowest)} note={h.at(clock(n.lowest_at))} />
                  <Stat label={h.avgSleep} value={h.bpm(n.avg)} note={sleptFor} />
                  {n.last_avg != null && n.before_avg != null && n.rise != null && (
                    <Stat
                      label={h.lastTwo}
                      value={h.bpm(n.last_avg)}
                      note={`${h.vsRest(n.before_avg)} (${n.rise > 0 ? "+" : ""}${n.rise})`}
                      dot={n.rise >= RISE_NOTABLE ? "var(--zone-3)" : undefined}
                    />
                  )}
                </>
              ) : (
                v.min != null && v.max != null && <Stat label={h.dayRange} value={`${v.min}–${v.max}`} />
              )}
            </dl>

            <DayHeartChart
              from={v.from}
              to={v.to}
              points={v.points}
              sleep={v.sleep}
              nextSleepStart={v.next_sleep_start}
              normal={normal}
              stageLabel={h.stage}
              ariaLabel={h.aria(f.long(v.day))}
              format={h.bpm}
            />

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-muted">
              {v.sleep && (
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: "var(--chart-band)", outline: "1px solid var(--border)" }} />
                  {h.sleep}
                </span>
              )}
              {v.sleep?.stages.length
                ? STAGES.map((s) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span aria-hidden className="inline-block h-2 w-3.5 rounded-sm" style={{ background: STAGE_COLOUR[s].fill, opacity: STAGE_COLOUR[s].opacity }} />
                      {h.stage[s]}
                    </span>
                  ))
                : null}
              {normal != null && (
                <span className="flex items-center gap-1.5">
                  <svg width="16" height="6" aria-hidden>
                    <line x1="0" x2="16" y1="3" y2="3" stroke="var(--chart-2)" strokeWidth="1" strokeDasharray="4 4" />
                  </svg>
                  {h.normalLine(normal)}
                </span>
              )}
            </div>

            {n?.rise != null && n.last_avg != null && n.before_avg != null ? (
              <p className="mt-4 text-[12.5px] leading-relaxed">{t.texts.heartRate.night(n.rise, n.last_avg, n.before_avg)}</p>
            ) : (
              !n && <p className="mt-4 text-[12.5px] text-ink-muted">{h.noNight}</p>
            )}
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-muted">
              {t.texts.heartRate.explain} {t.texts.noMedicalAdvice}
            </p>
            <p className="mt-2 text-[11px] text-ink-muted">{h.source}</p>
          </>
        )}
      </Card>
    </div>
  );
}

function WithDay() {
  const day = useSearchParams().get("day");
  return <HeartRate day={day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null} />;
}

export default function HeartRatePage() {
  const t = useT();
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">{t.common.loading}</p>}>
      <WithDay />
    </Suspense>
  );
}
