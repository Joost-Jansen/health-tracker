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

export const CHOICES: { id: Choice; title: string; text: string }[] = [
  { id: "site", title: "Alleen de site", text: "Je trainingen, zones, trends, rondjes en schema op de site." },
  { id: "claude", title: "Met Claude als coach", text: "Daarnaast praat Claude met je data: analyses, schema's en je logboek." },
];

/** De stappen in de volgorde van de checklist. `optional`: niet nodig om de site te laten werken. */
export const STEPS: { id: StepId; title: string; optional: boolean; href: string; hrefLabel: string; claude?: boolean }[] = [
  { id: "garmin", title: "Garmin koppelen", optional: false, href: "/instellingen/koppelingen/", hrefLabel: "Naar Koppelingen" },
  { id: "sync", title: "Eerste sync", optional: false, href: "/instellingen/koppelingen/", hrefLabel: "Naar Koppelingen" },
  { id: "zones", title: "Hartslagzones instellen", optional: false, href: "/instellingen/zones/", hrefLabel: "Naar Zones en profiel" },
  { id: "profile", title: "Profiel aanvullen", optional: true, href: "/instellingen/zones/", hrefLabel: "Naar Zones en profiel" },
  { id: "explore", title: "Rondkijken", optional: true, href: "/trends/", hrefLabel: "Naar Trends" },
  { id: "agent", title: "Claude koppelen", optional: true, href: "/instellingen/agents/", hrefLabel: "Naar Agents", claude: true },
  { id: "goals", title: "Doelen vastleggen", optional: true, href: "/analyses/doelen/", hrefLabel: "Naar Doelen" },
  { id: "plan", title: "Schema toevoegen", optional: true, href: "/plan/", hrefLabel: "Naar Schema" },
];

/** Hoort deze stap bij hoe je de site gebruikt? Zonder keuze: alles behalve Claude, tenzij al gedaan. */
export function stepShown(step: { id: StepId; claude?: boolean }, o: Pick<Onboarding, "choice" | "steps">): boolean {
  return !step.claude || o.choice === "claude" || o.steps[step.id];
}

/** De pagina's van de stap Rondkijken, met wat je er vindt. Vandaag telt niet mee: daar kom je toch binnen. */
export const PAGES: { id: Page; label: string; href: string; text: string }[] = [
  { id: "dashboard", label: "Vandaag", href: "/dashboard/", text: "hoe je ervoor staat: herstel, zones deze week, volume en je komende trainingen" },
  { id: "trends", label: "Trends", href: "/trends/", text: "vorm, volume, tempo bij lage hartslag en records over de tijd" },
  { id: "rondjes", label: "Rondjes", href: "/rondjes/", text: "je vaste routes, en een rondje voor het aantal kilometers dat je wilt" },
  { id: "historie", label: "Historie", href: "/historie/", text: "elke training met kaart, hartslagverloop en tussentijden" },
];

export const PAUSED_KEY = "rondleiding-gepauzeerd";
