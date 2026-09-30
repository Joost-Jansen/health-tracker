// Drie soorten tabs, één component — en de keuze tussen de drie is een
// inhoudelijke, niet een esthetische:
//
//   underline   wisselt tussen aanzichten van hetzelfde onderwerp
//               (Posities · Details). Staat in de kop van het scherm.
//   quiet       een periode of een filter, vlak naast het ding dat het filtert
//               (1M · 6M · 1J). Nooit als chroom bovenaan de pagina.
//   segmented   een compacte schakelaar binnen een blok. Alleen daar.
//
// De actieve underline-tab krijgt een inktstreepje, de actieve quiet-tab een
// salie haarlijntje.

export type TabItem = { id: string; label: React.ReactNode; href?: string };

import Link from "next/link";

export default function Tabs({
  items,
  value,
  onChange,
  variant = "underline",
  ariaLabel,
  className = "",
}: {
  items: (string | TabItem)[];
  value?: string;
  /** Weglaten als de tabs `href` dragen — dan navigeert de tab in plaats van te schakelen. */
  onChange?: (id: string) => void;
  variant?: "underline" | "quiet" | "segmented";
  ariaLabel?: string;
  className?: string;
}) {
  const norm: TabItem[] = items.map((i) => (typeof i === "string" ? { id: i, label: i } : i));

  if (variant === "segmented") {
    return (
      <div className={`ds-segmented ${className}`} role="group" aria-label={ariaLabel}>
        {norm.map((i) => (
          <button
            key={i.id}
            type="button"
            aria-pressed={i.id === value}
            onClick={() => onChange?.(i.id)}
            className={`ds-segmented__item ${i.id === value ? "ds-segmented__item--active" : ""}`}
          >
            {i.label}
          </button>
        ))}
      </div>
    );
  }

  const cls = `ds-tabs ${variant === "quiet" ? "ds-tabs--quiet" : ""} ${className}`;

  return (
    <div className={cls} role={ariaLabel ? "group" : undefined} aria-label={ariaLabel}>
      {norm.map((i) => {
        const active = i.id === value;
        const tabClass = `ds-tab ${active ? "ds-tab--active" : ""}`;
        // Een tab die een eigen adres heeft is een link, geen knop: dat is wat
        // een bladwijzer, het toetsenbord en de middelste muisknop nodig hebben.
        return i.href ? (
          <Link key={i.id} href={i.href} aria-current={active ? "page" : undefined} className={tabClass}>
            {i.label}
          </Link>
        ) : (
          <button
            key={i.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(i.id)}
            className={tabClass}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}
