"use client";

// The sport filter of Trends: "all" or one sport. Lives in the address bar (?sport=run), so a link or a
// reload shows the same. Touches only its own parameter, so the time window (?periode, ?van, ?tot)
// stays.

import { useCallback, useEffect, useState } from "react";

export const ALL_SPORTS = "all";
const PARAM = "sport";
const VALID = /^[a-z_]{1,40}$/;

export function useSportFilter() {
  const [sport, setSport] = useState(ALL_SPORTS);

  // Read only after loading: the page is prebuilt as static html, without an address bar.
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get(PARAM);
    if (value && VALID.test(value)) setSport(value);
  }, []);

  const choose = useCallback((value: string) => {
    const next = VALID.test(value) ? value : ALL_SPORTS;
    setSport(next);
    const url = new URL(window.location.href);
    if (next === ALL_SPORTS) url.searchParams.delete(PARAM);
    else url.searchParams.set(PARAM, next);
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
  }, []);

  return { sport, choose, all: sport === ALL_SPORTS };
}
