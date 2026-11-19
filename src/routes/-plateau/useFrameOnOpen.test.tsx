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

  it('replays nothing once the subject is forgotten', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.ask('QG'));
    hook.rerender({ covered: 301 });
    settle();
    serve.mockClear();
    act(() => hook.result.current.forget());
    act(() => hook.result.current.replay(422));
    act(() => hook.result.current.replay());
    settle();
    expect(serve).not.toHaveBeenCalled();
  });

  it('replays its subject at once when the sheet is let go on a step, with that height', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.ask('QG'));
    hook.rerender({ covered: 301 });
    settle();
    act(() => hook.result.current.replay(422));
    expect(serve).toHaveBeenCalledTimes(2);
    expect(serve).toHaveBeenLastCalledWith('QG', 422);
    act(() => hook.result.current.replay(250));
    expect(serve).toHaveBeenLastCalledWith('QG', 250);
  });

  it('keeps its subject when the player moves the map, and replays it on the next release', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.ask('QG'));
    hook.rerender({ covered: 301 });
    settle();
    act(() => hook.result.current.cancel());
    act(() => hook.result.current.replay(422));
    expect(serve).toHaveBeenLastCalledWith('QG', 422);
  });

  it('replays nothing when no subject was asked, or once its surface has gone', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.replay(422));
    expect(serve).not.toHaveBeenCalled();
    act(() => hook.result.current.ask('pile'));
    hook.rerender({ covered: 301 });
    settle();
    hook.rerender({ covered: null });
    act(() => void vi.advanceTimersByTime(1000));
    act(() => hook.result.current.replay(422));
    expect(serve).toHaveBeenCalledTimes(1);
  });

  it('waits for the surface to settle when it is unfolded, without a height yet', () => {
    const { serve, hook } = setup(83);
    act(() => hook.result.current.ask('site'));
    settle();
    hook.rerender({ covered: 83 });
    act(() => hook.result.current.replay());
    expect(serve).toHaveBeenCalledTimes(1);
    hook.rerender({ covered: 164 });
    act(() => void vi.advanceTimersByTime(300));
    hook.rerender({ covered: 430 });
    settle();
    expect(serve).toHaveBeenCalledTimes(2);
    expect(serve).toHaveBeenLastCalledWith('site', 430);
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

  it('is cancelled by the player moving the map, while it waits', () => {
    const { serve, hook } = setup(null);
    act(() => hook.result.current.ask('QG'));
    hook.rerender({ covered: 301 });
    act(() => void vi.advanceTimersByTime(200));
    act(() => hook.result.current.cancel());
    settle();
    expect(serve).not.toHaveBeenCalled();
  });
});

describe('useFrameOnOpen with a surface that stays open while it covers nothing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps the subject of a folded board, then frames it when the board unfolds', () => {
    const serve = vi.fn();
    const hook = renderHook(({ covered, open }) => useFrameOnOpen(covered, serve, open), {
      initialProps: { covered: 430 as number | null, open: true },
    });
    act(() => hook.result.current.ask('site'));
    act(() => void vi.advanceTimersByTime(600));
    hook.rerender({ covered: null, open: true });
    act(() => void vi.advanceTimersByTime(1000));
    act(() => hook.result.current.replay());
    hook.rerender({ covered: 430, open: true });
    act(() => void vi.advanceTimersByTime(600));
    expect(serve).toHaveBeenCalledTimes(2);
    hook.rerender({ covered: null, open: false });
    act(() => void vi.advanceTimersByTime(1000));
    act(() => hook.result.current.replay(300));
    expect(serve).toHaveBeenCalledTimes(2);
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
