"use client";

// De schil van elke pagina achter de login: zijbalk, bovenbalk, inhoud.

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import SidebarNav from "@/components/ds/SidebarNav";
import ThemeToggle from "@/components/ThemeToggle";
import { IconButton, Tabs } from "@/components/ds";
import { MenuIcon } from "@/components/icons";
import { api, ApiError } from "@/lib/api";
import { findItem, localizeNav, NAV } from "@/lib/nav";
import { useAccountLocale, useT } from "@/lib/i18n";
import type { Me } from "@/lib/training";
import StartBanner, { useRecordVisit } from "@/components/onboarding/StartBanner";
import Welkom from "@/components/onboarding/Welkom";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const [navOpen, setNavOpen] = useState(false);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Me>("/api/me"),
    retry: false,
  });
  // Onboarding: welke pagina's van "Rondkijken" je opende; banner en rondleiding hieronder.
  useRecordVisit(pathname, !!me.data);
  useAccountLocale(me.data?.locale);

  if (me.error instanceof ApiError && me.error.status === 401) {
    router.replace("/login/");
    return null;
  }
  if (!me.data) {
    return <div className="grid min-h-screen place-items-center text-sm text-ink-muted">{t.common.loading}</div>;
  }

  const nav = localizeNav(NAV, t);
  const item = findItem(nav, pathname);
  const tabs = (item?.tabs ?? []).filter((t) => !t.adminOnly || me.data.is_admin);

  return (
    <div className="flex min-h-screen">
      <SidebarNav
        groups={nav}
        activeId={item?.id ?? null}
        open={navOpen}
        onOpen={() => setNavOpen(true)}
        onClose={() => setNavOpen(false)}
        footer={
          <div className="flex items-center justify-between px-2 pb-1 text-xs leading-normal" style={{ color: "var(--text-on-ink-muted)" }}>
            <span>{t.nav.loggedInAs(me.data.display_name || me.data.username)}</span>
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={async () => {
                await api.post("/api/logout");
                router.replace("/login/");
              }}
            >
              {t.nav.logout}
            </button>
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="ds-topbar ds-topbar--flush sticky top-0 z-30 !gap-3 !px-4 sm:!px-6 lg:!px-page">
          <IconButton label={t.nav.openMenu} onClick={() => setNavOpen(true)} icon={<MenuIcon className="h-[18px] w-[18px]" />} className="-ml-2 lg:hidden" />
          <h1 className="ds-topbar__title truncate">{item?.label ?? t.common.appName}</h1>
          {tabs.length > 1 ? (
            <nav className="ds-topbar__tabs ml-2 min-w-0 flex-1 self-stretch overflow-x-auto no-scrollbar" aria-label={t.nav.views(item?.label ?? "")}>
              <Tabs items={tabs} value={tabs.filter((t) => pathname.startsWith(t.href)).sort((a, b) => b.href.length - a.href.length)[0]?.id} ariaLabel={t.nav.views(item?.label ?? "")} className="h-full whitespace-nowrap" />
            </nav>
          ) : (
            <span className="ds-topbar__spacer" />
          )}
          <div className="flex flex-none items-center gap-1.5">
            <ThemeToggle />
          </div>
        </header>
        <main className="w-full max-w-content flex-1 px-4 pb-20 pt-4 sm:px-6 lg:px-page lg:pt-5">
          {/* Alleen boven een pagina die nog leeg is, en tot je hem wegklikt. */}
          <StartBanner enabled />
          {children}
        </main>
      </div>
      {/* De eerste keer: hoe je de site gebruikt, en de stappen die daarbij horen. */}
      <Welkom enabled />
    </div>
  );
}
