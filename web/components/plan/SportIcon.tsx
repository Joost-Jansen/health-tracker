// Kleine sportglyphs in dezelfde lijnstijl als components/icons.tsx (streek 1,5, currentColor), en een rond
// badgetje in de sportkleur voor in de weekkaarten.

import type { SVGProps } from "react";
import { useT } from "@/lib/i18n";
import { sportColour } from "./plan";

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...props }: P) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

const GLYPH: Record<string, React.ReactNode> = {
  run: (
    <>
      <circle cx="14.5" cy="4.5" r="1.8" />
      <path d="M8 21l3.2-5.2 3 2.2v3.5" />
      <path d="M6.5 11.5l3-3.2h4l2.2 3.4 2.8 1" />
      <path d="M13.5 8.3l-2.3 7.5" />
    </>
  ),
  ride: (
    <>
      <circle cx="6" cy="16.5" r="3.6" />
      <circle cx="18" cy="16.5" r="3.6" />
      <path d="M6 16.5l3.6-7h5.2L18 16.5" />
      <path d="M9.6 9.5L12.5 16.5h-6.5" />
      <path d="M13.5 6.5h2.5" />
    </>
  ),
  swim: (
    <>
      <path d="M3 17c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0" />
      <path d="M3 20.5c1.5 1.2 3 1.2 4.5 0s3-1.2 4.5 0 3 1.2 4.5 0 3-1.2 4.5 0" />
      <circle cx="16.5" cy="7" r="1.8" />
      <path d="M5 13.5l5-4.5 3 3 3-2" />
    </>
  ),
  strength_training: (
    <>
      <path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10" />
    </>
  ),
  rest: <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
};

export function SportGlyph({ sport, ...props }: { sport: string } & P) {
  return <Svg {...props}>{GLYPH[sport] ?? <circle cx="12" cy="12" r="5" />}</Svg>;
}

/** Rond badgetje: zachte sportkleur als vlak, de glyph in de volle kleur. */
export function SportBadge({ sport, size = 30 }: { sport: string; size?: number }) {
  const t = useT();
  const c = sportColour(sport);
  return (
    <span
      title={t.sport(sport)}
      className="inline-flex flex-none items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c }}
    >
      <SportGlyph sport={sport} width={size * 0.56} height={size * 0.56} />
    </span>
  );
}
