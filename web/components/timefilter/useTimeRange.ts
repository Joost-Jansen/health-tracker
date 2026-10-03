"use client";

// Het gedeelde tijdvenster van een pagina: een periode (4W … Alles) of een
// eigen van-tot. Staat in de adresbalk (?periode=3M, of ?van=…&tot=…) zodat een
// link of een herlaadbeurt hetzelfde laat zien, en in localStorage zodat de
// pagina de laatste keuze onthoudt als je er via het menu terugkomt.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CUSTOM, DEFAULT_PERIOD, PERIODS, clampRange, dayNumber, periodWindow, toRange, toWindow, type DateWindow } from "@/lib/timeline";

type State = { period: string; custom: DateWindow | null; preset: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function readStored(key: string): State | null {
  try {
    const raw = localStorage.getItem(`timerange:${key}`);
    if (!raw) return null;
    const s = JSON.parse(raw) as State;
    if (s.custom && ISO.test(s.custom.from) && ISO.test(s.custom.to)) return { period: CUSTOM, custom: s.custom, preset: PERIODS.includes(s.preset) ? s.preset : DEFAULT_PERIOD };
    if (PERIODS.includes(s.period)) return { period: s.period, custom: null, preset: s.period };
  } catch {
    /* geen opslag: standaard */
  }
  return null;
}

export function useTimeRange(first: string, last: string, key = "trends", initial = DEFAULT_PERIOD) {
  const [state, setState] = useState<State>({ period: initial, custom: null, preset: initial });
  const [ready, setReady] = useState(false);

  // Pas na het laden lezen: de pagina wordt vooraf als statische html gebouwd, zonder adresbalk.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const van = q.get("van");
    const tot = q.get("tot");
    const periode = q.get("periode");
    const stored = readStored(key);
    if (van && tot && ISO.test(van) && ISO.test(tot)) {
      setState({ period: CUSTOM, custom: { from: van, to: tot }, preset: stored?.preset ?? initial });
    } else if (periode && PERIODS.includes(periode)) {
      setState({ period: periode, custom: null, preset: periode });
    } else if (stored) {
      setState(stored);
    }
    setReady(true);
  }, [key, initial]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(`timerange:${key}`, JSON.stringify(state));
    } catch {
      /* privévenster */
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("periode");
    url.searchParams.delete("van");
    url.searchParams.delete("tot");
    if (state.custom) {
      url.searchParams.set("van", state.custom.from);
      url.searchParams.set("tot", state.custom.to);
    } else if (state.period !== initial) {
      url.searchParams.set("periode", state.period);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
  }, [state, ready, key, initial]);

  const window_ = useMemo<DateWindow>(() => {
    // Zolang de data er niet is, is er geen venster (en geen datum om mee te rekenen).
    if (!first || !last) return { from: "", to: "" };
    if (!state.custom) return periodWindow(state.period === CUSTOM ? state.preset : state.period, first, last);
    const r = clampRange(toRange(state.custom), dayNumber(first), dayNumber(last));
    return toWindow({ a: Math.round(r.a), b: Math.round(r.b) });
  }, [state, first, last]);

  const choose = useCallback((period: string) => setState({ period, custom: null, preset: period }), []);
  const change = useCallback(
    (w: DateWindow) => {
      if (!first || !last) return;
      setState((s) => {
        const preset = s.custom ? s.preset : s.period;
        const p = periodWindow(preset, first, last);
        // Terug op precies het venster van de periode: dan is het weer die periode, geen "eigen".
        if (p.from === w.from && p.to === w.to) return { period: preset, custom: null, preset };
        return { period: CUSTOM, custom: w, preset };
      });
    },
    [first, last],
  );
  const reset = useCallback(() => setState((s) => ({ period: s.preset, custom: null, preset: s.preset })), []);

  return { period: state.period, preset: state.preset, custom: state.custom !== null, window: window_, choose, change, reset };
}

export type TimeRange = ReturnType<typeof useTimeRange>;
