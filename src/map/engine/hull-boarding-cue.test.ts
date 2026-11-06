import { describe, expect, it, vi } from 'vitest';
import type { MapMotion } from '@/domain/map-motion';

describe('a hull boarding cue (#504)', () => {
  const cue = {
    kind: 'embarquement' as const,
    hull: 'p/0',
    carrierId: 'h',
    ground: 'quay' as const,
    riders: [
      { troopId: 'a', figures: [1 as const] },
      { troopId: 'b', figures: [1 as const] },
    ],
  };
  const play = async (motion: MapMotion) => {
    const { MapEngine } = await import('./index');
    const inkArrival = vi.fn();
    const onBoarded = vi.fn();
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      invalidate: () => {},
      standing: { inkArrival },
      sequences: { motion },
      onBoarded,
    }) as unknown as InstanceType<typeof MapEngine>;
    engine.cue(cue);
    return { inkArrival, onBoarded };
  };

  it('feeds every rider to the tag at once, at every setting', async () => {
    for (const motion of ['full', 'reduced', 'off'] as const) {
      const { onBoarded } = await play(motion);
      expect(onBoarded, motion).toHaveBeenCalledWith('h', ['a', 'b']);
    }
  });

  it('lays a ring of ink under the pile at reduced motion only', async () => {
    expect((await play('reduced')).inkArrival).toHaveBeenCalledWith('p');
    expect((await play('full')).inkArrival).not.toHaveBeenCalledWith('p');
  });
});
