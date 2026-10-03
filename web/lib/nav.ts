// De navigatie van de site, op één plek.

export type NavTab = { id: string; label: string; href: string; adminOnly?: boolean };

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  tabs?: NavTab[];
  extraPaths?: string[];
};

export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    items: [
      { id: "dashboard", label: "Vandaag", href: "/dashboard/", icon: "layout" },
      { id: "trends", label: "Trends", href: "/trends/", icon: "chart" },
      { id: "rondjes", label: "Rondjes", href: "/rondjes/", icon: "route" },
      { id: "historie", label: "Historie", href: "/historie/", icon: "map" },
      { id: "plan", label: "Schema", href: "/plan/", icon: "clipboard" },
      {
        id: "logboek",
        label: "Logboek",
        href: "/log/",
        icon: "book",
        extraPaths: ["/analyses/"],
        tabs: [
          { id: "log", label: "Log", href: "/log/" },
          { id: "analyses", label: "Analyses", href: "/analyses/" },
          { id: "doelen", label: "Doelen", href: "/analyses/doelen/" },
          { id: "profiel", label: "Profiel", href: "/analyses/profiel/" },
        ],
      },
      {
        id: "instellingen",
        label: "Instellingen",
        href: "/instellingen/",
        icon: "settings",
        tabs: [
          { id: "account", label: "Account", href: "/instellingen/" },
          { id: "koppelingen", label: "Koppelingen", href: "/instellingen/koppelingen/" },
          { id: "zones", label: "Zones en profiel", href: "/instellingen/zones/" },
          { id: "agents", label: "Agents", href: "/instellingen/agents/" },
          { id: "beheer", label: "Beheer", href: "/instellingen/beheer/", adminOnly: true },
        ],
      },
      {
        // Eén plek voor alle uitleg: de checklist, de handleiding en Claude als coach.
        id: "help",
        label: "Help",
        href: "/help/",
        icon: "help",
        tabs: [
          { id: "start", label: "Aan de slag", href: "/help/" },
          { id: "handleiding", label: "Handleiding", href: "/help/handleiding/" },
          { id: "claude", label: "Claude", href: "/help/claude/" },
        ],
      },
    ],
  },
];

export function findItem(groups: NavGroup[], pathname: string): NavItem | undefined {
  const path = pathname.endsWith("/") ? pathname : pathname + "/";
  return groups.flatMap((g) => g.items).find((i) => path.startsWith(i.href) || i.extraPaths?.some((p) => path.startsWith(p)));
}
