/**
 * **La relève du QG tombé** (ADR 0048 §3-4, Mondiale seule) : douze heures après la chute, sur
 * toute région libre de son pays. La fiche qui l'offre et le serveur qui l'accepte lisent cette
 * fonction, et rien d'autre ; la pose ordinaire (`placementRefusal`) passe ensuite, hors portée
 * d'avant-poste.
 */
export const HQ_RAISE_DELAY_MS = 12 * 3_600_000;

/** Une région telle que la vue la sert : son pays, et si elle porte sa couleur (`linked`). */
export type RaiseRegion = { readonly country: string; readonly linked: boolean };

export type HqRaiseRefusal =
  | { readonly code: 'HQ_RAISE_TOO_EARLY'; readonly details: { readonly at: number } }
  | {
      readonly code: 'HQ_RAISE_HOME_HELD' | 'HQ_RAISE_OFF_HOME' | 'HQ_RAISE_REGION_HELD';
      readonly details: { readonly country: string };
    };

export function hqRaiseRefusalOf({
  now,
  hqFellAt,
  homeCountry,
  region,
  homeRegions,
}: {
  readonly now: number;
  readonly hqFellAt: number;
  readonly homeCountry: string;
  /** La région visée. */
  readonly region: RaiseRegion;
  /**
   * Les régions de son pays. **Libre** se lit sur la couleur retenue (`linked`) : sur son sol, la
   * couleur n'est jamais à personne, donc une région qui ne porte pas la sienne est tenue par un
   * autre (un bâtiment capturé, un point).
   */
  readonly homeRegions: ReadonlyArray<RaiseRegion>;
}): HqRaiseRefusal | null {
  const at = hqFellAt + HQ_RAISE_DELAY_MS;
  if (now < at) return { code: 'HQ_RAISE_TOO_EARLY', details: { at } };
  if (!homeRegions.some((home) => home.linked)) {
    return { code: 'HQ_RAISE_HOME_HELD', details: { country: homeCountry } };
  }
  if (region.country !== homeCountry)
    return { code: 'HQ_RAISE_OFF_HOME', details: { country: homeCountry } };
  if (!region.linked) return { code: 'HQ_RAISE_REGION_HELD', details: { country: homeCountry } };
  return null;
}
