// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { NameSpots } from './engine';
import { NameSheet } from './map-names';

const size = { width: 800, height: 600 };
const field = { left: 0, top: 0, right: 800, bottom: 600 };
const paris = { x: 100, y: 100, name: 'Paris', capital: true };
const spots = (over: Partial<NameSpots> = {}): NameSpots => ({
  cities: [paris],
  rivers: [],
  seas: [],
  pins: [],
  night: 0,
  ...over,
});

/** A sheet on a canvas that counts how many times it was wiped. */
function sheet() {
  let wiped = 0;
  const context = new Proxy(
    {},
    {
      get: (_, name) =>
        name === 'clearRect'
          ? () => (wiped += 1)
          : name === 'measureText'
            ? () => ({ width: 40 })
            : () => {},
      set: () => true,
    },
  );
  const canvas = document.createElement('canvas');
  canvas.getContext = (() => context) as unknown as HTMLCanvasElement['getContext'];
  const names = new NameSheet(canvas);
  return {
    paint: (drawn: NameSpots, occupied: Parameters<NameSheet['paint']>[1] = []) =>
      names.paint(drawn, occupied, size, false, field),
    wiped: () => wiped,
  };
}

const fonts = (status: 'loading' | 'loaded') =>
  Object.defineProperty(document, 'fonts', { value: { status }, configurable: true });

describe('NameSheet.paint', () => {
  beforeEach(() => fonts('loaded'));

  it('paints the same names once, however many frames ask for them', () => {
    const names = sheet();
    names.paint(spots());
    names.paint(spots());
    names.paint(spots({ night: 0 }));
    expect(names.wiped()).toBe(1);
  });

  it('paints again when a name moves, and when a piece comes to stand on the sheet', () => {
    const names = sheet();
    names.paint(spots());
    names.paint(spots({ cities: [{ ...paris, x: 101 }] }));
    expect(names.wiped()).toBe(2);
    names.paint(spots({ cities: [{ ...paris, x: 101 }] }), [
      { left: 90, top: 90, right: 120, bottom: 120 },
    ]);
    expect(names.wiped()).toBe(3);
  });

  it('paints again when its font lands: the widths taken on the fallback were wrong', () => {
    fonts('loading');
    const names = sheet();
    names.paint(spots());
    fonts('loaded');
    names.paint(spots());
    expect(names.wiped()).toBe(2);
  });

  it('keeps its ink through a night too faint to change it, and takes the moon’s when it does', () => {
    const names = sheet();
    const sea = { name: 'Manche', spots: [{ x: 400, y: 300, diameter: 300 }] };
    names.paint(spots({ seas: [sea], night: 0 }));
    names.paint(spots({ seas: [sea], night: 0.0001 }));
    expect(names.wiped()).toBe(1);
    names.paint(spots({ seas: [sea], night: 0.8 }));
    expect(names.wiped()).toBe(2);
  });
});
