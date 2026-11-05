import { describe, expect, it } from 'vitest';
import { homing } from './site-ways';
import type { Sequence } from './sequences';

const away: Sequence = { ms: 1000, at: () => ({ root: { travel: [40, 30, -20], heading: 1 } }) };

describe('a take-off whose thread leaves from its pile (#269)', () => {
  it('plays as it is, then flies home to the pawn it ends on', () => {
    const home = homing(away);
    expect(home.at(0).root?.travel).toEqual([40, 30, -20]);
    expect(home.ms).toBe(1000);
    for (const v of home.at(1000).root?.travel ?? [1]) expect(v).toBeCloseTo(0);
  });
});
