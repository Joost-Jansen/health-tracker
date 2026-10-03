"use client";

// Eén of meer routes op de kaart, elk in een eigen grafiekkleur met een lichte of donkere rand, en een
// stip op het startpunt. Voor een rondje, of voor een combinatie als "2× park + rondje brug".

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { cssVar, tileLayerFor, useDark } from "./useTheme";

export type MapLine = { id: string; label?: string; points: [number, number][]; colour?: string };

export default function RoutesMap({ lines, height = 340 }: { lines: MapLine[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const dark = useDark();
  const drawn = lines.filter((l) => l.points.length >= 2);

  useEffect(() => {
    let cancelled = false;
    let remove = () => {};
    (async () => {
      const Lf = await import("leaflet");
      if (cancelled || !box.current || drawn.length === 0) return;
      const m = Lf.map(box.current, { scrollWheelZoom: true, wheelPxPerZoomLevel: 100 });
      remove = () => m.remove();
      const tiles = tileLayerFor(dark);
      Lf.tileLayer(tiles.url, tiles.options).addTo(m);
      const casing = dark ? "#0b0f0d" : "#ffffff";
      drawn.forEach((l, i) => {
        const colour = l.colour ?? cssVar(`--chart-${[1, 4, 3, 5, 6][i % 5]}`);
        Lf.polyline(l.points, { color: casing, weight: 7, opacity: 0.9 }).addTo(m);
        const line = Lf.polyline(l.points, { color: colour, weight: 4 }).addTo(m);
        if (l.label) line.bindTooltip(l.label, { sticky: true });
      });
      const start = drawn[0].points[0];
      Lf.circleMarker(start, { radius: 6, color: casing, weight: 2, fillColor: cssVar("--n-800", "#1f2a26"), fillOpacity: 1 }).bindTooltip("Start").addTo(m);
      m.fitBounds(Lf.latLngBounds(drawn.flatMap((l) => l.points)), { padding: [16, 16] });
    })();
    return () => {
      cancelled = true;
      remove();
    };
  }, [JSON.stringify(drawn.map((l) => [l.id, l.points.length, l.colour])), dark]);

  if (drawn.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">Geen GPS-spoor voor deze route.</p>;
  return <div ref={box} className="z-0 w-full overflow-hidden rounded" style={{ height }} role="img" aria-label="Kaart van de route" />;
}

/** Klein silhouet van een route als svg, zonder kaart: voor kaartjes in een raster. */
export function RouteShape({ points, className = "" }: { points: [number, number][]; className?: string }) {
  if (points.length < 2) return <div className={`rounded bg-[var(--surface-inset)] ${className}`} />;
  const lat0 = points[0][0];
  const k = Math.cos((lat0 * Math.PI) / 180);
  const xs = points.map((p) => p[1] * k);
  const ys = points.map((p) => -p[0]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const pad = 0.08 * span;
  const d = xs.map((x, i) => `${i ? "L" : "M"}${(x - minX + pad).toFixed(6)} ${(ys[i] - minY + pad).toFixed(6)}`).join(" ");
  const vb = `0 0 ${(maxX - minX + 2 * pad).toFixed(6)} ${(maxY - minY + 2 * pad).toFixed(6)}`;
  return (
    <svg viewBox={vb} className={className} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={span / 45} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2.25 }} />
      <circle cx={xs[0] - minX + pad} cy={ys[0] - minY + pad} r={span / 40} fill="var(--n-800)" />
    </svg>
  );
}
