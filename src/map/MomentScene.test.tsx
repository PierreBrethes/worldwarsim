// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapMotion } from '@/domain/map-motion';
import type { Moment } from '@/domain/moments';
import { CURTAIN_MS } from './AbsenceTour';
import type { CameraPose, MapEngine } from './engine';
import { useMomentScene } from './MomentScene';

/**
 * **Un grand moment, joué** (#442) : la chute de mon QG vole vers lui et le tamponne en noir ;
 * la victoire aux points recule, cachète, trace, presse le grand tampon, puis le sépia ; la
 * feuille s'ouvre à la fin, une fois — tout de suite quand une feuille couvre la carte, ou au
 * premier geste.
 */
const START: CameraPose = { target: [0, 0, 0], distance: 60, orientation: [0, 1, 0] };
const fall = { kind: 'fall', at: [2, 49], hour: '21:04:00' } as const;
const victory = {
  kind: 'victory',
  ink: '#444',
  hour: '21:04:00',
  word: 'Victoire',
  line: 'quatre des Sept, vingt-quatre heures',
  held: [
    { at: [1, 1], name: 'Narvik' },
    { at: [2, 2], name: 'Suez' },
  ],
  seven: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  fall: null,
} as const;

function fakeEngine() {
  return {
    cameraPose: vi.fn((places: ReadonlyArray<unknown> = []) =>
      places.length === 0 ? START : { ...START, target: [places.length, 0, 0] as const },
    ),
    poseCamera: vi.fn(),
    pullBack: vi.fn(),
    traceThrough: vi.fn(),
    inkBurst: vi.fn(),
    liftStamps: vi.fn(),
    settlesIn: vi.fn(() => 0),
  };
}

function play(
  engine: ReturnType<typeof fakeEngine>,
  moment: Moment,
  { covered = false, motion = 'full' as MapMotion } = {},
) {
  const onDone = vi.fn();
  const hook = renderHook(() =>
    useMomentScene(engine as unknown as MapEngine, moment, { covered, motion, lift: 0, onDone }),
  );
  act(() => void vi.advanceTimersByTime(CURTAIN_MS));
  return { ...hook, onDone };
}

describe('useMomentScene', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('flies to my fallen headquarters, stamps it in black, then opens the sheet', () => {
    const engine = fakeEngine();
    const { onDone } = play(engine, fall);
    expect(engine.poseCamera).toHaveBeenCalledWith({ ...START, target: [1, 0, 0] }, 1000, 0);
    act(() => void vi.advanceTimersByTime(1000));
    expect(engine.inkBurst).toHaveBeenCalledWith(
      expect.objectContaining({ at: [2, 49], words: { word: 'QG tombé', hour: '21:04:00' } }),
    );
    expect(onDone).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(3200));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('pulls back over the Seven, seals the winner’s, traces them, then the big stamp and the sepia', () => {
    const engine = fakeEngine();
    const { result, onDone } = play(engine, victory);
    expect(result.current.sepiaHeld).toBe(true);
    expect(engine.pullBack).toHaveBeenCalledWith(victory.seven, 2000, 0);
    act(() => void vi.advanceTimersByTime(2450));
    expect(engine.inkBurst.mock.calls.map(([burst]) => burst.words.word)).toEqual([
      'Narvik',
      'Suez',
    ]);
    // Four side by side: smaller than a seal alone (the mockup's 50 against 84).
    expect(engine.inkBurst).toHaveBeenCalledWith(expect.objectContaining({ scale: 0.6 }));
    act(() => void vi.advanceTimersByTime(1450));
    expect(engine.traceThrough).toHaveBeenCalledWith(
      [
        [1, 1],
        [2, 2],
      ],
      '#444',
      1200,
      expect.any(Number),
    );
    act(() => void vi.advanceTimersByTime(1400));
    expect(result.current.big?.word).toBe('Victoire');
    act(() => void vi.advanceTimersByTime(600));
    expect(result.current.sepiaHeld).toBe(false);
    act(() => void vi.advanceTimersByTime(1600));
    expect(onDone).toHaveBeenCalledOnce();
    expect(result.current.big).toBeNull();
  });

  it('flies to my headquarters, the last, stamps it, then closes the season', () => {
    const engine = fakeEngine();
    const last = { ...victory, word: 'Saison close', held: null, seven: null, fall };
    const { result } = play(engine, last);
    expect(engine.poseCamera).toHaveBeenCalledWith({ ...START, target: [1, 0, 0] }, 1000, 0);
    act(() => void vi.advanceTimersByTime(1000));
    expect(engine.inkBurst).toHaveBeenCalledWith(
      expect.objectContaining({ at: [2, 49], words: { word: 'QG tombé', hour: '21:04:00' } }),
    );
    expect(result.current.big).toBeNull();
    act(() => void vi.advanceTimersByTime(3200));
    expect(result.current.big?.word).toBe('Saison close');
  });

  it('cut motion lays the end at once over the Seven, the sepia released', () => {
    const engine = fakeEngine();
    const { result, onDone } = play(engine, victory, { motion: 'off' });
    expect(onDone).toHaveBeenCalledOnce();
    expect(engine.pullBack).toHaveBeenCalledWith(victory.seven, 0, 0);
    expect(result.current.sepiaHeld).toBe(false);
  });

  it('opens the sheet at once under a sheet over the map', () => {
    const engine = fakeEngine();
    const { onDone } = play(engine, fall, { covered: true });
    expect(onDone).toHaveBeenCalledOnce();
    expect(engine.poseCamera).not.toHaveBeenCalled();
  });

  it('skips to the end at a hand on the board, lifting its stamps, once', () => {
    const engine = fakeEngine();
    const { result, onDone } = play(engine, victory);
    act(() => void expect(result.current.skip()).toBe(true));
    expect(engine.liftStamps).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
    expect(result.current.sepiaHeld).toBe(false);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(onDone).toHaveBeenCalledOnce();
    expect(result.current.skip()).toBe(false);
  });
});
