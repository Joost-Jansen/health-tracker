"use client";

// Eén regel boven een pagina die nog leeg is: waar je begint (zoals StartBanner.tsx in een eerder project). Alleen zolang er
// nog geen trainingen zijn, met een tekst die past bij waar je staat (niet gekoppeld, eerste sync bezig, wacht op sync).
// Niet op Vandaag: daar staat de checklist. Weg te klikken; dat wordt bij je account bewaard.
//
// Ook hier: welke pagina's van de stap "Rondkijken" je al bekeken hebt (useRecordVisit).

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGES, useOnboarding, useSetOnboarding, type Onboarding, type Page } from "@/lib/onboarding";

const SCREENS = ["/trends/", "/rondjes/", "/historie/", "/plan/"];

function text(o: Onboarding): { text: string; href: string; link: string } {
  const st = o.status;
  if (!st.garmin.connected) {
    return { text: "Nog geen trainingen: koppel je Garmin-account, dan vult deze pagina zich vanzelf.", href: "/instellingen/koppelingen/", link: "Garmin koppelen" };
  }
  if (st.sync.running) {
    return { text: "De eerste sync loopt: de site haalt je trainingen van het afgelopen jaar op. Dat duurt een paar minuten.", href: "/help/handleiding/#gegevens", link: "Zo werkt het" };
  }
  return { text: "Garmin is gekoppeld, maar er zijn nog geen trainingen binnen.", href: "/instellingen/koppelingen/", link: "Naar Koppelingen" };
}

export default function StartBanner({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const q = useOnboarding(enabled);
  const set = useSetOnboarding();
  const o = q.data;
  if (!o) return null;
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (!SCREENS.some((s) => path.startsWith(s))) return null;
  if (o.status.activities.count > 0 || o.hidden.includes("data")) return null;
  const t = text(o);

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md px-4 py-3 text-sm" style={{ background: "var(--surface-inset)" }}>
      <span>
        {t.text}{" "}
        <Link href={t.href} className="font-semibold underline underline-offset-4">{t.link}</Link>
      </span>
      <button type="button" className="text-xs text-ink-muted underline underline-offset-4" onClick={() => set.mutate({ hide: "data" })}>
        Verbergen
      </button>
    </div>
  );
}

/** Onthoudt welke pagina's van de stap Rondkijken je hebt geopend (hooguit één keer per pagina). */
export function useRecordVisit(pathname: string, enabled: boolean) {
  const q = useOnboarding(enabled);
  const set = useSetOnboarding();
  const sent = useRef<Set<Page>>(new Set());
  const visited = q.data?.visited;
  useEffect(() => {
    if (!visited) return;
    const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
    const page = PAGES.find((p) => path.startsWith(p.href))?.id;
    if (!page || visited.includes(page) || sent.current.has(page)) return;
    sent.current.add(page);
    set.mutate({ visit: page });
  }, [pathname, visited, set]);
}
