// Invoervelden. Eén laag chroom om alles heen: label boven, hint eronder, en de
// bediening zelf zonder rand maar met een inset box-shadow — zo blijft de hoogte
// van een veld exact 36px, ongeacht of hij een rand tekent of niet.
//
// Focus is 1px inkt plus een salie ring op 20%. Dat is het enige moment
// waarop salie in een formulier verschijnt.

import { useId } from "react";

function Field({
  label,
  hint,
  error,
  htmlFor,
  className = "",
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`ds-field ${className}`}>
      {label && (
        <label className="ds-field__label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {(error || hint) && (
        <span className={`ds-field__hint ${error ? "ds-field__hint--error" : ""}`}>{error ?? hint}</span>
      )}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  icon,
  size = "md",
  className = "",
  id,
  ...rest
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Een glyph links ín het veld — een vergrootglas bij een zoekveld. */
  icon?: React.ReactNode;
  size?: "md" | "lg";
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "className">) {
  const auto = useId();
  const fieldId = id ?? auto;
  const input = (
    <input
      id={fieldId}
      aria-invalid={error ? true : undefined}
      className={`ds-input ${size === "lg" ? "ds-input--lg" : ""} ${className}`}
      {...rest}
    />
  );
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fieldId}>
      {icon ? (
        <span className="ds-input-wrap">
          <span className="ds-input-wrap__icon">{icon}</span>
          {input}
        </span>
      ) : (
        input
      )}
    </Field>
  );
}

export function Select({
  label,
  hint,
  error,
  className = "",
  id,
  children,
  ...rest
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={fieldId}>
      <select id={fieldId} className={`ds-select ${className}`} {...rest}>
        {children}
      </select>
    </Field>
  );
}

/**
 * Een vinkje. Het echte <input> blijft in de boom staan (verborgen maar
 * bereikbaar), zodat toetsenbord, formulierstatus en schermlezers werken zoals
 * ze horen; het vierkantje ernaast is puur de tekening.
 */
export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
  className = "",
  ...rest
}: {
  label?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked" | "className" | "type">) {
  return (
    <label
      className={`ds-check ${checked ? "ds-check--on" : ""} ${disabled ? "ds-check--disabled" : ""} ${className}`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
        {...rest}
      />
      <span className="ds-check__box" aria-hidden>
        <svg className="ds-check__tick" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.2 4.8 8.5 9.5 3.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}

/** Een schakelaar voor iets dat meteen ingaat. Staat hij aan, dan is hij olijf. */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
  className = "",
  ...rest
}: {
  label?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "checked" | "className" | "type">) {
  return (
    <label
      className={`ds-switch ${checked ? "ds-switch--on" : ""} ${disabled ? "ds-switch--disabled" : ""} ${className}`}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
        {...rest}
      />
      <span className="ds-switch__track" aria-hidden>
        <span className="ds-switch__thumb" />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
