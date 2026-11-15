// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFrameOnOpen } from './useFrameOnOpen';

/** Au téléphone la caméra recadre l'objet touché une fois, vers la hauteur mesurée de la surface
 *  qui s'ouvre — jamais vers un cran supposé, ni après la première lecture. */
describe('useFrameOnOpen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (initial: number | null) => {
    const serve = vi.fn();
    const hook = renderHook(({ covered }) => useFrameOnOpen(covered, serve), {
      initialProps: { covered: initial },
    });
    return { serve, hook };
  };

  const settle = () => act(() => void vi.advanceTimersByTime(600));

  it('waits for the surface to be measured, then serves with that height', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current('QG'));
    settle();
    expect(serve).not.toHaveBeenCalled();
    hook.rerender({ covered: 301 });
    settle();
    expect(serve).toHaveBeenCalledExactlyOnceWith('QG', 301);
  });

  it('serves the height a surface unfolding settles on, not the one it began with', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current('caserne'));
    hook.rerender({ covered: 164 });
    act(() => void vi.advanceTimersByTime(300));
    hook.rerender({ covered: 429 });
    settle();
    expect(serve).toHaveBeenCalledExactlyOnceWith('caserne', 429);
  });

  it('does not frame again when the surface is measured again or dragged', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current('QG'));
    hook.rerender({ covered: 301 });
    settle();
    hook.rerender({ covered: 422 });
    settle();
    hook.rerender({ covered: null });
    hook.rerender({ covered: 83 });
    settle();
    expect(serve).toHaveBeenCalledTimes(1);
  });

  it('serves at once when the surface that takes the new subject is already measured', () => {
    const { serve, hook } = setup(422);
    act(() => hook.result.current('pile'));
    settle();
    expect(serve).toHaveBeenCalledExactlyOnceWith('pile', 422);
  });

  it('lets go of a request no surface answered, so a later sheet does not reframe the map', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current('QG'));
    act(() => void vi.advanceTimersByTime(5000));
    hook.rerender({ covered: 301 });
    settle();
    expect(serve).not.toHaveBeenCalled();
  });
});
