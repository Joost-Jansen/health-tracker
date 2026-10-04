// De navigatie van de site, op één plek. De namen staan in lib/i18n (nav.items, nav.tabs); localizeNav vult ze in.

import type { Messages } from "@/lib/i18n";

export type NavTab = { id: keyof Messages["nav"]["tabs"]; label: string; href: string; adminOnly?: boolean };

export type NavItem = {
  id: keyof Messages["nav"]["items"];
  label: string;
  href: string;
  icon: string;
  tabs?: NavTab[];
  extraPaths?: string[];
};

export type NavGroup = { label?: string; items: NavItem[] };

const tab = (id: NavTab["id"], href: string, adminOnly?: boolean): NavTab => ({ id, label: "", href, ...(adminOnly ? { adminOnly } : {}) });

export const NAV: NavGroup[] = [
  {
    items: [
      { id: "dashboard", label: "", href: "/dashboard/", icon: "layout" },
      { id: "trends", label: "", href: "/trends/", icon: "chart" },
      { id: "rondjes", label: "", href: "/rondjes/", icon: "route" },
      { id: "historie", label: "", href: "/historie/", icon: "map" },
      { id: "plan", label: "", href: "/plan/", icon: "clipboard" },
      {
        id: "logboek",
        label: "",
        href: "/log/",
        icon: "book",
        extraPaths: ["/analyses/"],
        tabs: [tab("log", "/log/"), tab("analyses", "/analyses/"), tab("doelen", "/analyses/doelen/"), tab("profiel", "/analyses/profiel/")],
      },
      {
        id: "instellingen",
        label: "",
        href: "/instellingen/",
        icon: "settings",
        tabs: [
          tab("account", "/instellingen/"),
          tab("koppelingen", "/instellingen/koppelingen/"),
          tab("zones", "/instellingen/zones/"),
          tab("agents", "/instellingen/agents/"),
          tab("beheer", "/instellingen/beheer/", true),
        ],
      },
      {
        // Eén plek voor alle uitleg: de checklist, de handleiding en Claude als coach.
        id: "help",
        label: "",
        href: "/help/",
        icon: "help",
        tabs: [tab("start", "/help/"), tab("handleiding", "/help/handleiding/"), tab("claude", "/help/claude/")],
      },
    ],
  },
];

/** NAV with the names in the user's language. */
export function localizeNav(groups: NavGroup[], t: Messages): NavGroup[] {
  return groups.map((g) => ({
    ...g,
    items: g.items.map((i) => ({ ...i, label: t.nav.items[i.id], tabs: i.tabs?.map((x) => ({ ...x, label: t.nav.tabs[x.id] })) })),
  }));
}

export function findItem(groups: NavGroup[], pathname: string): NavItem | undefined {
  const path = pathname.endsWith("/") ? pathname : pathname + "/";
  return groups.flatMap((g) => g.items).find((i) => path.startsWith(i.href) || i.extraPaths?.some((p) => path.startsWith(p)));
}
