// De verticale as van een lijngrafiek: ronde waarden om op te labelen, en het
// aantal decimalen dat daarbij hoort.
//
// Stond in ValueChart.tsx, waar het is geschreven; de koersgrafiek op een
// positiepagina heeft dezelfde as nodig en een tweede kopie van `niceTicks` is
// precies de soort verdubbeling die na één aanpassing twee grafieken met een
// verschillende schaal oplevert.

/** Ronde tussenwaarden binnen [lo, hi], altijd 1/2/2,5/5 × 10ⁿ.
 *
 *  De stap wordt niet uit (hi − lo)/n afgeleid maar gekozen: de fijnste stap die
 *  nog hoogstens `max` labels oplevert. Een afgeleide stap kan er net naast
 *  zitten en dan blijven er twee labels over voor de hele hoogte. */
export function niceTicks(lo: number, hi: number, max = 5): number[] {
  if (!Number.isFinite(hi - lo) || hi <= lo) return [];
  const top = Math.floor(Math.log10(hi - lo));
  const steps: number[] = [];
  for (let e = top - 3; e <= top + 1; e++) {
    for (const m of [1, 2, 2.5, 5]) steps.push(m * 10 ** e);
  }
  steps.sort((a, b) => a - b);
  const count = (s: number) => Math.floor(hi / s) - Math.ceil(lo / s) + 1;
  const step = steps.find((s) => count(s) <= max) ?? steps[steps.length - 1];

  const ticks: number[] = [];
  // De epsilon vangt de drijvende-kommaresten op waardoor een tick die precies
  // op `hi` valt er anders net buiten zou vallen.
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) {
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  }
  return ticks;
}

export function tickDecimals(ticks: number[]): number {
  if (ticks.length < 2) return 0;
  const step = Math.abs(ticks[1] - ticks[0]);
  if (step >= 1) return 0;
  return step >= 0.1 ? 1 : 2;
}
