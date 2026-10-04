"use client";

// Schema: het actieve trainingsplan. Kop met doel en aftellen naar de wedstrijd, kilometers per week (gepland
// tegen gedaan), en per week de dagen met hun sessies naast wat je echt deed. Maken en bewerken met de
// schema-editor; plakken uit een tabel blijft als tweede route. Coachingagents schrijven via dezelfde API.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState } from "@/components/ds";
import { CalendarIcon } from "@/components/icons";
import PlanEditor from "@/components/plan/PlanEditor";
import PlanHeader from "@/components/plan/PlanHeader";
import PlanImporter from "@/components/plan/PlanImporter";
import VolumeChart from "@/components/plan/VolumeChart";
import WeekCard from "@/components/plan/WeekView";
import { buildWeeks, planRace, todayIso } from "@/components/plan/plan";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Plan } from "@/lib/training";

type ActiveResponse = { persistent: boolean; plan: Plan | null };
type Mode = "view" | "edit" | "new" | "import";

export default function PlanPage() {
  const t = useT();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("view");
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const q = useQuery({ queryKey: ["plan-active"], queryFn: () => api.get<ActiveResponse>("/api/plans/active") });
  const finish = useMutation({
    mutationFn: (id: number) => api.patch(`/api/plans/${id}`, { status: "afgerond" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan-active"] }),
  });
  const go = (m: Mode) => {
    setMode(m);
    window.scrollTo({ top: 0 });
  };
  const saved = () => {
    go("view");
    qc.invalidateQueries({ queryKey: ["plan-active"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const plan = q.data?.plan ?? null;
  const today = todayIso();
  const weeks = useMemo(() => buildWeeks(plan?.sessions ?? []), [plan]);
  const race = useMemo(() => planRace(plan?.race, plan?.sessions ?? []), [plan]);
  useEffect(() => setToggled({}), [plan?.id]);

  if (q.isLoading) return <p className="text-sm text-ink-muted">{t.common.loading}</p>;
  if (!q.data) return <p className="text-sm text-ink-muted">{t.plan.loadFailed}</p>;

  const warn = !q.data.persistent && (
    <p className="rounded border border-border bg-[var(--surface-sunken)] px-3 py-2 text-[12.5px] text-ink-muted">
      {t.plan.noDatabase}
    </p>
  );

  if (mode === "import") {
    return <div className="flex flex-col gap-4">{warn}<PlanImporter onDone={saved} onCancel={() => go("view")} onEditor={() => go("new")} /></div>;
  }
  if (mode === "new" || (mode === "edit" && plan)) {
    return (
      <div className="flex flex-col gap-4">
        {warn}
        <PlanEditor
          key={mode === "edit" ? `edit-${plan?.id}` : "new"}
          plan={mode === "edit" ? plan : null}
          onSaved={saved}
          onCancel={() => go("view")}
          onPaste={mode === "new" ? () => go("import") : undefined}
        />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col gap-4">
        {warn}
        <section className="rounded border border-border bg-surface p-4 sm:p-[18px]">
          <EmptyState
            icon={<CalendarIcon width={22} height={22} />}
            title={t.plan.emptyTitle}
            body={t.plan.emptyBody}
            action={
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="primary" onClick={() => go("new")}>{t.plan.create}</Button>
                <Button size="sm" variant="ghost" onClick={() => go("import")}>{t.plan.paste}</Button>
              </div>
            }
          />
        </section>
      </div>
    );
  }

  const currentIndex = weeks.findIndex((w) => today >= w.monday && today <= w.days[6].date);
  const isOpen = (i: number) => toggled[weeks[i].monday] ?? weeks[i].days[6].date >= today;
  const pastCount = weeks.filter((w) => w.days[6].date < today).length;

  return (
    <div className="flex flex-col gap-4">
      {warn}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <PlanHeader
          plan={plan}
          race={race}
          today={today}
          weekIndex={currentIndex >= 0 ? currentIndex : null}
          weekCount={weeks.length}
          onEdit={() => go("edit")}
          onNew={() => go("new")}
          onFinish={() => confirm(t.plan.finishConfirm) && finish.mutate(plan.id)}
        />
        <VolumeChart weeks={weeks} today={today} raceDate={race.date} />
      </div>

      {pastCount > 0 && pastCount === weeks.length && (
        <p className="text-[13px] text-ink-muted">{t.plan.allPast}</p>
      )}
      <div className="flex flex-col gap-3">
        {weeks.map((w, i) => (
          <WeekCard
            key={w.monday}
            week={w}
            index={i}
            count={weeks.length}
            today={today}
            raceDate={race.date}
            open={isOpen(i)}
            onToggle={() => setToggled((t) => ({ ...t, [w.monday]: !isOpen(i) }))}
          />
        ))}
      </div>
      <p className="max-w-prose text-[12px] text-ink-muted">{t.texts.plan.matching}</p>
    </div>
  );
}
