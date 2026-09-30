/**
 * De kop van een grafiekkaart: één groot getal, één gekleurde regel, één stille.
 *
 * Een component en geen drie takken ter plekke, omdat de *vorm* in alle drie de
 * toestanden gelijk moet zijn — in rust, met één vinger op de lijn, en met twee.
 * Dat was hij niet: in rust vielen "rendement …" en "inleg …" op twee regels,
 * terwijl één vinger één kortere regel opleverde — de grafiek sprong dus omhoog
 * zodra je hem aanraakte en weer omlaag zodra je de tweede vinger neerzette.
 * Onder sm zijn de drie stukken nu drie regels per constructie, niet per toeval
 * van wat er past; vanaf sm is het één regel op de gedeelde basislijn.
 *
 * Stond in de dashboardpagina, waar het is geschreven; de koerskaart op een
 * positiepagina leest op precies dezelfde manier af en heeft dezelfde vaste
 * hoogte nodig.
 */

export default function ChartHeadline({
  big,
  primary,
  primaryTone = "text-ink-muted",
  secondary,
}: {
  big: React.ReactNode;
  primary: React.ReactNode;
  /** Tailwind-kleurklasse; per toestand anders, wat de hoogte niet raakt. */
  primaryTone?: string;
  secondary: React.ReactNode;
}) {
  return (
    // 21px in de displayletter: dit is een steunend getal, en die staan in dit
    // ontwerp op 21 of lager — het heldengetal van het scherm staat elders.
    <div className="mb-2 flex flex-col gap-y-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3 sm:gap-y-1">
      <span className="num font-display text-[21px] leading-tight tracking-[-0.02em]">{big}</span>
      <span className="flex flex-col gap-y-0.5 sm:contents">
        <span className={`num text-[13.5px] ${primaryTone}`}>{primary}</span>
        <span className="num text-xs text-ink-muted">{secondary}</span>
      </span>
    </div>
  );
}
