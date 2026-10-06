"use client";

// The tab of Trends: training (load, intensity and fitness), performance (races, records, predictions) or
// recovery. Lives in the address bar (?tab=recovery), so a link opens the right tab; the default tab leaves no
// parameter. Touches only its own parameter, so the time window and the sport filter stay.

import { useCallback, useEffect, useState } from "react";

export const TRENDS_TABS = ["training", "performance", "recovery"] as const;
export type TrendsTab = (typeof TRENDS_TABS)[number];
const PARAM = "tab";
const isTab = (v: string | null): v is TrendsTab => !!v && (TRENDS_TABS as readonly string[]).includes(v);

export function useTrendsTab() {
  const [tab, setTab] = useState<TrendsTab>("training");

  // Read only after loading: the page is prebuilt as static html, without an address bar.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(PARAM);
    if (isTab(value)) setTab(value);
  }, []);

  const choose = useCallback((value: string) => {
    const next = isTab(value) ? value : "training";
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "training") url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, next);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
  }, []);

  return { tab, choose };
}
