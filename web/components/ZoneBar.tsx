// Eén horizontale balk per sport: de tijd per hartslagzone naast elkaar, met eronder % en uren
// en de 80/20-verdeling: rustig (Z1+Z2) tegenover Z3 en hard (Z4+Z5).

import { fmtDuration, sportLabel, ZONE_COLOUR, ZONES, zoneRanges, type ZoneShare } from "@/lib/training";

export default function ZoneBar({ sport, share, bounds }: { sport: string; share: ZoneShare; bounds?: number[] }) {
  const ranges = bounds ? zoneRanges(bounds) : null;
  // los afronden zou samen 99 of 101 kunnen geven; Z3 is de rest
  const easy = Math.round(share.pct.Z1 + share.pct.Z2);
  const hard = Math.round(share.pct.Z4 + share.pct.Z5);
  const grey = Math.max(0, 100 - easy - hard);
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
      {share.total_s > 0 && (
        <p className="text-[12px] tabular-nums text-ink-muted" title="Bij 80/20-training ligt ongeveer 80% van de tijd rustig, in Z1 en Z2 samen.">
          <span className="font-medium text-ink">Rustig (Z1+Z2) {easy}%</span> · Z3 {grey}% · Hard (Z4+Z5) {hard}%
          <span className="ml-1">· richtlijn ~80% rustig</span>
        </p>
      )}
    </div>
  );
}
