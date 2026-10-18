import { describe, expect, it } from 'vitest';
import { BUILDINGS, DEPOSITS, NATIONS, RESOURCES } from '../src/domain/ids';
import { BUILDING_KEY, RESOURCE_KEY } from './validators';

/**
 * `ids.ts` is the vocabulary TypeScript checks; `validators.ts` is the one Convex checks at
 * runtime. They are two files saying the same thing, and a union that is written twice is a
 * union that drifts: a key added on one side only yields a row the schema accepts and no
 * mutation can write, or the reverse. This test is the seam.
 */
const literals = (union: { members: ReadonlyArray<{ value: unknown }> }): ReadonlyArray<unknown> =>
  union.members.map((member) => member.value);

describe('ids and validators', () => {
  it('declare exactly the same keys', () => {
    expect(literals(RESOURCE_KEY)).toEqual([...RESOURCES]);
    expect(literals(BUILDING_KEY)).toEqual([...BUILDINGS]);
  });

  /** The playable nations and the map deposits have no validator — nothing writes them into a
   *  document — but a table that loses an entry loses a nation, so they are counted here. */
  it('keeps the nations and the deposits whole', () => {
    expect(NATIONS).toHaveLength(8);
    expect(DEPOSITS).toHaveLength(4);
  });
});
