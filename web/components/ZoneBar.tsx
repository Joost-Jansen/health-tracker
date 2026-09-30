// Eén horizontale balk per sport: de tijd per hartslagzone naast elkaar, met eronder % en uren.

import { fmtDuration, sportLabel, ZONE_COLOUR, ZONES, zoneRanges, type ZoneShare } from "@/lib/training";

export default function ZoneBar({ sport, share, bounds }: { sport: string; share: ZoneShare; bounds?: number[] }) {
  const ranges = bounds ? zoneRanges(bounds) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-medium">{sportLabel(sport)}</span>
        <span className="text-ink-muted tabular-nums">{fmtDuration(share.total_s)} u</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full" style={{ background: "var(--surface-inset)" }} role="img"
        aria-label={ZONES.map((z) => `${z} ${Math.round(share.pct[z])}%`).join(", ")}>
        {ZONES.map((z) => share.pct[z] > 0 && (
          <div key={z} style={{ width: `${share.pct[z]}%`, background: ZONE_COLOUR[z] }} title={`${z}: ${Math.round(share.pct[z])}%`} />
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 text-[11.5px] tabular-nums">
        {ZONES.map((z) => (
          <div key={z} className="flex flex-col">
            <span className="flex items-center gap-1 text-ink-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: ZONE_COLOUR[z] }} />
              {z}
            </span>
            <span className="font-medium">{Math.round(share.pct[z])}%</span>
            <span className="text-ink-muted">{fmtDuration(share.seconds[z])}</span>
            {ranges && <span className="text-[10.5px] text-ink-muted">{ranges[z]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
