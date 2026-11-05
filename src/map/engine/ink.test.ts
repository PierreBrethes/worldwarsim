import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PROJECTION, WorldFrame } from './frame';
import { InkLayer, penEase } from './ink';

vi.mock('../table-sound', () => ({ playTableSound: vi.fn() }));
const { playTableSound } = await import('../table-sound');

describe('penEase', () => {
  it('starts slow, ends slow, and passes through the middle', () => {
    expect(penEase(0)).toBe(0);
    expect(penEase(1)).toBe(1);
    expect(penEase(0.5)).toBe(0.5);
    expect(penEase(0.2)).toBeLessThan(0.2);
    expect(penEase(0.8)).toBeGreaterThan(0.8);
  });
});

/** **Un geste lève les tampons** (#439) : en un quart de seconde, et un tampon différé ne se pose
 *  ni ne se fait entendre. */
describe('InkLayer.lift', () => {
  beforeAll(() => {
    const ctx = new Proxy({}, { get: () => () => ({ width: 0 }) });
    Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => ctx }) } });
  });
  afterEach(() => vi.useRealTimers());
  const words = { word: 'terrain tenu', hour: '03:00' };

  it('keeps a delayed stamp from landing, and from being heard', () => {
    vi.useFakeTimers();
    const ink = new InkLayer(new WorldFrame(PROJECTION), true);
    ink.burst({ kind: 'held', at: [2, 49], words, delayMs: 800 }, 0);
    ink.lift(undefined, 100);
    ink.animate(900, 1);
    expect(ink.group.children).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(playTableSound).not.toHaveBeenCalled();
  });

  it('takes a combat splash up with its stamp, in a quarter of a second', () => {
    const ink = new InkLayer(new WorldFrame(PROJECTION), true);
    ink.burst({ kind: 'combat', at: [2, 49], words }, 0);
    expect(ink.group.children).toHaveLength(2);
    ink.lift(undefined, 100);
    ink.animate(300, 1);
    expect(ink.group.children).toHaveLength(2);
    ink.animate(400, 1);
    expect(ink.group.children).toHaveLength(0);
    expect(ink.active).toBe(false);
  });

  it('lifts only the kind it is asked', () => {
    const ink = new InkLayer(new WorldFrame(PROJECTION), true);
    ink.burst({ kind: 'held', at: [2, 49], words }, 0);
    ink.burst({ kind: 'captured', at: [3, 49], words }, 0);
    ink.lift('held', 100);
    ink.animate(400, 1);
    expect(ink.group.children).toHaveLength(1);
  });
});
