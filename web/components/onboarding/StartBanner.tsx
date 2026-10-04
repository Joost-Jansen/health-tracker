"use client";

// Eén regel boven een pagina die nog leeg is: waar je begint. Alleen zolang er
// nog geen trainingen zijn, met een tekst die past bij waar je staat (niet gekoppeld, eerste sync bezig, wacht op sync).
// Niet op Vandaag: daar staat de checklist. Weg te klikken; dat wordt bij je account bewaard.
//
// Ook hier: welke pagina's van de stap "Rondkijken" je al bekeken hebt (useRecordVisit).

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PAGES, useOnboarding, useSetOnboarding, type Onboarding, type Page } from "@/lib/onboarding";
import { useT, type Messages } from "@/lib/i18n";

const SCREENS = ["/trends/", "/rondjes/", "/historie/", "/plan/"];

function text(o: Onboarding, t: Messages): { text: string; href: string; link: string } {
  const st = o.status;
  const b = t.onboarding.banner;
  if (!st.garmin.connected) return { text: b.notConnected, href: "/instellingen/koppelingen/", link: b.connect };
  if (st.sync.running) return { text: b.syncing, href: "/help/handleiding/#gegevens", link: b.how };
  return { text: b.waiting, href: "/instellingen/koppelingen/", link: b.toConnections };
}

export default function StartBanner({ enabled }: { enabled: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const q = useOnboarding(enabled);
  const set = useSetOnboarding();
  const o = q.data;
  if (!o) return null;
  const path = pathname.endsWith("/") ? pathname : `${pathname}/`;
  if (!SCREENS.some((s) => path.startsWith(s))) return null;
  if (o.status.activities.count > 0 || o.hidden.includes("data")) return null;
  const msg = text(o, t);

  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md px-4 py-3 text-sm" style={{ background: "var(--surface-inset)" }}>
      <span>
        {msg.text}{" "}
        <Link href={msg.href} className="font-semibold underline underline-offset-4">{msg.link}</Link>
      </span>
      <button type="button" className="text-xs text-ink-muted underline underline-offset-4" onClick={() => set.mutate({ hide: "data" })}>
        {t.common.hide}
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
