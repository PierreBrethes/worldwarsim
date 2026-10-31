import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InkBurst } from '@/domain/ink-bursts';
import { HELD_MAX_MS, HeldBursts } from './held-bursts';

const held = (combatId: string): InkBurst => ({
  kind: 'held',
  at: [2, 49],
  delayMs: 3600,
  combatId,
});

describe('HeldBursts, « terrain tenu » of a combat the map may play (#327)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says nothing while the map may still show the combat, whatever the view takes', () => {
    const stamped: InkBurst[] = [];
    const bursts = new HeldBursts((burst) => stamped.push(burst));
    bursts.hold(held('a'));
    vi.advanceTimersByTime(10_000);
    expect(stamped).toEqual([]);
  });

  it('never stamps a combat whose scene stood: the report stamp is its word', () => {
    const stamped: InkBurst[] = [];
    const bursts = new HeldBursts((burst) => stamped.push(burst));
    bursts.hold(held('a'));
    bursts.shown('a');
    bursts.abandon('a');
    vi.advanceTimersByTime(HELD_MAX_MS * 2);
    expect(stamped).toEqual([]);
  });

  it('stamps it when the combat is settled without a scene, once, without its combat id', () => {
    const stamped: InkBurst[] = [];
    const bursts = new HeldBursts((burst) => stamped.push(burst));
    bursts.hold(held('a'));
    vi.advanceTimersByTime(5000);
    bursts.abandon('a');
    bursts.abandon('a');
    expect(stamped).toEqual([{ kind: 'held', at: [2, 49], delayMs: 0 }]);
  });

  it('keeps the delay « engagé » still needs to lift', () => {
    const stamped: InkBurst[] = [];
    const bursts = new HeldBursts((burst) => stamped.push(burst));
    bursts.hold(held('a'));
    vi.advanceTimersByTime(1000);
    bursts.abandon('a');
    expect(stamped[0]!.delayMs).toBe(2600);
  });

  it('stamps it all the same when the map never answers for the combat', () => {
    const stamped: InkBurst[] = [];
    const bursts = new HeldBursts((burst) => stamped.push(burst));
    bursts.hold(held('a'));
    vi.advanceTimersByTime(HELD_MAX_MS + 1);
    expect(stamped).toHaveLength(1);
  });
});
