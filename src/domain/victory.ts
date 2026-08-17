/**
 * **Test scaffolding — this module is meant to be replaced, never amended.**
 *
 * The game aims at three secret doctrines in a triangle (design sheet 05: Domination,
 * Hegemony, Influence, each with its own subtraction tool). None of it exists, and the first
 * skirmish between friends cannot wait for it. So: **one condition, public, the same for
 * everybody** — a simplified Domination, indexed on `n` as the sheet requires.
 *
 * The day the triangle lands, this file goes whole. Nothing here is a design decision, nothing
 * here should make the triangle harder to build, and **no name here prepares one**: there is no
 * doctrine key, no progress bar, no secret to reveal. A scaffold that quietly grows a doctrine
 * shape is a scaffold that gets kept.
 *
 * What is deliberately different from sheet 05, and it is the point: **the progress is public
 * and named**. Without a secret doctrine the secret protects nothing, and a test between friends
 * wants the ribbing.
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
