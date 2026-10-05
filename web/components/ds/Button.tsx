// Buttons. Meridian has five variants and three sizes; the rules that go with them:
//
//   primary    walnut black. Exactly one per screen.
//   secondary  paper with a border. The workhorse button.
//   ghost      no surface. For actions next to a section head.
//   brand      terracotta. Never on a screen full of numbers: a screen has only
//              one accent moment, and that is usually not a button.
//   danger     burgundy on an edge. Deleting, and nothing else.
//
// Hover makes the surface one step warmer, never a different colour. Pressing makes
// it one more step darker. No scale, no lift, no shadow.

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
  /** Full width: for a form or a panel on a phone. */
  block?: boolean;
  /** A 15px glyph before the label. Icons support a label, they never replace it. */
  icon?: React.ReactNode;
  /** The same glyph, but after the label: for "next"-like actions. */
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

/** The same button, but it navigates. */
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
 * A button that shows only a glyph.
 *
 * `label` is required, not optional: to a screen reader a button without text
 * is a button without meaning, and this is the only place in the system where
 * an icon may replace a label.
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
