// English version of lib/texts.ts (the health and performance explanations, T). Same keys, same parameters.
//
// lib/texts.ts stays the Dutch source while other work adds blocks to it. A key that is missing here falls back to
// Dutch at runtime (lib/i18n/en.ts, withFallback) and makes `npm run check:i18n` fail, so a translation is never
// forgotten; a key here that does not exist in T, or has other parameters, is a type error.

import type { T } from "@/lib/texts";
import type { HrFlagReason, InsightCode, RecordKey } from "@/lib/training";
import { makeFormat } from "./format";

type Texts = typeof T;
export type DeepPartial<X> = X extends (...args: never[]) => unknown ? X : X extends object ? { [K in keyof X]?: DeepPartial<X[K]> } : X;

const f = makeFormat("en");
const SPORT: Record<string, string> = { run: "running", ride: "cycling", swim: "swimming", walking: "walking", strength_training: "strength", breathwork: "breathwork", resort_skiing: "skiing" };
const sport = (s: string) => SPORT[s] ?? s.replace(/_/g, " ");
const sports = (items: string[]) => f.list(items.map(sport));
const Sport = (s: string) => sport(s).charAt(0).toUpperCase() + sport(s).slice(1);
const num = (n: number, digits = 1) => f.trim(n, digits);
const RECORD_NAME: Record<RecordKey, string> = { "1k": "1 km", "5k": "5 km", "10k": "10 km", "21k": "half marathon" };
const goalName = (km: number) => (Math.abs(km - 42.195) < 0.3 ? "marathon" : Math.abs(km - 21.0975) < 0.2 ? "half marathon" : `${num(km)} km`);

export const textsEn = {
  noMedicalAdvice: "Not medical advice: if you feel ill or are in pain, don't train and ask a doctor or physio.",

  readinessBasis: "Compares last night with your own normal (resting heart rate, sleep) and your form.",

  zonesFootnote(estimated: string[], set: string[]): string {
    if (!set.length) return "You haven't set heart-rate zones yet (Settings, Zones and profile).";
    const base = "All sports counts each sport with its own zones.";
    if (!estimated.length) return base;
    return `${base} Zones for ${sports(estimated)} are an estimate.`;
  },

  zoneEstimate: (s: string) => `${Sport(s)} zones are an estimate (Settings, Zones and profile).`,

  formStatus: {
    fresh: "There is room for a hard session or a race.",
    balanced: "Load and recovery are in balance.",
    tired: "You are building up; plan an easier day soon.",
    very_tired: "Load is high compared with what you are used to; take a rest.",
  } as Record<string, string>,

  formMethod:
    "Load per session = TRIMP from average heart rate, resting heart rate and your own max per sport. Fitness is the 42-day average, fatigue 7 days, form the difference between the two at the end of yesterday (where you start today).",

  formTsb: "Form = fitness minus fatigue as of yesterday: where you stand at the start of today.",

  formChartNote: "The average applies to form; diamonds are races and tests.",

  syncStale: (days: number) =>
    `The last sync is ${days} days old. Sessions and recovery since then are still missing; fitness, fatigue and form stay at the last synced day.`,

  volumeWeek: (through: string) => `This week up to and including ${through}; the average is over the four full weeks before it.`,

  recordRace: "Fastest race over this distance. The watch measured slightly less, so it is not among the splits.",

  z2Pace:
    "Average pace of all seconds in Z2 per week, outdoor runs only (no treadmill, no run after swimming or cycling). Faster at the same heart rate points to a better aerobic base.",

  vo2max: "The watch's estimate after outdoor runs with GPS and heart rate.",

  records: "Fastest stretch within a run (Garmin's splits), not an official race time.",

  races: (r: { race_min_km: number; race_hard_pct: number }) =>
    `Recognised by swimming, cycling and running on one day, a name with race or marathon, or a run of ${r.race_min_km}+ km with ${r.race_hard_pct}%+ of the time in Z4-Z5. Time is moving time without transitions.`,

  prediction: (days: number) =>
    `Riegel formula from your longest fast effort of the last ${days} days. Optimistic for the marathon without long runs of 30+ km; expect a few minutes more then.`,

  afterMultisport: (before: string[]) => `This run followed ${sports(before)} on the same day. Don't compare heart rate and pace with a standalone run.`,

  driftGood: "Pace per heartbeat stayed almost the same in the second half: your aerobic base holds this pace and this duration.",
  driftHigh: "In the second half the same pace cost more heartbeats (over 5%). Heat, hydration, fatigue or starting too fast can cause this.",
  driftMethod: "Drift = drop in speed per heartbeat between the first and the second half (moving time only).",

  easySession: (pct: number, z2Top: number) => `${pct}% in Z1-Z2 (below ${z2Top} bpm by your own zones): the intensity that builds the base.`,
  hardSession: (pct: number) => `${pct}% in Z4-Z5. Keep the next day easy.`,

  efficiency: (s: string) =>
    "Speed divided by heart rate. Up = more metres per beat = fitter. " +
    (s === "ride"
      ? "Less sensitive than speed to how hard you rode, but wind and group rides count: compare mainly rides of the same kind."
      : "Less sensitive than pace to how hard you ran, but not insensitive: compare mainly runs of the same kind."),

  routeRule: (s: "run" | "ride", minCount: number) =>
    s === "ride"
      ? `A bike loop is recognised once you rode mostly the same roads at least ${minCount} times, even if you started the tracker somewhere else. Thick line: the most typical ride; thin: the other rides.`
      : `A loop is recognised once you ran mostly the same roads at least ${minCount} times, wherever you started. Thick line: the most typical run; thin: the other runs.`,
  routeTrend: "Trend: efficiency (metres per heartbeat), median of the last 5 times against all times before.",

  routes: {
    auto: (lastSync?: string | null) =>
      `Loops are recognised automatically after every sync${lastSync && lastSync !== "nog nooit" ? ` (last sync: ${lastSync})` : ""}.`,
    reviewIntro:
      "These look alike, but not enough to merge them on our own. Same loop? Then they count together from now on, as variants of one loop. Your answer is remembered.",
    reason: {
      same: "Looks like the same loop.",
      other_start: "Same loop, different start.",
      extra_loop: "Same loop, the longest with an extra lap or detour.",
      partly_other_way: "Mostly the same loop, partly a different road.",
    } as Record<string, string>,
    pending: (n: number, s: string) =>
      `${n === 1 ? "One pair of" : `${n} pairs of`} ${s === "ride" ? "bike loops" : "loops"} ${n === 1 ? "looks" : "look"} alike. Take a moment to check whether it's the same loop.`,
    nextSync: "Remembered. The loop is updated at the next sync.",
    variants: (kms: string[]) => `${kms.length} variants: ${f.list(kms)} km`,
    variantsHelp: "The same loop in different lengths, for example with an extra lap, a detour or another start.",
  },

  plan: {
    zoneFit: (pct: number, zone: string) => {
      const top = Math.max(...(zone.match(/[1-5]/g) ?? ["5"]).map(Number));
      return top <= 2 ? `${pct}% at or below ${zone}` : `${pct}% in ${zone}`;
    },
    zoneFitMethod:
      "Time per heart-rate zone by your own zones. Easy sessions (up to Z2): time at or below the target zone counts, because easier is fine. Quality (Z3 and up): time within the target zone counts.",
    matching: "A session counts as done once there is an activity of the same sport that day. A run in pieces (less than 30 minutes apart) counts as one session.",
    volume: "Kilometres per week: planned against done. Sessions without a distance (only a duration) don't count here.",
  },

  onboarding: {
    zonesWhy:
      "Everything on the site uses your own heart-rate zones per sport: the time per zone, load and form, and the colours on the map. A zone is a percentage of your maximum heart rate; the site works out the boundaries.",
    zonesHow:
      "If you don't know your max from a test, start with the highest heart rate your watch measured during a hard effort. For cycling and swimming the max is usually lower than for running; without your own value the site estimates it and says so.",
    maxSuggestion: (s: string, bpm: number) =>
      `Suggestion from your own data: the highest heart rate for ${sport(s)} is ${bpm} bpm (single wrist-sensor spikes left out).`,
    zonesSet: (set: string[], estimated: string[]) =>
      `Set for ${sports(set)}.` + (estimated.length ? ` Estimated: ${sports(estimated)}.` : ""),
    profileWhy:
      "Year of birth, weight, height and resting heart rate. The site uses the resting heart rate for the load per session on days without sleep data from your watch.",
    firstSync: (days: number) =>
      `The first time, the site fetches your sessions and recovery (sleep, resting heart rate, Body Battery) of the last ${days} days. After that, every morning, whatever is new.`,
    wristHr: "Heart rate usually comes from the wrist: with an odd spike or dip in a session it's worth looking at the chart before drawing conclusions.",
  },

  today: {
    readiness: {
      title: "Ready for today?",
      verdict: { ready: "Ready to train", easy: "Take it easy", recover: "Recover first", unknown: "No overnight data" } as Record<string, string>,
      advice: {
        recover: "Several signs of fatigue. Make it a rest day or a very easy session.",
        easy: "One or two signals are off. Train if you like, but keep it easy (Z1-Z2) or short.",
        ready: "Recovery looks normal. The planned session can go ahead as intended.",
      } as Record<string, string>,
      unknown: (labels: string[]) => `${f.list(labels)} ${labels.length > 1 ? "are" : "is"} fine; without overnight data recovery is hard to judge.`,
      noNight: "No sleep or resting heart rate from last night (watch not worn or not synced yet).",
      label: { resting_hr: "Resting heart rate", sleep_h: "Sleep", body_battery: "Body Battery", tsb: "Form" } as Record<string, string>,
      value(key: string, v: number): string {
        if (key === "resting_hr") return `${v} bpm`;
        if (key === "sleep_h") return `${f.num(v, 1)} h`;
        if (key === "tsb") return `${v > 0 ? "+" : ""}${Math.round(v)}`;
        return String(v);
      },
      note(code: string, p: { delta?: number; baseline?: number; score?: number; date?: string; days_ago?: number }): string {
        if (code === "vs_baseline") return `${(p.delta ?? 0) >= 0 ? "+" : ""}${p.delta ?? 0} vs normal (${p.baseline})`;
        if (code === "sleep") return [p.score ? `score ${p.score}` : "", p.baseline ? `normal ${f.num(p.baseline, 1)} h` : ""].filter(Boolean).join(", ");
        if (code === "highest") return p.days_ago === 0 ? "highest today" : p.days_ago === 1 ? "highest yesterday" : `highest on ${f.dayMonth(p.date ?? "")}`;
        if (code === "form_yesterday") return "yesterday's fitness minus fatigue";
        return "";
      },
    },
    load: {
      title: "Load",
      info: "About load",
      band: { low: "Easy", build: "Building", high: "Careful", unknown: "Not known yet" } as Record<string, string>,
      explain: {
        low: "Your last week was lighter than you are used to: room to recover, or your fitness is slowly dropping.",
        build: "Your last week matches what you are used to: a good base to build up gradually.",
        unknown: "After about four weeks of training with heart rate you can see how your last week compares with what you are used to.",
      } as Record<string, string>,
      highRatio: (high: string) => `Your last week was much harder than you are used to (above ${high}). Build up more gradually or plan an easy day.`,
      highRamp: (ramp: string) => `Your fitness is rising fast (+${ramp} in 7 days). Build up more gradually or plan an easy day.`,
      ratio: "Last week against usual",
      ramp: "Fitness in 7 days",
      scale: { low: "easy", build: "building", high: "careful" },
      method: (low: string, high: string, rampHigh: string) =>
        `Fatigue (7 days) divided by fitness (42 days). Between ${low} and ${high} the load matches what you are used to; these limits come from sports research on training load. Fitness rising more than ${rampHigh} per week is a fast build-up. A guideline, not a prediction.`,
    },
    planWeek: {
      title: "Plan this week",
      info: "About plan this week",
      more: "Plan",
      empty: "No sessions planned this week.",
      done: (done: number, total: number) => `${done} of ${f.plural(total, { one: "# session", other: "# sessions" })} done`,
      missed: (n: number) => `${n} missed`,
      upcoming: (n: number) => `${n} to go`,
      unsynced: (n: number) => `${n} not synced yet`,
      ofPlanned: (done: string, planned: string) => `${done} of ${planned}`,
      method: "Done only counts activities that belong to a session in the plan (same sport, same day).",
    },
    race: {
      today: "Today",
      days: (n: number) => (n === 1 ? "day" : "days"),
      until: (name: string | null) => `to ${name ?? "the race"}`,
      todayIs: (name: string | null) => `is the day: ${name ?? "the race"}`,
    },
    upcoming: {
      title: "Upcoming sessions",
      more: "Plan",
      none: "No more sessions in the plan.",
      today: "Today",
      rest: "Rest",
      done: "done",
    },
    recent: {
      title: "Recent activities",
      more: "History",
      empty: "No activities yet. They appear here after the first sync.",
      parts: (n: number) => `${n} parts`,
      partsHelp: "Saved in pieces less than 30 minutes apart; counts as one session.",
      race: "Race",
    },
    formStopped: (day: string) =>
      `As of ${day}, the last synced day. The days after it don't count as rest days; they come in with the next sync.`,
  },

  trends: {
    loading: "Loading…",
    loadError: "Could not load the trends.",
    periods: { "4W": "4W", "3M": "3M", "6M": "6M", YTD: "This year", "1J": "1Y", Alles: "All", Eigen: "Custom" } as Record<string, string>,
    timeFilter: {
      group: "Period for all charts",
      adjust: "Adjust",
      panel: "Adjust period",
      period: "Period",
      days: (n: number) => f.plural(n, { one: "# day", other: "# days" }),
      from: "From",
      to: "Up to and including",
      moveGroup: "Zoom and move the timeline",
      previous: "Previous period",
      next: "Next period",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      backTo: (preset: string) => `Back to ${preset}`,
      removeCustom: (window: string, preset: string) => `Remove custom period ${window}, back to ${preset}`,
      help: "In every chart: drag to move, Ctrl/⌘ + scroll or pinch to zoom, double-click resets the period. On a phone you read values with one finger and zoom with two.",
      close: "Close",
    },
    sport: { label: "Sport", all: "All sports", runOnly: "Pace in Z2, VO2max, longest run, records and predictions are about running only: choose All sports or Running to see them." },
    insights: {
      title: "Insights",
      none: "Nothing in particular.",
      empty: "No insights yet: that takes a few weeks of training first.",
      goal: (text: string) => `Goal from your active plan: ${text}.`,
      noGoal: "Put a race or a goal with a distance in your plan and the insights will be about that.",
    },
    insight(i: InsightCode): { title: string; text: string } {
      switch (i.code) {
        case "record_set": {
          const p = i.params;
          return { title: `New record over ${RECORD_NAME[p.key]}: ${f.clock(p.seconds)}`, text: `${f.clock(p.previous_seconds - p.seconds)} faster than your previous best (${f.clock(p.previous_seconds)}), on ${f.day(p.date)}.` };
        }
        case "acwr_high":
          return { title: "Load is rising fast", text: `Fatigue (${i.params.atl}) is ${num(i.params.ratio)}× your fitness (${i.params.ctl}). Above 1.5 the injury risk goes up; plan an easier day.` };
        case "ramp_fast":
          return { title: "Fast build-up", text: `Fitness +${num(i.params.ramp)} in 7 days. More than about 5 to 7 per week is hard for your body to keep up with.` };
        case "fresh":
          return { title: "Fresh", text: `Form +${i.params.tsb}: a good moment for a race or a hard session.` };
        case "easy_share": {
          const p = i.params;
          const low = i.level !== "good";
          return {
            title: `${p.easy_pct}% easy (Z1-Z2) over the last 4 weeks`,
            text: `Z3 ${p.grey_pct}%, Z4-Z5 ${p.hard_pct}%. For endurance training about 80% easy is the usual guideline.` + (low ? " Races count too; without races most of it should be in Z1-Z2." : ""),
          };
        }
        case "longest_run":
          return { title: `Longest run in the last 4 weeks: ${num(i.params.km)} km`, text: "Pieces less than 30 minutes apart count as one run." };
        case "long_run_goal": {
          const p = i.params;
          return {
            title: `Longest run in the last 4 weeks: ${num(p.km)} km`,
            text: p.km >= p.target_km
              ? `Long run at the level of your goal (${goalName(p.goal_km)}).`
              : `For a ${goalName(p.goal_km)} a long run of up to about ${p.target_km} km is the usual build-up, a few weeks before the race.`,
          };
        }
        case "goal_prediction": {
          const p = i.params;
          const diff = p.predicted_seconds - p.goal_seconds;
          const where = Math.abs(diff) < 30 ? "is on your goal" : `is ${f.clock(Math.abs(diff))} ${diff < 0 ? "under" : "over"} your goal`;
          return {
            title: `Prediction ${goalName(p.goal_km)}: ${f.clock(p.predicted_seconds)}`,
            text: `Goal ${f.clock(p.goal_seconds)}; the prediction ${where}. Calculated from ${num(p.from_km, 2)} km on ${f.day(p.from_date)}.`,
          };
        }
        case "run_volume":
          return { title: `Running volume ${num(i.params.avg_km, 0)} km/week (4-week average)`, text: `This week so far ${num(i.params.week_km)} km.` };
      }
    },
    predictions: {
      title: "Predicted race times",
      none: (days: number) => `No fast effort in the last ${days} days to start from.`,
      label: { "5k": "5 km", "10k": "10 km", "21k": "Half marathon", "42k": "Marathon" } as Record<string, string>,
      from: (km: string) => `from ${km}`,
      fromTitle: (km: string, time: string, day: string) => `${km} in ${time} on ${day}`,
      basedOn: "Based on",
    },
    form: {
      title: "Fitness, fatigue and form",
      fitness: "Fitness",
      fitnessNow: "Fitness now",
      fatigue: "Fatigue",
      form: "Form",
      peak: (v: number, day: string) => `Peak fitness in period ${v} on ${day}`,
      stopped: (day: string) =>
        `Fitness, fatigue and form run up to ${day}, the last synced day. The days after it don't count as rest days; they come in with the next sync.`,
    },
    volume: {
      title: "Volume per week",
      hours: "Hours",
      km: "Km",
      unit: "Unit",
      aria: "Volume per week per sport",
      other: "Other",
      total: "Total",
      avg: (value: string, weeks: number) => `Average ${value} per week over ${f.plural(weeks, { one: "# full week", other: "# full weeks" })} (the current week doesn't count)`,
      noWholeWeek: "No full week in this period yet.",
    },
    z2: {
      title: "Pace in Z2 (running)",
      label: "Pace in Z2",
      excluded: (n: number) => `${f.plural(n, { one: "# run", other: "# runs" })} in this period left out: the wrist heart rate looked unreliable (diamonds in the chart).`,
      marker: (reasons: string) => `Wrist heart rate unreliable: ${reasons}`,
    },
    hrReason: {
      low_start: "much lower in the first km than your pace suggests",
      flat: "exactly flat for minutes",
      dropout: "dropped out for a minute or longer",
    } as Record<HrFlagReason, string>,
    hrMethod: "Compared with your own relation between pace and heart rate from your other runs. Such a run doesn't count for the pace in Z2.",
    vo2: { title: "VO2max (Garmin)", label: "VO2max" },
    longest: {
      title: "Longest run per week",
      label: "Longest run",
      note: "The longest run per week; pieces less than 30 minutes apart count as one run.",
    },
    recovery: {
      titleDay: "Recovery per day",
      titleWeek: "Recovery per week",
      rhr: "Resting heart rate",
      sleep: "Sleep",
      bb: "Body Battery (highest of the day)",
      bbShort: "Body Battery",
      stress: "Stress",
      hrv: "HRV (overnight)",
      hrvNote: "Average heart-rate variability during the night, measured by the watch. Compare with your own trend, not with other people's.",
    },
    sleepLoad: {
      title: "Sleep and resting heart rate against load",
      perDay: "Per day",
      perWeek: "Per week",
      view: "Per day or per week",
      load: "Load",
      loadAxis: "Load (TRIMP) →",
      sleepTitle: "Sleep (h)",
      rhrTitle: "Resting heart rate (bpm)",
      hours: " h",
      bpm: " bpm",
      explainDay: "Each point is a day: that day's load (TRIMP) against the sleep and resting heart rate of the night after.",
      explainWeek: "Each point is a week: the summed load (TRIMP) against your average sleep and resting heart rate that week.",
      neutral: "A relation says nothing about cause: sleep and resting heart rate also depend on work, illness, alcohol and heat.",
      compare: (unit: "dag" | "week", heavySleep: string, lightSleep: string) =>
        `On the hardest half of the ${unit === "dag" ? "days" : "weeks"} you slept ${heavySleep} h on average, on the lightest half ${lightSleep} h.`,
      compareRhr: (heavy: string, light: string) => `Resting heart rate: ${heavy} against ${light} bpm.`,
      tooFew: "Too few days with both sleep and training in this period.",
      point: (label: string, load: string, value: string) => `${label}: load ${load}, ${value}`,
    },
    records: {
      title: "Records",
      colDistance: "Distance",
      colTime: "Time",
      colPace: "Pace",
      colDate: "Date",
      colProgress: "Progress in period",
      empty: "No records yet: they come from runs with fastest splits or races.",
      method: "Fastest stretch within a run (Garmin's splits) or a whole race; not an official race time.",
      raceRule: (pct: number) => `A race the watch measured up to ${pct}% short counts for that distance.`,
      fromRace: (km: string) => `race, ${km} measured`,
      pr: "PR",
      prTitle: (days: number) => `Improved in the last ${days} days`,
      prNotice: (what: string, day: string) => `New record over ${what} (${day}).`,
      improved: (n: number) => (n === 0 ? "no improvement in this period" : `improved ${n}× in this period`),
      before: (time: string) => `before that ${time}`,
      progressNote: "The line runs over the chosen period: each dot is an improvement, in between the record stood.",
      name: RECORD_NAME,
      label: { "1k": "1 km", "5k": "5 km", "10k": "10 km", "21k": "Half marathon" } as Record<RecordKey, string>,
    },
    races: {
      title: "Races and tests",
      none: "No races recognised yet.",
      triathlon: "Triathlon",
      byHeartRate: (name: string) => `Race or test (${name || "run"})`,
    },
  },
} satisfies DeepPartial<Texts>;
