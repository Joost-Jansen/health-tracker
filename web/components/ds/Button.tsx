// Knoppen. Meridian kent vijf varianten en drie maten; de regels erbij:
//
//   primary    walnoot-zwart. Precies één per scherm.
//   secondary  papier met een rand. De werkpaardknop.
//   ghost      geen vlak. Voor acties naast een sectiekop.
//   brand      terracotta. Nooit in een scherm vol cijfers — het accentmoment
//              van een scherm is er maar één, en dat is meestal geen knop.
//   danger     bordeaux op een randje. Verwijderen, en verder niets.
//
// Hover maakt het vlak één stap warmer, nooit een andere kleur. Indrukken maakt
// het nog een stap donkerder. Geen schaal, geen lift, geen schaduw.

import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "brand" | "danger";
type Size = "sm" | "md" | "lg";

function classes(variant: Variant, size: Size, block: boolean, className: string) {
  return [
    "ds-btn",
    `ds-btn--${variant}`,
    `ds-btn--${size}`,
    block ? "ds-btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

type CommonProps = {
  variant?: Variant;
  size?: Size;
  /** Volle breedte — voor een formulier of een paneel op een telefoon. */
  block?: boolean;
  /** Een 15px-glyph vóór het label. Iconen ondersteunen een label, ze vervangen het nooit. */
  icon?: React.ReactNode;
  /** Dezelfde glyph, maar erachter — voor "verder"-achtige acties. */
  iconAfter?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  icon,
  iconAfter,
  className = "",
  children,
  ...rest
}: CommonProps & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button type="button" className={classes(variant, size, block, className)} {...rest}>
      {icon && <span className="ds-btn__icon">{icon}</span>}
      {children}
      {iconAfter && <span className="ds-btn__icon">{iconAfter}</span>}
    </button>
  );
}

/** Dezelfde knop, maar hij navigeert. */
export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  block = false,
  icon,
  iconAfter,
  className = "",
  children,
  ...rest
}: CommonProps & { href: string } & Omit<React.ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link href={href} className={classes(variant, size, block, className)} {...rest}>
      {icon && <span className="ds-btn__icon">{icon}</span>}
      {children}
      {iconAfter && <span className="ds-btn__icon">{iconAfter}</span>}
    </Link>
  );
}

/**
 * Een knop die alleen een glyph toont.
 *
 * `label` is verplicht, niet optioneel: een knop zonder tekst is voor een
 * schermlezer een knop zonder betekenis, en dit is de enige plek in het systeem
 * waar een icoon een label mág vervangen.
 */
export function IconButton({
  label,
  icon,
  size = "md",
  bordered = false,
  className = "",
  ...rest
}: {
  label: string;
  icon: React.ReactNode;
  size?: Size;
  bordered?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={["ds-iconbtn", `ds-iconbtn--${size}`, bordered ? "ds-iconbtn--bordered" : "", className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {icon}
    </button>
  );
}
