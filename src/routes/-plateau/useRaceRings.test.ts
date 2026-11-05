// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RaceCountdown, StrategicPointView } from '@/domain/player-view';
import { useRaceRings } from './useRaceRings';

const point = (id: string, nation: string | null): StrategicPointView =>
  ({ id, holder: nation === null ? null : { nation, heldMs: 0 } }) as StrategicPointView;
const four = ['a', 'b', 'c', 'd'].map((id) => point(id, 'germany'));
const race = { leaderNation: 'germany', endsAt: 1000 };

/** **Le compte tombé s'efface** (#442) : en 0,9 s, en cours de partie seulement. */
describe('useRaceRings', () => {
  afterEach(() => vi.useRealTimers());
  const hook = (initial: {
    race: RaceCountdown | null;
    points: StrategicPointView[];
    concluded: boolean;
  }) =>
    renderHook((props) => useRaceRings(props.race, props.points, props.concluded), {
      initialProps: initial,
    });

  it('keeps the rings that are left fading for 0.9 s once the count falls during play', () => {
    vi.useFakeTimers();
    const { result, rerender } = hook({ race, points: four, concluded: false });
    expect(result.current?.pointIds).toEqual(['a', 'b', 'c', 'd']);
    const after = [point('a', 'france'), ...four.slice(1)];
    rerender({ race: null, points: after, concluded: false });
    expect(result.current).toMatchObject({ pointIds: ['b', 'c', 'd'], fading: true });
    // Another answer of the server meanwhile does not hold them up.
    rerender({ race: null, points: [...after], concluded: false });
    act(() => vi.advanceTimersByTime(900));
    expect(result.current).toBeNull();
  });

  it('lets them go at once when the season concludes', () => {
    const { result, rerender } = hook({ race, points: four, concluded: false });
    rerender({ race: null, points: four, concluded: true });
    expect(result.current).toBeNull();
  });
});
