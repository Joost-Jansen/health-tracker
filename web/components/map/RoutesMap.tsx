"use client";

// Eén of meer routes op de kaart, elk in een eigen grafiekkleur met een lichte of donkere rand, en een
// stip op het startpunt. Voor een rondje, of voor een combinatie als "2× park + rondje brug".
// Varianten (de andere keren op hetzelfde rondje) liggen er dun en licht onder, zodat de gemiddelde
// route opvalt en afwijkingen zichtbaar blijven. `interactive={false}` maakt er een vast plaatje van
// voor een kaartje in een raster: niet slepen of zoomen, een klik gaat naar de link eromheen.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";
import { cssVar, tileLayerFor, useDark } from "./useTheme";

export type MapLine = { id: string; label?: string; points: [number, number][]; colour?: string; variant?: boolean };

export default function RoutesMap({ lines, height = 340, interactive = true }: { lines: MapLine[]; height?: number; interactive?: boolean }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const dark = useDark();
  const all = lines.filter((l) => l.points.length >= 2);
  const variants = all.filter((l) => l.variant);
  const drawn = all.filter((l) => !l.variant);

  useEffect(() => {
    let cancelled = false;
    let remove = () => {};
    (async () => {
      const Lf = await import("leaflet");
      if (cancelled || !box.current || drawn.length === 0) return;
      const m = interactive
        ? Lf.map(box.current, { scrollWheelZoom: true, wheelPxPerZoomLevel: 100 })
        : Lf.map(box.current, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
      remove = () => m.remove();
      const tiles = tileLayerFor(dark);
      Lf.tileLayer(tiles.url, tiles.options).addTo(m);
      const casing = dark ? "#0b0f0d" : "#ffffff";
      const main = cssVar("--chart-1");
      for (const v of variants) {
        const line = Lf.polyline(v.points, { color: v.colour ?? main, weight: interactive ? 2.5 : 1.5, opacity: dark ? 0.35 : 0.28, interactive }).addTo(m);
        if (v.label && interactive) line.bindTooltip(v.label, { sticky: true });
      }
      drawn.forEach((l, i) => {
        const colour = l.colour ?? cssVar(`--chart-${[1, 4, 3, 5, 6][i % 5]}`);
        Lf.polyline(l.points, { color: casing, weight: interactive ? 7 : 5, opacity: 0.9, interactive }).addTo(m);
        const line = Lf.polyline(l.points, { color: colour, weight: interactive ? 4 : 3, interactive }).addTo(m);
        if (l.label && interactive) line.bindTooltip(l.label, { sticky: true });
      });
      const start = drawn[0].points[0];
      const dot = Lf.circleMarker(start, { radius: interactive ? 6 : 4, color: casing, weight: 2, fillColor: cssVar("--n-800", "#1f2a26"), fillOpacity: 1, interactive }).addTo(m);
      if (interactive) dot.bindTooltip(t.common.start);
      // inzoomen op de hoofdroute; varianten die ver uitwijken (een stuk uit de stad) vallen dan deels buiten beeld
      m.fitBounds(Lf.latLngBounds(drawn.flatMap((l) => l.points)), { padding: interactive ? [16, 16] : [8, 8] });
    })();
    return () => {
      cancelled = true;
      remove();
    };
  }, [JSON.stringify(all.map((l) => [l.id, l.points.length, l.colour, l.variant])), dark, interactive, t]);

  if (drawn.length === 0) return <p className="py-6 text-center text-sm text-ink-muted">{t.routes.noTrack}</p>;
  return (
    <div
      ref={box}
      className="z-0 w-full overflow-hidden rounded"
      style={{ height, pointerEvents: interactive ? undefined : "none" }}
      role="img"
      aria-label={t.routes.mapAria(variants.length)}
    />
  );
}
