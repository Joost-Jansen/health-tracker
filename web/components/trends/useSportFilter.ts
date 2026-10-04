"use client";

// Het sportfilter van Trends: "all" of één sport. Staat in de adresbalk (?sport=run), zodat een link of een
// herlaadbeurt hetzelfde laat zien. Raakt alleen zijn eigen parameter, dus het tijdvenster (?periode, ?van, ?tot)
// blijft staan.

import { useCallback, useEffect, useState } from "react";

export const ALL_SPORTS = "all";
const PARAM = "sport";
const VALID = /^[a-z_]{1,40}$/;

export function useSportFilter() {
  const [sport, setSport] = useState(ALL_SPORTS);

  // Pas na het laden lezen: de pagina wordt vooraf als statische html gebouwd, zonder adresbalk.
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
