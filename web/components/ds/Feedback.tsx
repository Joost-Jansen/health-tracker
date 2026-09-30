"use client";

// Dialoog, lege staat en tag/badge — het kleine gereedschap.
//
// Bewust afwezig in dit systeem, en dus ook hier: de toast. Een rustig product
// laat niets bij je opduiken; een verandering is zichtbaar op de plek waar hij
// gebeurde. Waar de app nu een groene bevestigingsregel toont, blijft dat een
// regel op zijn eigen plek.

import { useCallback, useEffect, useRef } from "react";

/**
 * Een dialoog. Sluit op Escape en op een klik op het scrim, houdt de focus
 * binnen zolang hij open is, en geeft hem terug aan het element dat hem opende.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  actions,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  labelledBy?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      // Focus houden binnen het paneel: zonder dit tabt de gebruiker de dialoog
      // uit naar de pagina eronder, die hij niet kan zien en niet mag bedienen.
      const focusables = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener.current?.focus?.();
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="ds-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="ds-dialog outline-none"
      >
        <div className="ds-dialog__body">
          {title && <h2 className="ds-dialog__title">{title}</h2>}
          {description && <p className="ds-dialog__desc">{description}</p>}
          {children}
        </div>
        {actions && <div className="ds-dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}

/** Wat er staat als er niets is. Rustig geformuleerd, met één uitweg. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className = "",
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`ds-empty ${className}`}>
      {icon && <span className="ds-empty__icon">{icon}</span>}
      <span className="ds-empty__title">{title}</span>
      {body && <p className="ds-empty__body">{body}</p>}
      {action}
    </div>
  );
}

/** Een klein etiket. `mono` voor een ISIN of een ticker. */
export function Tag({
  tone = "neutral",
  mono = false,
  outline = false,
  className = "",
  children,
}: {
  tone?: "neutral" | "gain" | "loss" | "brand";
  mono?: boolean;
  outline?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={[
        "ds-tag",
        tone !== "neutral" ? `ds-tag--${tone}` : "",
        mono ? "ds-tag--mono" : "",
        outline ? "ds-tag--outline" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

/** Een telletje. Nooit rood, nooit voor "ongelezen" — dat is aandacht vragen. */
export function Badge({
  quiet = false,
  className = "",
  children,
}: {
  quiet?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={`ds-badge ${quiet ? "ds-badge--quiet" : ""} ${className}`}>{children}</span>;
}
