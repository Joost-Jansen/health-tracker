// De navigatie van de site, op één plek. Zelfde vorm als in een eerder project.

export type NavTab = { id: string; label: string; href: string };

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
      { id: "plan", label: "Schema", href: "/plan/", icon: "clipboard" },
      { id: "historie", label: "Historie", href: "/historie/", icon: "map" },
      { id: "rondjes", label: "Rondjes", href: "/rondjes/", icon: "route" },
      { id: "trends", label: "Trends", href: "/trends/", icon: "chart" },
    ],
  },
];

export function findItem(groups: NavGroup[], pathname: string): NavItem | undefined {
  const path = pathname.endsWith("/") ? pathname : pathname + "/";
  return groups.flatMap((g) => g.items).find((i) => path.startsWith(i.href) || i.extraPaths?.some((p) => path.startsWith(p)));
}
