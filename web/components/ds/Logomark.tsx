// Het beeldmerk: een hartslaglijn die in een lus eindigt, een rondje hardlopen.
//
//   de lijn   `currentColor`, dezelfde kleur als de tekst ernaast
//   de stip   `--logo-accent`, standaard de salie van het thema
//
// Op de zijbalk zet ds.css het accent lichter, want die rail is altijd donker.

export default function Logomark({ height, className }: { height: number; className?: string }) {
  return (
    <svg viewBox="0 0 32 24" height={height} width={Math.round((height * 32) / 24)} className={className} aria-hidden focusable="false">
      <path
        d="M1.5 14h6l2.5-8 4 15 3-10 2 3h4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="26.5" cy="14" r="4" fill="var(--logo-accent, var(--sage-500))" />
    </svg>
  );
}
