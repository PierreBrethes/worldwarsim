/**
 * **La jauge de bord** (ADR 0028 §4, #319) : la quantité exacte qu'on charge sur un transport. La
 * main prend tout le bac ; la jauge d'un transport s'ouvre au plein, et la main y règle la charge.
 * Ce que la jauge montre et ce que le lâcher envoie sortent d'ici (`chosenLoadOf`).
 */

/** Ce qui borne le plein : ce que la source tient, ou la place libre à bord. */
export type LoadBound = 'stock' | 'room';

/** Au-dessus de la jauge, la main compte ce nombre de fois moins vite. */
const FINE_RATIO = 0.2;

const within = (value: number, max: number) => Math.max(0, Math.min(max, value));

/** **Le plein** : le plus petit de la source (en jetons entiers) et de la place ; à égalité, c'est
 *  la place, donc le transport est plein. */
export function fullLoadOf(stock: number, room: number): { max: number; bound: LoadBound } {
  const held = Math.max(0, Math.floor(stock));
  const free = Math.max(0, room);
  return held < free ? { max: held, bound: 'stock' } : { max: free, bound: 'room' };
}

/** **La charge choisie** : le plein tant que la main n'a rien réglé, sinon sa valeur arrondie. */
export function chosenLoadOf(max: number, picked: number | null): number {
  return picked === null ? max : within(Math.round(picked), max);
}

/** **La main dans la jauge** (`fraction` de la voie, de 0 à 1) : la charge placée sous elle, au-delà
 *  de ce qui est déjà à bord. Valeur brute, arrondie à la lecture. */
export function railLoadOf({
  fraction,
  held,
  capacity,
  max,
}: {
  fraction: number;
  held: number;
  capacity: number;
  max: number;
}): number {
  return within(fraction * capacity - held, max);
}

/** **Le pas fin**, au-dessus de la jauge : le mouvement `dx` de la main, cinq fois plus fin. */
export function fineLoadOf({
  value,
  dx,
  railWidth,
  capacity,
  max,
}: {
  value: number;
  dx: number;
  railWidth: number;
  capacity: number;
  max: number;
}): number {
  return within(value + (dx * capacity * FINE_RATIO) / railWidth, max);
}

/** **La molette** : un cran vers le haut ajoute 1, avec Maj 10. */
export function wheelLoadOf({
  value,
  deltaY,
  shift,
  max,
}: {
  value: number;
  deltaY: number;
  shift: boolean;
  max: number;
}): number {
  return within(Math.round(value) + (deltaY < 0 ? 1 : -1) * (shift ? 10 : 1), max);
}

/** **Le mot sous la charge** : « plein » seulement quand le transport l'est ; « tout » quand c'est la
 *  source qui borne et que la main la prend entière. */
export function loadWordOf({
  held,
  amount,
  capacity,
  max,
  bound,
}: {
  held: number;
  amount: number;
  capacity: number;
  max: number;
  bound: LoadBound;
}): 'full' | 'whole' | null {
  if (amount === 0) return null;
  if (held + amount === capacity) return 'full';
  return amount === max && bound === 'stock' ? 'whole' : null;
}

/**
 * **Où la jauge se déplie** (#319) : juste au-dessus de l'étiquette survolée, dans la carte libre —
 * sous la réglette du haut (`limits.top`) et au-dessus du plateau personnel (`limits.bottom`) ; sans
 * la place au-dessus, dessous.
 */
export function gaugeSpotOf({
  tag,
  height,
  gap,
  limits,
}: {
  tag: { top: number; bottom: number };
  height: number;
  gap: number;
  limits: { top: number; bottom: number };
}): { below: boolean; top: number } {
  const above = tag.top - gap - height;
  if (above >= limits.top) return { below: false, top: above };
  return {
    below: true,
    top: Math.min(tag.bottom + gap, Math.max(limits.top, limits.bottom - height)),
  };
}
