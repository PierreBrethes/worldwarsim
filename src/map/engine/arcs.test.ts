import { describe, expect, it } from 'vitest';
import type { ArcView } from '@/domain/player-view';
import { lastKnownMedium } from './arcs';

const arc = (state: ArcView['state'], mediums: ReadonlyArray<string>) =>
  ({ state, route: { legs: mediums.map((medium) => ({ medium })) } }) as unknown as ArcView;

describe('lastKnownMedium', () => {
  it('stands a washed block at the end of a last known stretch, in its last medium', () => {
    expect(lastKnownMedium(arc('lastKnown', ['land', 'sea']))).toBe('sea');
  });

  it('stands none for a column still watched, nor for mine', () => {
    for (const state of ['mine', 'enemyDetected', 'seaControl'] as const)
      expect(lastKnownMedium(arc(state, ['land']))).toBeNull();
  });
});
