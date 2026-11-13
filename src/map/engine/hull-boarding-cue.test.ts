import { describe, expect, it, vi } from 'vitest';
import type { MapMotion } from '@/domain/map-motion';

describe('a hull boarding cue (#504, #479)', () => {
  const cue = (ground: 'quay' | 'beach' = 'quay') => ({
    kind: 'embarquement' as const,
    hull: 'p/0',
    carrierId: 'h',
    ground,
    riders: [
      { troopId: 'a', role: 'infantry' as const, figures: [1 as const] },
      { troopId: 'b', role: 'armor' as const, figures: [1 as const] },
    ],
  });
  const play = async (motion: MapMotion, ground: 'quay' | 'beach' = 'quay', queued = true) => {
    const { MapEngine } = await import('./index');
    const inkArrival = vi.fn();
    const expectPile = vi.fn();
    const onBoarded = vi.fn();
    const queue = vi.fn(() => queued);
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      invalidate: () => {},
      standing: { inkArrival, expect: expectPile },
      sequences: { motion },
      hullBoardings: { cue: queue },
      onBoarded,
    }) as unknown as InstanceType<typeof MapEngine>;
    engine.cue(cue(ground));
    return { inkArrival, expectPile, onBoarded, queue };
  };

  it('keeps the old count at a quay, at full motion: the sequence feeds the tag as the men pass', async () => {
    const { onBoarded, queue, expectPile } = await play('full');
    expect(queue).toHaveBeenCalledTimes(1);
    expect(onBoarded).not.toHaveBeenCalled();
    expect(expectPile).toHaveBeenCalledWith('p');
  });

  it('poses the second boarding of a hull at once, where the first is still on its way', async () => {
    const { onBoarded, inkArrival, expectPile } = await play('full', 'quay', false);
    expect(onBoarded).toHaveBeenCalledWith('h', ['a', 'b']);
    expect(inkArrival).not.toHaveBeenCalled();
    expect(expectPile).not.toHaveBeenCalled();
  });

  it('feeds every rider to the tag at once off a quay, and at reduced and cut motion', async () => {
    for (const [motion, ground] of [
      ['full', 'beach'],
      ['reduced', 'quay'],
      ['off', 'quay'],
    ] as const) {
      const { onBoarded, queue } = await play(motion, ground);
      expect(queue, `${motion} ${ground}`).not.toHaveBeenCalled();
      expect(onBoarded, `${motion} ${ground}`).toHaveBeenCalledWith('h', ['a', 'b']);
    }
  });

  it('lays a ring of ink under the pile at reduced motion only', async () => {
    expect((await play('reduced')).inkArrival).toHaveBeenCalledWith('p');
    expect((await play('full')).inkArrival).not.toHaveBeenCalled();
    expect((await play('full', 'beach')).inkArrival).not.toHaveBeenCalled();
  });
});
