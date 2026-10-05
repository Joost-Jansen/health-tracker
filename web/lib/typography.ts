// Typographic corrections on a string that is already formatted (lib/i18n/format.ts). The minus-sign rule is a
// reading rule for the screen, so it is applied here and not in the formatter: a CSV or an API response keeps its
// plain hyphen.

/**
 * The real minus sign (−, U+2212) instead of the hyphen Intl delivers.
 *
 * A hyphen is narrower and sits lower than the digits next to it, so "-1.234,56"
 * in a column is slightly out of true; U+2212 has the same width and height as
 * a digit and so lines up in a tabular column.
 * Meridian prescribes it, and this is the place where it goes in.
 *
 * Only a hyphen before a digit or a currency sign: a dash in "2019-2024" or in
 * an activity name must stay what it is.
 */
export function trueMinus(text: string): string {
  return text.replace(/-(?=[\d€$£])/g, "−");
}
