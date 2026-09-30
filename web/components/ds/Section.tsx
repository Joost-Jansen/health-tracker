// De gelijnde sectie — het handtekeningelement van dit ontwerp, en de reden dat
// de app straks bijna geen kaarten meer heeft.
//
// Een sectie is: een kapitaaltjes-label van 11px boven een streep over de volle
// breedte, met de inhoud eronder. Geen doos. Een inktstreep (--n-800) voor wat
// primair is, een haarlijn voor wat secundair is, en één keer per scherm een
// terracotta streep van 2px voor het blok dat je aandacht vraagt.
//
// Dit vervangt components/Card.tsx op de veertig plekken waar de kaart alleen
// maar een rand stond te tekenen. Een echte kaart (ds-card) blijft bestaan voor
// wat werkelijk zweeft: dialogen en menu's.

import InfoPopover from "@/components/InfoPopover";

type Props = {
  /** Het kapitaaltjes-label boven de streep. */
  label?: React.ReactNode;
  /**
   * Eén of twee zinnen over wat deze sectie laat zien, achter een "i" naast het
   * kopje. Het middelste van de drie hulpniveaus: de "?" in de bovenbalk gaat
   * over het hele scherm, deze "i" over deze lijst of grafiek, en de "i" naast
   * een los getal over dat getal.
   *
   * **Alleen uitleg.** Wat over jóuw cijfers gaat — "12 posities", "3 landen
   * vielen af" — is geen uitleg maar een uitkomst, en hoort dus in `meta` of in
   * de inhoud te staan waar je het ziet zonder te klikken.
   */
  info?: React.ReactNode;
  /**
   * Wat de "i" aan een schermlezer aankondigt, als het kopje geen platte tekst
   * is. Anders wordt hij uit `label` afgeleid.
   */
  infoLabel?: string;
  /**
   * Stille context rechts op dezelfde regel — "12 posities", "3 uur geleden".
   *
   * **Kort houden.** De kop breekt af als het er niet naast past, en dan staat
   * er iets tússen het kopje en zijn streep — precies wat de streep onbruikbaar
   * maakt als "hier begint een nieuw onderwerp". Een hele zin is geen meta maar
   * inleiding, en hoort dus in de inhoud.
   */
  meta?: React.ReactNode;
  /**
   * Een kleine bediening rechts op de kopregel — een schakelaar van twee of drie
   * knoppen, een downloadlink. Gaat vóór `meta`.
   *
   * Past de bediening er niet naast (de periodekiezer van zeven knoppen op een
   * telefoon), zet hem dan als eerste kind ín de sectie: onder de streep, vlak
   * boven het ding dat hij bedient. Dat is trouwens ook waar hij hoort — een
   * stille schakelaar staat naast wat hij filtert, niet in het chroom.
   */
  action?: React.ReactNode;
  /** quiet = haarlijn in plaats van inktstreep, voor een sectie in een zijkolom. */
  tone?: "ink" | "quiet" | "brand";
  className?: string;
  children: React.ReactNode;
};

export default function Section({
  label,
  info,
  infoLabel,
  meta,
  action,
  tone = "ink",
  className = "",
  children,
}: Props) {
  // Het kopje met zijn "i" als één blok, zodat de knop links bij de tekst blijft
  // staan en niet naar het midden van de kopregel drijft. items-center en niet
  // baseline: een knop zonder tekst heeft zijn basislijn onderaan, en dan hangt
  // de glyph een paar pixels onder de kapitaaltjes.
  const heading = (style?: React.CSSProperties) =>
    label && (
      <span className="ds-section__label inline-flex items-center gap-1" style={style}>
        {label}
        {info && (
          <InfoPopover
            label={infoLabel ?? (typeof label === "string" ? `Uitleg ${label}` : "Uitleg")}
          >
            {info}
          </InfoPopover>
        )}
      </span>
    );

  if (tone === "brand") {
    // Het advies-blok: één per scherm, en het enige terracotta moment erop.
    //
    // Dezelfde vorm als elke andere sectie — kopje boven, streep eronder — en
    // alleen de streep is anders: 2px terracotta in plaats van 1px inkt. Het
    // referentiescherm zet hem bóven het kopje, en dat werkt daar omdat hij in
    // een eigen zijkolom staat. In één kolom onder elkaar levert dat een streep
    // op die de ene keer boven en de andere keer onder een kopje hangt, en dan
    // weet je niet meer waar een onderwerp begint.
    return (
      <section className={`ds-section ${className}`}>
        <div
          className="ds-section__head"
          style={{ borderBottomWidth: 2, borderBottomColor: "var(--terracotta-500)" }}
        >
          {heading({ color: "var(--text-brand)" })}
          {meta && <span className="ds-section__meta">{meta}</span>}
        </div>
        {children}
      </section>
    );
  }

  return (
    <section className={`ds-section ${tone === "quiet" ? "ds-section--quiet" : ""} ${className}`}>
      {(label || meta || action) && (
        <div className="ds-section__head">
          {heading()}
          {action ?? (meta && <span className="ds-section__meta">{meta}</span>)}
        </div>
      )}
      {children}
    </section>
  );
}

/** Het kleine kapitaaltjes-labeltje boven een getal. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`ds-eyebrow ${className}`}>{children}</span>;
}

/**
 * Het heldengetal: precies één per scherm, op 68px in de displayletter.
 *
 * Alles wat het ondersteunt staat op 21px of lager. Geef een steunend getal
 * nooit een doosje om het belangrijk te laten lijken — schaal en ruimte doen
 * dat werk.
 */
export function Hero({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`ds-hero ${className}`}>{children}</span>;
}

/**
 * Een steunend getal: label erboven, waarde in de displayletter op 21px,
 * optioneel een regel context eronder.
 *
 * Drie tot vier ervan in een links-zware rij onder de inktstreep, met de rechterkant
 * van die streep bewust leeg — dat is de asymmetrie waar het ontwerp om vraagt.
 */
export function Figure({
  label,
  value,
  note,
  info,
  tone,
  className = "",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  /** Wat dit getal precies meet, achter een "i" naast het labeltje. Het kleinste
   *  van de drie hulpniveaus — één of twee zinnen, niet meer. */
  info?: React.ReactNode;
  tone?: "gain" | "loss";
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-[5px] ${className}`}>
      <span className="flex items-center gap-1">
        <Eyebrow>{label}</Eyebrow>
        {info && (
          <InfoPopover label={typeof label === "string" ? `Uitleg ${label}` : "Uitleg"}>
            {info}
          </InfoPopover>
        )}
      </span>
      <span
        className="num font-display text-[21px] leading-tight tracking-[-0.02em]"
        style={{ color: tone === "gain" ? "var(--text-gain)" : tone === "loss" ? "var(--text-loss)" : undefined }}
      >
        {value}
      </span>
      {note && <span className="text-xs text-ink-muted">{note}</span>}
    </div>
  );
}

/** Een kale haarlijn, voor waar ruimte alleen niet genoeg blijkt. */
export function Rule({ className = "" }: { className?: string }) {
  return <hr className={`ds-rule ${className}`} />;
}
