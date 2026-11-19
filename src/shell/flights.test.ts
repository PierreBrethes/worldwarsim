// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindSpots, placed, spent } from './flights';

describe('spent', () => {
  const press = vi.fn();
  let unbind = () => {};
  afterEach(() => {
    unbind();
    press.mockClear();
    document.body.replaceChildren();
  });
  const bind = () => {
    unbind = bindSpots({
      bin: () => ({ x: 10, y: 10 }),
      onMap: () => ({ x: 200, y: 100 }),
      stamp: press,
    });
  };

  it('flies the cost when motion is full, and never presses a stamp: it comes at completion', () => {
    bind();
    HTMLElement.prototype.animate ??= () => ({ finished: new Promise(() => {}) }) as Animation;
    spent({ steel: 30 }, [2, 48], 'full');
    expect(document.querySelector('.harvest-pastille')).not.toBeNull();
    expect(press).not.toHaveBeenCalled();
  });

  it.each(['reduced', 'off'] as const)('flies nothing when motion is %s', (motion) => {
    bind();
    spent({ steel: 30 }, [2, 48], motion);
    expect(document.querySelector('.harvest-pastille')).toBeNull();
    expect(press).not.toHaveBeenCalled();
  });
});

describe('placed', () => {
  const animate = vi.fn((..._args: unknown[]) => ({ finished: new Promise(() => {}) }));
  const original = HTMLElement.prototype.animate;
  let unbind = () => {};
  beforeEach(() => {
    animate.mockClear();
    HTMLElement.prototype.animate = animate as never;
  });
  afterEach(() => {
    unbind();
    HTMLElement.prototype.animate = original;
    document.body.replaceChildren();
  });
  const bind = (part: Parameters<typeof bindSpots>[0] = {}) => {
    unbind = bindSpots({
      onMap: () => ({ x: 200, y: 100 }),
      queue: () => ({ x: 20, y: 800 }),
      tile: () => ({ width: 60, height: 50 }),
      ...part,
    });
  };
  const durations = () =>
    animate.mock.calls.map(([, options]) => (options as { duration: number }).duration);

  it('opens the ring (900 ms) and flies the tile to the queue (460 ms) when motion is full', () => {
    bind();
    placed('mine', [2, 48], 'full');
    expect(document.querySelector('.recharge-pulse')).not.toBeNull();
    expect(document.querySelector('.placed-tile')).not.toBeNull();
    expect(durations().sort()).toEqual([460, 900]);
  });

  it('only fades the tile at its arrival when motion is reduced: no ring', () => {
    bind();
    placed('mine', [2, 48], 'reduced');
    expect(document.querySelector('.recharge-pulse')).toBeNull();
    expect(document.querySelector('.placed-tile')).not.toBeNull();
    const [frames] = animate.mock.calls[0] as [Array<{ opacity?: number }>];
    expect(frames.map((frame) => frame.opacity)).toEqual([0, 1, 0]);
  });

  it('moves nothing when motion is off', () => {
    bind();
    placed('mine', [2, 48], 'off');
    expect(document.body.children).toHaveLength(0);
    expect(animate).not.toHaveBeenCalled();
  });

  it('keeps the ring alone, without an error, when the stage is ceded and the tile has no box', () => {
    bind({ tile: () => null });
    expect(() => placed('mine', [2, 48], 'full')).not.toThrow();
    expect(document.querySelector('.recharge-pulse')).not.toBeNull();
    expect(document.querySelector('.placed-tile')).toBeNull();
  });
});
