// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sweepCandidates } from '@/domain/deposit-sweep';
import type { LonLat } from '@/domain/geo';
import type { PlayerView } from '@/domain/player-view';
import type { MapEngine, SweepTag } from './engine';
import { SweepOverlay } from './SweepOverlay';

vi.mock('@/data/mapMotion', () => ({ useMapMotion: () => 'full' }));

const view = {
  me: { nation: 'france', construction: null, constructionQueue: [], buildings: [], outposts: [] },
  surveyedInstallations: [],
} as unknown as PlayerView;
const BRUSSELS: LonLat = [4.35, 50.85];

/** A map that only says where it looks and hands the overlay its tags. */
function fakeEngine() {
  const engine = {
    onSweep: undefined as ((tags: ReadonlyArray<SweepTag> | null) => void) | undefined,
    sweepOrigin: () => BRUSSELS,
    sweepDeposits: vi.fn(),
    regionAtLonLat: () => null,
    journeyTo: vi.fn(),
  };
  return engine;
}

/**
 * **Chaque cartouche tient 12 s depuis que le front atteint son bassin** (#249, maquette
 * `radar.js`) : un cartouche atteint tard ne part pas avec le premier.
 */
describe('SweepOverlay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps each name twelve seconds from the moment its basin is reached', () => {
    const engine = fakeEngine();
    const onEnd = vi.fn();
    const candidates = sweepCandidates(view, 'coal', []);
    render(
      <SweepOverlay
        engine={engine as unknown as MapEngine}
        sweep={{ nonce: 1, species: 'coal', candidates }}
        onEnd={onEnd}
      />,
    );
    const [first, second] = engine.sweepDeposits.mock.calls[0]![0].targets as {
      id: string;
    }[];
    const tag = (id: string): SweepTag => ({
      id,
      x: 100,
      y: 100,
      off: false,
      angle: 0,
      radius: 12,
    });
    act(() => engine.onSweep!([tag(first!.id)]));
    act(() => void vi.advanceTimersByTime(2000));
    act(() => engine.onSweep!([tag(first!.id), tag(second!.id)]));
    act(() => void vi.advanceTimersByTime(10_500));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(2000));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
