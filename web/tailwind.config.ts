import type { Config } from "tailwindcss";

// Elke kleur wijst naar een CSS-variabele uit globals.css, waar het lichte en
// het donkere thema wonen — Tailwind-klassen blijven themablind. De namen zijn
// die van de app zelf (surface, ink-muted, pos/neg/warn/info, c1..c6); de
// aliaslaag in globals.css koppelt ze aan de Meridian-tokens.
//
// text/gain/loss/approx staan in de rgb(var(--x-rgb)/<alpha-value>)-vorm omdat
// pagina's ze met een opaciteitsmodifier gebruiken (text-text/50, bg-gain/10);
// een kale var() kan geen /50 aannemen.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "var(--brand)",
        bg: "var(--bg)",
        "bg-secondary": "var(--surface-2)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        "surface-sunk": "var(--surface-sunk)",
        "surface-ink": "var(--surface-ink)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "rgb(var(--ink-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        "ink-muted": "var(--ink-muted)",
        "on-ink": "var(--text-on-ink)",
        "on-ink-muted": "var(--text-on-ink-muted)",
        brand: "var(--brand)",
        "brand-2": "var(--brand-2)",
        "brand-tint": "var(--brand-tint)",
        pos: "rgb(var(--pos-rgb) / <alpha-value>)",
        "pos-tint": "var(--pos-tint)",
        neg: "rgb(var(--neg-rgb) / <alpha-value>)",
        "neg-tint": "var(--neg-tint)",
        warn: "var(--warn)",
        "warn-tint": "var(--warn-tint)",
        info: "var(--info)",
        "info-tint": "var(--info-tint)",
        // Gain/loss zijn hetzelfde semantische paar als pos/neg en volgen dus
        // hetzelfde token — olijf en bordeaux.
        gain: "rgb(var(--pos-rgb) / <alpha-value>)",
        loss: "rgb(var(--neg-rgb) / <alpha-value>)",
        // Kwaliteitsgraden op de Spreiding-tab.
        proxy: "var(--chart-5)",
        approx: "rgb(var(--approx-rgb) / <alpha-value>)",
      },
      // Meridian stopt bij 10px, behalve pillen. `rounded` (8) is de kaart,
      // `rounded-md` (6) de knop en het invoerveld, `rounded-xl` (10) de dialoog.
      borderRadius: {
        DEFAULT: "var(--radius-lg)",
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-md)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-xl)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      boxShadow: {
        card: "var(--shadow-2)",
        float: "var(--shadow-3)",
        dialog: "var(--shadow-4)",
      },
      maxWidth: {
        content: "var(--content-max)",
        measure: "var(--measure)",
      },
      spacing: {
        sidebar: "var(--sidebar-w)",
        page: "var(--gutter-page)",
      },
    },
  },
  plugins: [],
};

export default config;
