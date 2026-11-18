// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tallest, useFrameOnOpen } from './useFrameOnOpen';

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
    act(() => hook.result.current.ask('QG'));
    settle();
    expect(serve).not.toHaveBeenCalled();
    hook.rerender({ covered: 301 });
    settle();
    expect(serve).toHaveBeenCalledExactlyOnceWith('QG', 301);
  });

  it('serves the height a surface unfolding settles on, not the one it began with', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.ask('caserne'));
    hook.rerender({ covered: 164 });
    act(() => void vi.advanceTimersByTime(300));
    hook.rerender({ covered: 429 });
    settle();
    expect(serve).toHaveBeenCalledExactlyOnceWith('caserne', 429);
  });

  it('does not frame again when the surface is measured again or dragged', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.ask('QG'));
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
    act(() => hook.result.current.ask('pile'));
    settle();
    expect(serve).toHaveBeenCalledExactlyOnceWith('pile', 422);
  });

  it('lets go of a request no surface answered, so a later sheet does not reframe the map', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.ask('QG'));
    act(() => void vi.advanceTimersByTime(5000));
    hook.rerender({ covered: 301 });
    settle();
    expect(serve).not.toHaveBeenCalled();
  });

  it('drops a request when its surface closes, so the next surface does not reframe on it', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.ask('pile'));
    hook.rerender({ covered: 422 });
    hook.rerender({ covered: null });
    act(() => void vi.advanceTimersByTime(1000));
    hook.rerender({ covered: 301 });
    settle();
    expect(serve).not.toHaveBeenCalled();
  });

  it('keeps a request when the surface it replaces hands over within a beat', () => {
    const { serve, hook } = setup(422);
    act(() => hook.result.current.ask('caserne'));
    hook.rerender({ covered: null });
    act(() => void vi.advanceTimersByTime(50));
    hook.rerender({ covered: 429 });
    settle();
    expect(serve).toHaveBeenCalledExactlyOnceWith('caserne', 429);
  });

  it('is cancelled by the player moving the map', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.ask('QG'));
    hook.rerender({ covered: 301 });
    act(() => void vi.advanceTimersByTime(200));
    act(() => hook.result.current.cancel());
    settle();
    expect(serve).not.toHaveBeenCalled();
  });
});

describe('tallest', () => {
  it('is the highest surface measured, none when none is', () => {
    expect(tallest(null, null)).toBeNull();
    expect(tallest(422, null)).toBe(422);
    expect(tallest(null, 430)).toBe(430);
    expect(tallest(422, 430)).toBe(430);
  });
});
