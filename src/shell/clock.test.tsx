// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClock, useClockReading } from './clock';

describe('useClock', () => {
  afterEach(() => vi.useRealTimers());

  it('ne rebat pas à chaque rendu de son seul lecteur', () => {
    vi.useFakeTimers();
    let renders = 0;
    const { rerender, unmount } = renderHook(() => {
      renders++;
      return useClock(45_000);
    });
    act(() => vi.advanceTimersByTime(0));
    const settled = renders;
    rerender();
    // Le temps passe entre deux battements, comme dans un navigateur.
    for (let lap = 0; lap < 5; lap++)
      act(() => {
        vi.setSystemTime(Date.now() + 30);
        vi.advanceTimersByTime(0);
      });
    expect(renders).toBe(settled + 1);
    unmount();
  });
});

/** #707 : le tas d'une exploitation change de palier quelques fois par jour, pas à chaque minute. */
describe('useClockReading', () => {
  afterEach(() => vi.useRealTimers());

  it('renders when what it reads changes, not at every beat', () => {
    vi.useFakeTimers();
    const start = Date.now();
    let renders = 0;
    const { result, unmount } = renderHook(() => {
      renders++;
      return useClockReading(60_000, (now) => Math.floor((now - start) / (5 * 60_000)));
    });
    act(() => vi.advanceTimersByTime(0));
    const settled = renders;
    for (let minute = 0; minute < 4; minute++) act(() => vi.advanceTimersByTime(60_000));
    expect(renders).toBe(settled);
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe(1);
    expect(renders).toBe(settled + 1);
    unmount();
  });
});
