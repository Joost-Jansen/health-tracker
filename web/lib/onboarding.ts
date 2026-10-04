// Waar een gebruiker staat: hoe hij de site gebruikt, of de rondleiding klaar is, en per stap of hij al gedaan is.
// Bij het account bewaard (api/onboarding.py), dus ook op een ander apparaat. De status komt uit de eigen data (Garmin-koppeling, sync, trainingen, zones, tokens, doelen, schema).

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
  /** 0 is de keuze, 1 de eerste stap van de rondleiding. */
  step: number;
  hidden: Banner[];
  visited: Page[];
  status: OnboardingStatus;
  steps: Record<StepId, boolean>;
  /** Garmin gekoppeld, eerste sync binnen en zones ingesteld. */
  required_done: boolean;
};

export type OnboardingUpdate = { choice?: Choice | null; done?: boolean; step?: number; hide?: Banner; visit?: Page };

export function useOnboarding(enabled = true) {
  return useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api.get<Onboarding>("/api/onboarding"),
    enabled,
    // Tijdens de eerste sync (en zolang die nog moet beginnen) bijhouden, zodat de stap vanzelf afvinkt.
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

/** De keuzes; titel en uitleg staan in lib/i18n (onboarding.choices). */
export const CHOICES: Choice[] = ["site", "claude"];

/** De stappen in de volgorde van de checklist. `optional`: niet nodig om de site te laten werken. Namen en de
 *  naam van de pagina waar je heen gaat staan in lib/i18n (onboarding.steps). */
export const STEPS: { id: StepId; optional: boolean; href: string; claude?: boolean }[] = [
  { id: "garmin", optional: false, href: "/instellingen/koppelingen/" },
  { id: "sync", optional: false, href: "/instellingen/koppelingen/" },
  { id: "zones", optional: false, href: "/instellingen/zones/" },
  { id: "profile", optional: true, href: "/instellingen/zones/" },
  { id: "explore", optional: true, href: "/trends/" },
  { id: "agent", optional: true, href: "/instellingen/agents/", claude: true },
  { id: "goals", optional: true, href: "/analyses/doelen/" },
  { id: "plan", optional: true, href: "/plan/" },
];

/** Hoort deze stap bij hoe je de site gebruikt? Zonder keuze: alles behalve Claude, tenzij al gedaan. */
export function stepShown(step: { id: StepId; claude?: boolean }, o: Pick<Onboarding, "choice" | "steps">): boolean {
  return !step.claude || o.choice === "claude" || o.steps[step.id];
}

/** De pagina's van de stap Rondkijken (naam en wat je er vindt: lib/i18n onboarding.pages). Vandaag telt niet mee:
 *  daar kom je toch binnen. */
export const PAGES: { id: Page; href: string }[] = [
  { id: "dashboard", href: "/dashboard/" },
  { id: "trends", href: "/trends/" },
  { id: "rondjes", href: "/rondjes/" },
  { id: "historie", href: "/historie/" },
];

export const PAUSED_KEY = "rondleiding-gepauzeerd";
