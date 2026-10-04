// English version of lib/texts.ts (the health and performance explanations, T). Same keys, same parameters.
//
// lib/texts.ts stays the Dutch source while other work adds blocks to it. A key that is missing here falls back to
// Dutch at runtime (lib/i18n/en.ts, withFallback) and makes `npm run check:i18n` fail, so a translation is never
// forgotten; a key here that does not exist in T, or has other parameters, is a type error.

import type { T } from "@/lib/texts";
import { makeFormat } from "./format";

type Texts = typeof T;
export type DeepPartial<X> = X extends (...args: never[]) => unknown ? X : X extends object ? { [K in keyof X]?: DeepPartial<X[K]> } : X;

const f = makeFormat("en");
const SPORT: Record<string, string> = { run: "running", ride: "cycling", swim: "swimming", walking: "walking", strength_training: "strength", breathwork: "breathwork", resort_skiing: "skiing" };
const sport = (s: string) => SPORT[s] ?? s.replace(/_/g, " ");
const sports = (items: string[]) => f.list(items.map(sport));
const Sport = (s: string) => sport(s).charAt(0).toUpperCase() + sport(s).slice(1);

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
    fris: "There is room for a hard session or a race.",
    "in balans": "Load and recovery are in balance.",
    vermoeid: "You are building up; plan an easier day soon.",
    "zeer vermoeid": "Load is high compared with what you are used to; take a rest.",
  } as Record<string, string>,

  formMethod:
    "Load per session = TRIMP from average heart rate, resting heart rate and your own max per sport. Fitness is the 42-day average, fatigue 7 days, form the difference between the two at the end of yesterday (where you start today).",

  formTsb: "Form = fitness minus fatigue as of yesterday: where you stand at the start of today.",

  formChartNote: "The average applies to form; diamonds are races and tests.",

  syncStale: (days: number) =>
    `The last sync is ${days} days old. Sessions and recovery since then are still missing; fitness, fatigue and form count those days as rest days.`,

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
} satisfies DeepPartial<Texts>;
