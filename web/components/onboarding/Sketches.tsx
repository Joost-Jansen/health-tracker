// Small cartoon sketches of the site for the tour: a browser window with a stylised version of a page. Inline SVG with
// the theme's own tokens, so light and dark mode both work; placeholder bars instead of text, so there is nothing to
// translate. Decorative only (aria-hidden): the step's own title and text say what the page is for.

import type { StepId } from "@/lib/onboarding";
import type { NavItem } from "@/lib/nav";

export type SketchId = Exclude<StepId, "explore" | "goals" | "plan"> | "goals-plan" | NavItem["id"];

const LINE = "var(--border-strong)";
const SOFT = "var(--surface-inset)";
const CARD = "var(--surface-card)";
const BRAND = "var(--brand)";
const POS = "var(--pos)";

/** A rounded placeholder bar for a line of text. */
function Bar({ x, y, w, h = 5, fill = LINE }: { x: number; y: number; w: number; h?: number; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
}

/** A small card inside the page. */
function Box({ x, y, w, h, fill = CARD }: { x: number; y: number; w: number; h: number; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={6} fill={fill} stroke="var(--border)" />;
}

function Tick({ x, y, done = true }: { x: number; y: number; done?: boolean }) {
  return (
    <g>
      <circle cx={x} cy={y} r={5} fill={done ? POS : SOFT} />
      {done && <path d={`M${x - 2.4} ${y} l1.7 1.8 l3.2 -3.4`} fill="none" stroke={CARD} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
}

function Field({ x, y, w }: { x: number; y: number; w: number }) {
  return (
    <g>
      <Bar x={x} y={y} w={w * 0.35} h={4} />
      <rect x={x} y={y + 7} width={w} height={12} rx={4} fill={CARD} stroke="var(--border)" />
    </g>
  );
}

function Toggle({ x, y, on }: { x: number; y: number; on: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={20} height={11} rx={5.5} fill={on ? BRAND : SOFT} stroke="var(--border)" />
      <circle cx={on ? x + 14.5 : x + 5.5} cy={y + 5.5} r={3.8} fill={CARD} />
    </g>
  );
}

// The page content, drawn in a 288 x 100 area (x 16..304, y 30..130).
const PAGES: Record<SketchId, React.ReactNode> = {
  garmin: (
    <g>
      {/* a watch, an arrow, a login card */}
      <rect x={58} y={52} width={14} height={56} rx={5} fill={SOFT} stroke="var(--border)" />
      <circle cx={65} cy={80} r={16} fill={CARD} stroke={LINE} strokeWidth={2} />
      <path d="M65 71 v9 l6 4" fill="none" stroke={BRAND} strokeWidth={2} strokeLinecap="round" />
      <path d="M100 80 h40 m-7 -6 l7 6 l-7 6" fill="none" stroke={LINE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Box x={160} y={42} w={110} h={78} />
      <Field x={172} y={50} w={86} />
      <Field x={172} y={74} w={86} />
      <rect x={172} y={100} width={42} height={12} rx={6} fill={BRAND} />
    </g>
  ),
  sync: (
    <g>
      <circle cx={52} cy={62} r={16} fill={CARD} stroke="var(--border)" />
      <path d="M44 60 a8 8 0 0 1 14 -4 m0 -5 v5 h-5 M60 64 a8 8 0 0 1 -14 4 m0 5 v-5 h5" fill="none" stroke={BRAND} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={30} y={96} width={46} height={7} rx={3.5} fill={SOFT} />
      <rect x={30} y={96} width={30} height={7} rx={3.5} fill={BRAND} />
      {[0, 1, 2, 3].map((r) => (
        <g key={r} opacity={r === 3 ? 0.4 : 1}>
          <Box x={100} y={38 + r * 23} w={184} h={18} />
          <circle cx={112} cy={47 + r * 23} r={4} fill={`var(--chart-${r + 1})`} />
          <Bar x={122} y={44.5 + r * 23} w={70 - r * 8} />
          <Bar x={240} y={44.5 + r * 23} w={32} fill={SOFT} />
        </g>
      ))}
    </g>
  ),
  zones: (
    <g>
      {[1, 2, 3, 4, 5].map((z) => (
        <g key={z}>
          <Bar x={40} y={38 + (z - 1) * 18} w={30} h={6} />
          <rect x={82} y={35 + (z - 1) * 18} width={60 + z * 30} height={12} rx={4} fill={`var(--zone-${z})`} />
        </g>
      ))}
    </g>
  ),
  profile: (
    <g>
      <circle cx={70} cy={66} r={20} fill={SOFT} stroke="var(--border)" />
      <circle cx={70} cy={60} r={7} fill={LINE} />
      <path d="M57 78 a13 10 0 0 1 26 0" fill={LINE} />
      <Bar x={50} y={96} w={40} />
      <Field x={120} y={38} w={74} />
      <Field x={206} y={38} w={74} />
      <Field x={120} y={72} w={74} />
      <Field x={206} y={72} w={74} />
    </g>
  ),
  agent: (
    <g>
      {/* a token key and a short chat */}
      <circle cx={52} cy={62} r={11} fill="none" stroke={BRAND} strokeWidth={3} />
      <path d="M63 62 h28 m-8 0 v8 m-8 -8 v6" fill="none" stroke={BRAND} strokeWidth={3} strokeLinecap="round" />
      <rect x={30} y={92} width={78} height={14} rx={5} fill={SOFT} stroke="var(--border)" />
      <Bar x={38} y={97} w={50} h={4} />
      <rect x={136} y={38} width={110} height={24} rx={10} fill={SOFT} />
      <Bar x={146} y={47} w={80} />
      <rect x={170} y={70} width={114} height={34} rx={10} fill="var(--brand-tint)" stroke="var(--border)" />
      <Bar x={180} y={78} w={90} />
      <Bar x={180} y={89} w={64} />
    </g>
  ),
  "goals-plan": (
    <g>
      <Box x={24} y={36} w={100} h={88} />
      <Bar x={34} y={46} w={50} h={6} fill={BRAND} />
      {[0, 1, 2, 3].map((r) => <Bar key={r} x={34} y={62 + r * 13} w={[76, 60, 70, 44][r]} />)}
      <PlanGrid x={140} y={36} w={144} rows={3} />
    </g>
  ),
  dashboard: (
    <g>
      <Box x={20} y={34} w={84} h={52} />
      <circle cx={62} cy={60} r={15} fill="none" stroke={SOFT} strokeWidth={5} />
      <path d="M62 45 a15 15 0 1 1 -14.3 19.6" fill="none" stroke={POS} strokeWidth={5} strokeLinecap="round" />
      <Box x={112} y={34} w={84} h={52} />
      {[1, 2, 3, 4, 5].map((z) => <rect key={z} x={122 + (z - 1) * 13} y={74 - [10, 24, 14, 7, 4][z - 1]} width={10} height={[10, 24, 14, 7, 4][z - 1]} rx={2} fill={`var(--zone-${z})`} />)}
      <Box x={204} y={34} w={96} h={52} />
      <Bar x={214} y={44} w={40} />
      <path d="M214 74 l14 -8 l14 4 l14 -12 l14 6 l14 -10" fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Box x={20} y={94} w={280} h={32} />
      <Tick x={34} y={110} />
      <Bar x={46} y={107.5} w={90} />
      <Tick x={170} y={110} done={false} />
      <Bar x={182} y={107.5} w={80} />
    </g>
  ),
  trends: (
    <g>
      {[0, 1, 2, 3].map((r) => <line key={r} x1={30} x2={290} y1={44 + r * 24} y2={44 + r * 24} stroke="var(--data-grid)" />)}
      <path d="M30 108 C70 100 90 70 130 76 S190 56 220 60 S270 40 290 42 L290 116 L30 116 Z" fill="var(--chart-1)" opacity={0.14} />
      <path d="M30 108 C70 100 90 70 130 76 S190 56 220 60 S270 40 290 42" fill="none" stroke="var(--chart-1)" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M30 96 C80 92 120 96 160 88 S240 84 290 74" fill="none" stroke="var(--chart-3)" strokeWidth={1.8} strokeDasharray="4 4" strokeLinecap="round" />
      <circle cx={290} cy={42} r={4} fill="var(--chart-1)" />
    </g>
  ),
  routes: (
    <g>
      <rect x={20} y={34} width={280} height={92} rx={6} fill={SOFT} />
      <path d="M20 70 Q120 60 300 86 M110 34 Q130 80 100 126 M210 34 Q230 90 260 126" fill="none" stroke={CARD} strokeWidth={5} />
      <path d="M90 104 C60 90 70 52 120 50 S210 40 236 64 S226 110 180 108 S120 116 90 104 Z" fill="none" stroke={BRAND} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={90} cy={104} r={5} fill={CARD} stroke={BRAND} strokeWidth={2.5} />
    </g>
  ),
  history: (
    <g>
      <Box x={20} y={34} w={280} h={30} />
      {Array.from({ length: 14 }, (_, n) => {
        const h = [8, 14, 6, 18, 10, 4, 12, 16, 7, 20, 9, 5, 13, 11][n];
        return <rect key={n} x={32 + n * 19} y={58 - h} width={12} height={h} rx={2} fill="var(--chart-1)" opacity={0.75} />;
      })}
      {[0, 1, 2].map((r) => (
        <g key={r}>
          <Box x={20} y={70 + r * 19} w={280} h={15} />
          <circle cx={32} cy={77.5 + r * 19} r={3.5} fill={`var(--chart-${r + 1})`} />
          <Bar x={42} y={75 + r * 19} w={[70, 56, 64][r]} />
          {[1, 2, 3, 4, 5].map((z) => {
            const w = [[6, 30, 10, 4, 2], [10, 20, 14, 6, 2], [4, 36, 8, 2, 2]][r][z - 1];
            const x = 230 + [[0, 6, 36, 46, 50], [0, 10, 30, 44, 50], [0, 4, 40, 48, 50]][r][z - 1];
            return <rect key={z} x={x} y={75 + r * 19} width={w} height={5} fill={`var(--zone-${z})`} />;
          })}
        </g>
      ))}
    </g>
  ),
  plan: <PlanGrid x={24} y={34} w={272} rows={3} />,
  log: (
    <g>
      <Box x={24} y={34} w={168} h={92} />
      <Bar x={36} y={45} w={60} h={6} fill={BRAND} />
      {[0, 1, 2, 3, 4].map((r) => <Bar key={r} x={36} y={60 + r * 12} w={[140, 120, 132, 90, 110][r]} />)}
      {[0, 1, 2].map((r) => (
        <g key={r}>
          <Box x={204} y={34 + r * 32} w={92} h={26} />
          <Bar x={214} y={42 + r * 32} w={[56, 44, 62][r]} />
          <Bar x={214} y={51 + r * 32} w={36} h={4} fill={SOFT} />
        </g>
      ))}
    </g>
  ),
  settings: (
    <g>
      {[0, 1, 2, 3].map((r) => <Bar key={r} x={24} y={40 + r * 16} w={[48, 62, 40, 54][r]} fill={r === 1 ? BRAND : LINE} />)}
      <Box x={100} y={34} w={196} h={92} />
      <Field x={112} y={42} w={172} />
      {[0, 1].map((r) => (
        <g key={r}>
          <Bar x={112} y={76 + r * 22} w={[90, 70][r]} />
          <Toggle x={264} y={73 + r * 22} on={r === 0} />
        </g>
      ))}
    </g>
  ),
  help: (
    <g>
      <Box x={24} y={34} w={176} h={92} />
      {[0, 1, 2, 3].map((r) => (
        <g key={r}>
          <Tick x={40} y={50 + r * 20} done={r < 2} />
          <Bar x={52} y={47.5 + r * 20} w={[110, 90, 120, 76][r]} />
        </g>
      ))}
      <circle cx={250} cy={72} r={30} fill="var(--brand-tint)" stroke="var(--border)" />
      <path d="M241 64 a9 9 0 1 1 13 8 c-3 2 -4 3 -4 7" fill="none" stroke={BRAND} strokeWidth={3.5} strokeLinecap="round" />
      <circle cx={250} cy={88} r={2.4} fill={BRAND} />
    </g>
  ),
};

/** A plan as a little table: a week per row, sessions done, missed or still to come. */
function PlanGrid({ x, y, w, rows }: { x: number; y: number; w: number; rows: number }) {
  const cw = w / 7;
  const state = ["d", "", "d", "m", "d", "", "d", "d", "", "d", "d", "", "d", "", "p", "", "p", "p", "", "p", ""];
  return (
    <g>
      <rect x={x} y={y} width={w} height={rows * 28 + 4} rx={6} fill={CARD} stroke="var(--border)" />
      {Array.from({ length: rows * 7 }, (_, n) => {
        const s = state[n % state.length];
        const cx = x + (n % 7) * cw + 3;
        const cy = y + 4 + Math.floor(n / 7) * 28;
        const fill = s === "d" ? "var(--pos-tint)" : s === "m" ? "var(--neg-tint)" : s === "p" ? SOFT : "none";
        return (
          <g key={n}>
            <rect x={cx} y={cy} width={cw - 6} height={24} rx={4} fill={fill} />
            {s === "d" && <Tick x={cx + (cw - 6) / 2} y={cy + 12} />}
            {s === "p" && <Bar x={cx + 4} y={cy + 10} w={Math.max(4, cw - 14)} h={4} />}
          </g>
        );
      })}
    </g>
  );
}

/** A browser window with a sketch of the page. Scales with its container. */
export function Sketch({ id }: { id: SketchId }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--surface-inset)" }}>
      <svg viewBox="0 0 320 140" className="block h-auto w-full" aria-hidden focusable="false">
        <rect x={4} y={4} width={312} height={132} rx={10} fill={CARD} stroke="var(--border)" />
        <path d="M4 22 h312" stroke="var(--border)" />
        {[0, 1, 2].map((n) => <circle key={n} cx={16 + n * 10} cy={13} r={3} fill={LINE} />)}
        <rect x={60} y={8.5} width={140} height={9} rx={4.5} fill={SOFT} />
        {PAGES[id]}
      </svg>
    </div>
  );
}
