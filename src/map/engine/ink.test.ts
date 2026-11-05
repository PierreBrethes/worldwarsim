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

/** **Le cachet des Sept** (#442) : après le drapeau en actives, avec deux ondes d'encre ; à plat
 *  et tout de suite en réduites ; rien en coupées. */
describe('InkLayer, the seal of the Seven', () => {
  beforeAll(() => {
    const ctx = new Proxy({}, { get: () => () => ({ width: 0 }) });
    Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => ctx }) } });
  });
  const seal = {
    kind: 'seal',
    at: [17.43, 68.44],
    words: { word: 'Narvik', hour: '03:05' },
    ink: '#2b6974',
    held: 3,
    delayMs: 1600,
  } as const;
  const opacities = (ink: InkLayer) =>
    ink.group.children.map(
      (child) => (child as unknown as { material: { opacity: number } }).material.opacity,
    );

  it('lands after its flag with two ripples of ink, when motion is full', () => {
    const ink = new InkLayer(new WorldFrame(PROJECTION), true);
    ink.burst(seal, 0);
    ink.animate(1000, 1);
    expect(opacities(ink).filter((opacity) => opacity > 0)).toHaveLength(0);
    ink.animate(1900, 1);
    // The seal, and its two ripples (the second 0.22 s behind).
    expect(opacities(ink).filter((opacity) => opacity > 0)).toHaveLength(3);
  });

  it('lies flat at once without a ripple, when motion is reduced', () => {
    const ink = new InkLayer(new WorldFrame(PROJECTION), true);
    ink.motion = 'reduced';
    ink.burst(seal, 0);
    ink.animate(50, 1);
    expect(opacities(ink)).toEqual([expect.any(Number)]);
    expect(opacities(ink)[0]).toBeGreaterThan(0);
  });

  it('is not pressed when motion is cut', () => {
    const ink = new InkLayer(new WorldFrame(PROJECTION), true);
    ink.motion = 'off';
    ink.burst(seal, 0);
    expect(ink.group.children).toHaveLength(0);
  });

  /** La victoire en pose quatre côte à côte : à 50 contre 84 dans la maquette, ils ne se
   *  recouvrent plus (revue de #442). */
  it('shrinks to its scale, the victory’s', () => {
    const ink = new InkLayer(new WorldFrame(PROJECTION), true);
    ink.motion = 'reduced';
    ink.burst(seal, 0);
    ink.burst({ ...seal, scale: 0.6 }, 0);
    ink.animate(50, 1);
    const [full, small] = ink.group.children.map((child) => child.scale.x);
    expect(small! / full!).toBeCloseTo(0.6);
  });
});
