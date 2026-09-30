// Typografische correcties op een string die al opgemaakt is.
//
// Waarom apart en niet in lib/format.ts: dat bestand is karakter-voor-karakter
// vastgepind op charts.fmt_eu in de backend (tests/test_format_parity.py draait
// het er echt doorheen). De minteken-regel is een leesregel voor het scherm, en
// mag daar dus niet in — een CSV of een API-antwoord houdt zijn gewone koppelteken.

/**
 * Het echte minteken (−, U+2212) in plaats van het koppelteken dat Intl levert.
 *
 * Een koppelteken is smaller en hangt lager dan de cijfers ernaast, waardoor
 * "-1.234,56" in een kolom net iets uit het lood staat; U+2212 heeft dezelfde
 * breedte en hoogte als een cijfer en lijnt dus mee in een tabellarische kolom.
 * Meridian schrijft hem voor, en dit is de plek waar hij erin komt.
 *
 * Alleen een koppelteken dat vóór een cijfer of een valutateken staat: een
 * streepje in "sinds 2019-2024" of in een fondsnaam moet blijven wat het is.
 */
export function trueMinus(text: string): string {
  return text.replace(/-(?=[\d€$£])/g, "−");
}
