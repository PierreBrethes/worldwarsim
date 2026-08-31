/**
 * **Test scaffolding — this module is meant to be replaced, never amended.**
 *
 * Domination is the only mode there is (ADR 0020 §9), and what it will really count is the
 * **share of the map**: the regions a player holds over the regions somebody holds. None of
 * that exists yet, and the first skirmish between friends cannot wait for it. So: capacity
 * against nominal, one bar, indexed on `n`.
 *
 * The day the share of the map lands, this file goes whole. Nothing here is a design decision,
 * nothing here should make that count harder to build, and **no name here prepares one**: no
 * territory, no colour, no held region. A scaffold that quietly grows the shape of its
 * successor is a scaffold that gets kept.
 *
 * The progress is **public and named**, and it stays that way: with a single condition there is
 * nothing left for a secret to protect, and a test between friends wants the ribbing.
 */

/** A troop as the rule weighs it: hit points against the nominal it was formed at (ADR 0014). */
export type Force = {
  readonly strength: number;
  readonly nominalStrength: number;
};

/**
 * **Reduced is not eliminated** (rule 3 of the project). A player under the bar keeps playing,
 * rebuilds, and climbs back out — at which point he leaves his executioner's count. That is why
 * this is a function of the troops standing *now* and never a stored number: a stored capacity
 * disagrees with the board at the first casualty, the first recruit and the first march home.
 *
 * A player with no troop standing at all is reduced: nothing over nothing is not a ratio, and
 * "he has no army left" is the one case the bar exists to catch.
 */
export function isReduced(force: ReadonlyArray<Force>, factor: number): boolean {
  const nominal = force.reduce((sum, troop) => sum + troop.nominalStrength, 0);
  if (nominal <= 0) return true;
  const current = force.reduce((sum, troop) => sum + troop.strength, 0);
  return current < nominal * factor;
}

/**
 * How many **distinct** players one has to reduce, `⌈(n−1)/2⌉` (design sheet 05). Indexed on `n`
 * for the reason the sheet gives: a target read off the *cumulated* enemy capacity is trivial at
 * two players and impossible at eight. At two, one is enough.
 */
export const playersToReduce = (players: number): number =>
  Math.max(1, Math.ceil((players - 1) / 2));
