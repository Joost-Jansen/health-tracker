"use client";

// Alle routes over elkaar: dunne, half doorzichtige lijnen. Waar je vaak loopt wordt de lijn vanzelf dik
// en verzadigd. Op canvas, want honderden polylines als svg maken de kaart traag.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { cssVar, tileLayerFor, useDark } from "./useTheme";

export default function HeatMap({ tracks, height = 520 }: { tracks: [number, number][][]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const dark = useDark();

  useEffect(() => {
    let cancelled = false;
    let remove = () => {};
    (async () => {
      const Lf = await import("leaflet");
      if (cancelled || !box.current || tracks.length === 0) return;
      const m = Lf.map(box.current, { preferCanvas: true, scrollWheelZoom: false });
      remove = () => m.remove();
      const tiles = tileLayerFor(dark);
      Lf.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: 19, subdomains: "abcd" }).addTo(m);
      const colour = dark ? cssVar("--zone-5", "#cf6d71") : cssVar("--oxblood-400", "#d9484c");
      const renderer = Lf.canvas();
      for (const t of tracks) Lf.polyline(t, { color: colour, weight: 2.5, opacity: 0.28, renderer, interactive: false }).addTo(m);

      // Inzoomen op het gebied waar de meeste routes starten (thuis), niet op alle vakanties samen.
      const starts = tracks.map((t) => t[0]);
      const key = (p: [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      const counts = new Map<string, number>();
      starts.forEach((p) => counts.set(key(p), (counts.get(key(p)) ?? 0) + 1));
      const home = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const local = tracks.filter((t) => key(t[0]) === home).flat();
      m.fitBounds(Lf.latLngBounds(local.length ? local : tracks.flat()), { padding: [12, 12] });
    })();
    return () => {
      cancelled = true;
      remove();
    };
  }, [tracks, dark]);

  if (tracks.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">Geen routes met GPS.</p>;
  return <div ref={box} className="z-0 w-full overflow-hidden rounded" style={{ height }} role="img" aria-label={`Heatmap van ${tracks.length} routes`} />;
}
