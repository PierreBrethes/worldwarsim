// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AbsenceTour } from '@/domain/absence-tour';
import type { MapMotion } from '@/domain/map-motion';
import { useAbsenceTour } from './AbsenceTour';
import type { CameraPose, MapEngine } from './engine';

/**
 * **Le rejeu d'absence, joué** (#439) : il attend que la carte se voie, rappelle le moteur à
 * chaque battement, revient au départ, et s'arrête au premier geste en levant ses tampons.
 */
const START: CameraPose = { target: [0, 0, 0], distance: 60, orientation: [0, 1, 0] };
const tour: AbsenceTour = {
  stops: [
    { at: [2, 49], hour: '01:00:00', text: 'a', stamps: [{ kind: 'dispatch', at: [2, 49] }] },
    { at: [5, 45], hour: '02:00:00', text: 'b', stamps: [{ kind: 'dispatch', at: [5, 45] }] },
  ],
  fresh: 3,
  leftOut: 1,
  since: null,
};

function fakeEngine() {
  return {
    cameraPose: vi.fn((places: ReadonlyArray<unknown> = []) =>
      places.length === 0 ? START : { ...START, target: [places.length, 0, 0] as const },
    ),
    poseCamera: vi.fn(),
    inkBurst: vi.fn(),
    liftStamps: vi.fn(),
    landAt: () => true,
  };
}

function play(
  engine: ReturnType<typeof fakeEngine>,
  {
    covered = false,
    motion = 'full' as MapMotion,
    scene = false,
    queue = vi.fn((_landAt: unknown, _motion: MapMotion) => tour as AbsenceTour | null),
  } = {},
) {
  const onSeen = vi.fn();
  const hook = renderHook(
    ({ covered, motion, scene }) =>
      useAbsenceTour(engine as unknown as MapEngine, queue, {
        covered,
        motion,
        lift: 0,
        scene,
        onSeen,
      }),
    { initialProps: { covered, motion, scene } },
  );
  return { ...hook, onSeen, queue };
}

describe('useAbsenceTour', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('waits for the sheet over the map to close', () => {
    const engine = fakeEngine();
    const { result, rerender } = play(engine, { covered: true });
    act(() => void vi.advanceTimersByTime(10_000));
    expect(engine.inkBurst).not.toHaveBeenCalled();
    expect(result.current.band).toBeNull();
    rerender({ covered: false, motion: 'full', scene: false });
    expect(result.current.band).toEqual({ kind: 'intro' });
  });

  it('waits for the tab to be seen', () => {
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const engine = fakeEngine();
    const { result } = play(engine);
    expect(result.current.band).toBeNull();
    hidden.mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.band).toEqual({ kind: 'intro' });
    hidden.mockRestore();
  });

  it('flies to each place, stamps it, then returns where the player was and marks it seen', () => {
    const engine = fakeEngine();
    const { result, onSeen } = play(engine);
    act(() => void vi.advanceTimersByTime(1400));
    expect(result.current.band).toEqual({ kind: 'stop', index: 0 });
    expect(engine.poseCamera).toHaveBeenLastCalledWith({ ...START, target: [1, 0, 0] }, 700, 0, 80);
    act(() => void vi.advanceTimersByTime(700));
    expect(engine.inkBurst).toHaveBeenCalledWith(tour.stops[0]!.stamps[0]);
    act(() => void vi.advanceTimersByTime(3000));
    expect(engine.poseCamera).toHaveBeenLastCalledWith(START, 1400);
    expect(result.current.band).toEqual({ kind: 'end' });
    expect(onSeen).toHaveBeenCalledOnce();
    act(() => void vi.advanceTimersByTime(1600));
    expect(result.current.band).toBeNull();
  });

  it('cuts to the overview when motion is reduced, and back at the end', () => {
    const engine = fakeEngine();
    play(engine, { motion: 'reduced' });
    act(() => void vi.advanceTimersByTime(0));
    expect(engine.poseCamera).toHaveBeenLastCalledWith({ ...START, target: [2, 0, 0] }, 0, 0);
    act(() => void vi.advanceTimersByTime(1400));
    expect(engine.poseCamera).toHaveBeenLastCalledWith({ ...START, target: [2, 0, 0] }, 0, 0);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(engine.poseCamera).toHaveBeenCalledWith(START, 0);
  });

  it('stops at a gesture: the stamps lift, nothing more plays, the tour is seen', () => {
    const engine = fakeEngine();
    const { result, onSeen } = play(engine);
    act(() => void vi.advanceTimersByTime(2200));
    let stopped = false;
    act(() => {
      stopped = result.current.stop();
    });
    expect(stopped).toBe(true);
    expect(engine.liftStamps).toHaveBeenCalledWith();
    expect(onSeen).toHaveBeenCalledOnce();
    expect(result.current.band).toEqual({ kind: 'stopped' });
    const posed = engine.poseCamera.mock.calls.length;
    act(() => void vi.advanceTimersByTime(10_000));
    expect(engine.poseCamera.mock.calls.length).toBe(posed);
    expect(engine.inkBurst).toHaveBeenCalledOnce();
    expect(result.current.band).toBeNull();
  });

  it('stops when a sheet covers the map, or the tab is hidden, and plays blind no more', () => {
    const engine = fakeEngine();
    const { result, rerender, onSeen } = play(engine);
    act(() => void vi.advanceTimersByTime(1500));
    rerender({ covered: true, motion: 'full', scene: false });
    expect(onSeen).toHaveBeenCalledOnce();
    act(() => void vi.advanceTimersByTime(10_000));
    expect(engine.inkBurst).not.toHaveBeenCalled();
    expect(result.current.band).toBeNull();

    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const other = fakeEngine();
    const second = play(other);
    hidden.mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(second.onSeen).toHaveBeenCalledOnce();
    act(() => void vi.advanceTimersByTime(10_000));
    expect(other.inkBurst).not.toHaveBeenCalled();
    hidden.mockRestore();
  });

  it('reads the motion setting when it starts, and plays nothing once motion is cut', () => {
    const engine = fakeEngine();
    const queue = vi.fn((_landAt: unknown, motion: MapMotion) => (motion === 'off' ? null : tour));
    const { rerender, onSeen } = play(engine, { covered: true, queue });
    rerender({ covered: false, motion: 'off', scene: false });
    expect(queue).toHaveBeenLastCalledWith(expect.any(Function), 'off');
    act(() => void vi.advanceTimersByTime(10_000));
    expect(engine.poseCamera).not.toHaveBeenCalled();
    expect(onSeen).not.toHaveBeenCalled();
  });

  it('gives way to a combat scene told at the opening, without marking anything seen', () => {
    const engine = fakeEngine();
    const { result, rerender, onSeen } = play(engine, { scene: true });
    expect(result.current.band).toBeNull();
    rerender({ covered: false, motion: 'full', scene: false });
    act(() => void vi.advanceTimersByTime(10_000));
    expect(engine.inkBurst).not.toHaveBeenCalled();
    expect(onSeen).not.toHaveBeenCalled();
  });

  it('leaves the end band alone at a gesture: the tour is over, and seen once', () => {
    const engine = fakeEngine();
    const { result, onSeen } = play(engine);
    act(() => void vi.advanceTimersByTime(5200));
    expect(result.current.band).toEqual({ kind: 'end' });
    let stopped = true;
    act(() => {
      stopped = result.current.stop();
    });
    expect(stopped).toBe(false);
    expect(result.current.band).toEqual({ kind: 'end' });
    expect(onSeen).toHaveBeenCalledOnce();
  });

  it('plays once: a stop is not a reason to start again', () => {
    const engine = fakeEngine();
    const { result, rerender } = play(engine);
    act(() => result.current.stop());
    rerender({ covered: true, motion: 'full', scene: false });
    rerender({ covered: false, motion: 'full', scene: false });
    act(() => void vi.advanceTimersByTime(10_000));
    expect(engine.inkBurst).not.toHaveBeenCalled();
  });
});

/** The engine tells React of a hand on the board, and a combat played live gives way. */
describe('what stops the tour', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const engine = readFileSync(join(here, 'engine/index.ts'), 'utf-8');
  const body = (from: string) => engine.slice(engine.indexOf(from)).slice(0, 400);

  it.each([
    "canvas.addEventListener('pointerdown'",
    "canvas.addEventListener('wheel'",
    'private onKeyDown = ',
    '  pressOnLabel(',
  ])('%s tells the hand on the board', (from) => {
    expect(body(from)).toMatch(/this\.onHandOnBoard\?\.\(\)/);
  });

  it('halts the camera at a key only when it stopped the tour', () => {
    expect(body('private onKeyDown = ')).toMatch(
      /if \(this\.onHandOnBoard\?\.\(\) === true\) this\.journey = null;/,
    );
  });

  it.each([
    ['a dispatch located from the journal', 'if (focus === null) return;'],
    ['a combat replayed', 'if (!readyEngine || replayView === null) return;'],
  ])('gives way to %s', (_, from) => {
    const map = readFileSync(join(here, 'WorldMap.tsx'), 'utf-8');
    const effect = map.slice(map.indexOf(from)).slice(0, 200);
    expect(effect).toContain('stopTourNow.current();');
  });

  it('stops for a combat the map plays', () => {
    const map = readFileSync(join(here, 'WorldMap.tsx'), 'utf-8');
    expect(map).toMatch(/stopTour\(\);\s+readyEngine\.cue\(\{ kind: 'combat'/);
  });
});
