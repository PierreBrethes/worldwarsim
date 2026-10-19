// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindSpots, spent } from './flights';

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
