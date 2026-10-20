// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClock } from './clock';

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
