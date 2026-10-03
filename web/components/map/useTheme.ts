"use client";

// Licht of donker zoals de pagina hem nu toont (data-theme of de systeemvoorkeur), en een
// CSS-token als echte kleur. Leaflet tekent svg-attributen; daar werkt var(--zone-1) niet in.

import { useEffect, useState } from "react";

function isDark(): boolean {
  const set = document.documentElement.getAttribute("data-theme");
  if (set === "dark") return true;
  if (set === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const update = () => setDark(isDark());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => {
      mo.disconnect();
      mq.removeEventListener("change", update);
    };
  }, []);
  return dark;
}

export function cssVar(name: string, fallback = "#888"): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

// OpenStreetMap-standaardtegels: geen API-sleutel nodig (CARTO vraagt die buiten localhost). De
// tegels zijn fel van zichzelf; de klassen `map-tiles` en `map-tiles--dark` in globals.css maken ze
// zacht (licht) of keren ze om (donker). Het filter zit op de tegellaag, niet op lijnen en stippen.
export function tileLayerFor(dark: boolean) {
  return {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      className: dark ? "map-tiles map-tiles--dark" : "map-tiles",
    },
  };
}
