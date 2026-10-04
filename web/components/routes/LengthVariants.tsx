// "3 varianten: 38, 42 en 47 km": de lengtevarianten van één rondje. Niets bij één variant.

import { T } from "@/lib/texts";
import type { RouteLengthVariant } from "@/lib/training";

const km = (v: number) => (v >= 20 ? String(Math.round(v)) : v.toFixed(1).replace(".", ","));

export default function LengthVariants({ variants, className = "" }: { variants?: RouteLengthVariant[]; className?: string }) {
  if (!variants || variants.length < 2) return null;
  return (
    <span className={`tabular-nums ${className}`} title={`${T.routes.variantsHelp} ${variants.map((v) => `${km(v.distance_km)} km: ${v.runs}×`).join(", ")}`}>
      {T.routes.variants(variants.map((v) => km(v.distance_km)))}
    </span>
  );
}
