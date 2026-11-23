/**
 * **Une tournée qui reste au pays ne prend pas de slot** (ADR 0028 §4, amendé le 23/11) : son
 * point de chargement et chacun de ses arrêts sont sur son sol national, `country` de la région
 * (la géographie, comme `siteFor`), jamais la couleur. Un seul arrêt ailleurs, ou un pays qu'on ne
 * sait pas lire, et elle garde son slot. Le serveur (`columnsHeld`, `tours.start`) et la feuille de
 * route lisent cette fonction.
 */
export const tourHoldsSlot = (
  /** Le pays du point de chargement, puis celui de chaque arrêt : `null` quand on ne le sait pas. */
  countries: ReadonlyArray<string | null>,
  homeCountry: string | null,
): boolean => homeCountry === null || countries.some((country) => country !== homeCountry);
