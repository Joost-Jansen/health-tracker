// Where a user stands: how they use the site, whether the tour is done, and per step whether it is done.
// Stored with the account (api/onboarding.py), so also on another device. The status comes from their own data (Garmin connection, sync, workouts, zones, tokens, goals, plan).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type Choice = "site" | "claude";
export type StepId = "garmin" | "sync" | "zones" | "profile" | "explore" | "agent" | "goals" | "plan";
export type Page = "dashboard" | "trends" | "rondjes" | "historie";
export type Banner = "checklist" | "data";

export type OnboardingStatus = {
  garmin: { connected: boolean; connected_at: string | null };
  sync: { last_sync: string | null; last_failed: string[]; running: boolean };
  activities: { count: number; first: string | null; last: string | null; sports: string[] };
  wellness_days: number;
  zones: { set: string[]; estimated: string[]; suggested_max: Record<string, number | null> };
  profile: { filled: string[] };
  agents: { tokens: number };
  goals: boolean;
  plan: { count: number; active: boolean };
};

export type Onboarding = {
  choice: Choice | null;
  done: boolean;
  /** 0 is the choice, 1 the first step of the tour. */
  step: number;
  hidden: Banner[];
  visited: Page[];
  status: OnboardingStatus;
  steps: Record<StepId, boolean>;
  /** Garmin connected, first sync in and zones set. */
  required_done: boolean;
};

export type OnboardingUpdate = { choice?: Choice | null; done?: boolean; step?: number; hide?: Banner; visit?: Page };

export function useOnboarding(enabled = true) {
  return useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api.get<Onboarding>("/api/onboarding"),
    enabled,
    // Poll during the first sync (and while it has yet to start), so the step ticks itself off.
    refetchInterval: (q) => {
      const d = q.state.data;
      if (!d) return false;
      return d.status.sync.running || (d.status.garmin.connected && !d.steps.sync) ? 4000 : false;
    },
  });
}

export function useSetOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fields: OnboardingUpdate) => api.put<Onboarding>("/api/onboarding", fields),
    onSuccess: (d) => qc.setQueryData(["onboarding"], d),
  });
}

/** The choices; title and explanation are in lib/i18n (onboarding.choices). */
export const CHOICES: Choice[] = ["site", "claude"];

/** The steps in checklist order. `optional`: not needed to make the site work. Names and the
 *  name of the page you go to are in lib/i18n (onboarding.steps). */
export const STEPS: { id: StepId; optional: boolean; href: string; claude?: boolean }[] = [
  { id: "garmin", optional: false, href: "/settings/connections/" },
  { id: "sync", optional: false, href: "/settings/connections/" },
  { id: "zones", optional: false, href: "/settings/zones/" },
  { id: "profile", optional: true, href: "/settings/zones/" },
  { id: "explore", optional: true, href: "/trends/" },
  { id: "agent", optional: true, href: "/settings/agents/", claude: true },
  { id: "goals", optional: true, href: "/analyses/goals/" },
  { id: "plan", optional: true, href: "/plan/" },
];

/** Does this step belong to how you use the site? Without a choice: everything except Claude, unless already done. */
export function stepShown(step: { id: StepId; claude?: boolean }, o: Pick<Onboarding, "choice" | "steps">): boolean {
  return !step.claude || o.choice === "claude" || o.steps[step.id];
}

/** The pages of the Rondkijken (look around) step (name and what you find there: lib/i18n onboarding.pages). The
 *  dashboard does not count: you land there anyway. The ids are stored per user (`visited`), so they keep their Dutch names
 *  ("rondjes", "historie") while the pages live on English paths; tests/test_web_routes.py checks both sides. */
export const PAGES: { id: Page; href: string }[] = [
  { id: "dashboard", href: "/dashboard/" },
  { id: "trends", href: "/trends/" },
  { id: "rondjes", href: "/routes/" },
  { id: "historie", href: "/history/" },
];

export const PAUSED_KEY = "rondleiding-gepauzeerd";
