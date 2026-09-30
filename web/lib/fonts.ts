// De drie letterfamilies van het Meridian-ontwerp.
//
// Meridian schrijft Söhne (interface), Founders Grotesk Text (grote getallen)
// en Söhne Mono voor. Dat zijn Klim-lettertypes waarvan het handoff-pakket
// alleen *proefversies* meelevert; die mogen niet mee naar een publieke site.
// Dit zijn de gratis vervangers, met dezelfde rolverdeling:
//
//   Inter          → Söhne          neutrale, geëngineerde interface-grotesk
//   Hanken Grotesk → Founders Text  warmer en iets eigenzinniger op groot
//                                   formaat, met een echte Light (300) — dat is
//                                   precies wat het heldengetal nodig heeft
//   IBM Plex Mono  → Söhne Mono     tickers, ISIN's, tijdstippen
//
// Wil je later alsnog de echte Klim-snedes: vervang de bestanden in `fonts/`
// en de paden hieronder. Verder verandert er niets — de rest van de app leest
// alleen --font-sans / --font-display / --font-mono.
//
// Alleen de latin-subset. Die dekt het hele Nederlandse alfabet inclusief de
// accenten (é ë ï ö ü staan in Latin-1); voor een enkel Oost-Europees teken in
// een fondsnaam valt de browser terug op de systeemletter. Dat kost 103 kB in
// plaats van 226 kB, op elke pagina.
//
// next/font/local en niet next/font/google: de bestanden staan in de repo, dus
// de Docker-build heeft geen netwerk nodig en de gebruiker geen verbinding met
// Google. Next bundelt ze in .next/static/media, en dát pad kopieert de
// Dockerfile al — een public/-map zou hij overslaan.

import localFont from "next/font/local";

export const interSans = localFont({
  src: [{ path: "../fonts/Inter-300-600-latin.woff2", weight: "300 600", style: "normal" }],
  variable: "--font-sans-loaded",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const hankenDisplay = localFont({
  src: [{ path: "../fonts/HankenGrotesk-300-600-latin.woff2", weight: "300 600", style: "normal" }],
  variable: "--font-display-loaded",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
});

export const plexMono = localFont({
  src: [
    { path: "../fonts/IBMPlexMono-400-latin.woff2", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexMono-500-latin.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-mono-loaded",
  display: "swap",
  fallback: ["ui-monospace", "SF Mono", "Menlo", "monospace"],
});

/** De drie klassen die Next op <html> wil zien staan. */
export const fontVariables = `${interSans.variable} ${hankenDisplay.variable} ${plexMono.variable}`;
