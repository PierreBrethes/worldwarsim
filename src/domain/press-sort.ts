/** Les trois colonnes chiffrées, et rien d'autre ne se trie : le rang, le drapeau et le pseudo
 *  ne sont pas des mesures. */
export type PressSortKey = 'territory' | 'general' | 'deeds';

export const PRESS_SORT_KEYS: ReadonlyArray<PressSortKey> = ['territory', 'general', 'deeds'];

type Ranked = Readonly<Record<PressSortKey | 'rank', number>>;

/**
 * **Le tri du territoire est l'ordre servi**, et le but de la saison : le rang. Les deux autres
 * colonnes vont du plus grand au plus petit. Stable sur le rang, sinon deux parts égales
 * échangeraient de place au moindre repeint.
 */
export const sortPressRows = <Row extends Ranked>(
  rows: ReadonlyArray<Row>,
  sort: PressSortKey,
): ReadonlyArray<Row> =>
  [...rows].sort((left, right) =>
    sort === 'territory'
      ? left.rank - right.rank
      : right[sort] - left[sort] || left.rank - right.rank,
  );
