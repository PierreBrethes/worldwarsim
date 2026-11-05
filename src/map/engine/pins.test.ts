import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3, type BufferGeometry } from 'three';
import type { LonLat } from '@/domain/geo';
import type { Pin } from '@/domain/pins';
import { PROJECTION, WorldFrame } from './frame';
import { isPinOf, pictoText, PinLayer, tagOf } from './pins';
import { REACH } from './halo';
import { troopPinSpan, type PinnedBy } from './figurines/figurine';
import { buildingSpan, troopSpan } from '@/domain/piece-size';
import { PIN_FALL_MS, PIN_TILT_MS } from './timelines/dismantle';

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ width: 10 }) });
  Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => ctx }) } });
});

const W = 1440;
const H = 900;
const frame = new WorldFrame(PROJECTION);

/** The eye straight above `at`, `distance` away, as the board's camera looks down. */
function eyeOver(at: LonLat, distance: number): PerspectiveCamera {
  const eye = new PerspectiveCamera(42, W / H, 0.5, 3000);
  const ground = frame.projectLonLat(at);
  eye.position.copy(ground).add(new Vector3(0, distance, 0.001));
  eye.lookAt(ground);
  eye.updateMatrixWorld();
  return eye;
}

const mine = (id: string, lonLat: LonLat, moving = false): Pin => ({
  id,
  anchor: moving ? { kind: 'movementHead', arc: id } : { kind: 'ground', lonLat },
  shape: 'pile',
  side: 'mine',
  ink: '#2a5ba8',
  stack: { infantry: 1 },
  ...(moving ? { moving: true as const } : {}),
});
const seen = (id: string, lonLat: LonLat): Pin => ({
  id,
  anchor: { kind: 'ground', lonLat },
  shape: 'pile',
  side: 'seen',
});

function laidOut(
  pins: ReadonlyArray<Pin>,
  eye: PerspectiveCamera,
  heads = new Map<string, Vector3>(),
) {
  const layer = new PinLayer(frame, () => null);
  layer.display(pins);
  layer.layout(eye, W, H, heads, new Map());
  return layer;
}

const screenOf = (eye: PerspectiveCamera, at: LonLat): [number, number] => {
  const v = frame.projectLonLat(at).project(eye);
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
};

describe('PinLayer — the pieces far away', () => {
  const paris: LonLat = [2.35, 48.85];
  /** A degree of longitude is about ten pixels at 120, twenty at 60. */
  const besideParis: LonLat = [2.6, 48.95];
  const eastOfParis: LonLat = [3.3, 48.85];
  const lyon: LonLat = [4.85, 45.76];

  it('takes a lone pile of mine by its pin, under the pointer', () => {
    const eye = eyeOver(paris, 120);
    const layer = laidOut([mine('pile-paris', paris), mine('pile-lyon', lyon)], eye);
    expect(layer.under(...screenOf(eye, lyon))).toEqual({ kind: 'pin', id: 'pile-lyon' });
    expect(layer.under(...screenOf(eye, [-20, 30]))).toBeNull();
  });

  it('ranges pins that touch into one numbered cluster, and never a survey with mine', () => {
    const eye = eyeOver(paris, 120);
    const layer = laidOut(
      [mine('a', paris), mine('b', besideParis), seen('camp', [3.5, 48.85])],
      eye,
    );
    const hit = layer.under(...screenOf(eye, paris));
    expect(hit).toMatchObject({ kind: 'cluster' });
    expect(hit?.kind === 'cluster' && [...hit.ids].sort()).toEqual(['a', 'b']);
  });

  it('opens the cluster when the camera comes closer', () => {
    const eye = eyeOver(paris, 30);
    const layer = laidOut([mine('a', paris), mine('b', [3.5, 48.85])], eye);
    expect(layer.under(...screenOf(eye, paris))).toEqual({ kind: 'pin', id: 'a' });
  });

  it('ranges my pins within 30 px and surveys within 22 (maquette C)', () => {
    const eye = eyeOver(paris, 120);
    const apart = (lonLat: LonLat) =>
      Math.hypot(...screenOf(eye, paris).map((v, k) => v - screenOf(eye, lonLat)[k]!));
    const near: LonLat = [5.1, 48.85];
    expect(apart(near)).toBeGreaterThan(22);
    expect(apart(near)).toBeLessThan(30);
    const [ax, ay] = screenOf(eye, paris);
    const [bx, by] = screenOf(eye, near);
    expect(
      laidOut([mine('a', paris), mine('b', near)], eye).under((ax + bx) / 2, (ay + by) / 2),
    ).toMatchObject({ kind: 'cluster' });
    expect(
      laidOut([seen('a', paris), seen('b', near)], eye).under(...screenOf(eye, paris)),
    ).toEqual({
      kind: 'pin',
      id: 'a',
    });
  });

  it('writes the troops in the disc, and « ? » on a survey no Guet has read', () => {
    const eye = eyeOver(paris, 120);
    const glyphs = (pins: ReadonlyArray<Pin>) =>
      (
        laidOut(pins, eye) as unknown as {
          glyphs: { mesh: { geometry: { instanceCount: number } } };
        }
      ).glyphs.mesh.geometry.instanceCount;
    expect(glyphs([{ ...mine('a', paris), stack: { infantry: 8, armor: 4 } } as Pin])).toBe(2);
    expect(glyphs([mine('a', paris)])).toBe(0);
    expect(glyphs([seen('c', paris)])).toBe(1);
    expect(glyphs([{ ...seen('c', paris), pierced: { infantry: 12 } } as Pin])).toBe(2);
  });

  it('labels only the pins of a contact, with their pictos and counts beside them', () => {
    const eye = eyeOver(paris, 120);
    const layer = new PinLayer(frame, () => null);
    layer.display([{ ...mine('a', paris), stack: { infantry: 3 } } as Pin, mine('b', lyon)]);
    layer.layout(eye, W, H, new Map(), new Map());
    expect(layer.rects()).toHaveLength(2);
    layer.engage(new Set(['a']));
    layer.layout(eye, W, H, new Map(), new Map());
    const [disc, ...rest] = layer.rects();
    expect(rest).toHaveLength(2);
    const tag = rest.find((rect) => rect.left > disc!.right)!;
    expect(tag.top).toBeLessThan(screenOf(eye, paris)[1]);
    expect(tag.bottom).toBeGreaterThan(screenOf(eye, paris)[1]);
  });

  it('gives way to the figurines up close: no pin under the pointer', () => {
    const eye = eyeOver(paris, 4);
    const layer = laidOut([mine('a', paris)], eye);
    expect(layer.under(...screenOf(eye, paris))).toBeNull();
  });

  it('keeps an outpost by its pin at every distance: it has no piece to give way to (#296)', () => {
    const outpost: Pin = { ...mine('o', paris), shape: 'outpost' };
    for (const distance of [3, 10, 30, 80]) {
      const eye = eyeOver(paris, distance);
      const layer = new PinLayer(
        frame,
        () => null,
        false,
        () => {},
        () => null,
      );
      layer.display([outpost]);
      layer.layout(eye, W, H, new Map(), new Map());
      expect(layer.under(...screenOf(eye, paris))).toEqual({ kind: 'pin', id: 'o' });
    }
  });

  it('gives way to a site on its socle with my piles, whatever its size (#465)', () => {
    const building: Pin = { ...mine('b', paris), shape: 'building' };
    const pinAt = (distance: number, by: PinnedBy) => {
      const eye = eyeOver(paris, distance);
      const layer = new PinLayer(
        frame,
        () => null,
        false,
        () => {},
        () => by,
      );
      layer.display([building]);
      layer.layout(eye, W, H, new Map(), new Map());
      return layer.under(...screenOf(eye, paris));
    };
    // Its walls alone give way by d = 68; on its socle, at the troops' floor, as a pile's pin.
    expect(pinAt(68, buildingSpan('barracks'))).toEqual({ kind: 'pin', id: 'b' });
    expect(pinAt(30, 'socle')).toBeNull();
    expect(pinAt(36, 'socle')).toEqual({ kind: 'pin', id: 'b' });
    expect(pinAt(30, troopPinSpan(troopSpan('infantry')))).toBeNull();
    expect(pinAt(36, troopPinSpan(troopSpan('infantry')))).toEqual({ kind: 'pin', id: 'b' });
  });

  it('stands where a ring carried its maquette, not on the point the maquette left', () => {
    const eye = eyeOver(paris, 120);
    const layer = new PinLayer(
      frame,
      () => null,
      false,
      () => {},
      () => null,
      (id) => (id === 'a' ? frame.projectLonLat(lyon) : null),
    );
    layer.display([mine('a', paris)]);
    layer.layout(eye, W, H, new Map(), new Map());
    expect(layer.under(...screenOf(eye, lyon))).toEqual({ kind: 'pin', id: 'a' });
    expect(layer.under(...screenOf(eye, paris))).toBeNull();
  });

  it('walks a recruit pinned in the middle of its walk along the path (#268)', () => {
    const eye = eyeOver(paris, 120);
    const layer = new PinLayer(frame, () => null);
    layer.display([mine('a', paris), mine('b', lyon)]);
    const travel = frame.projectLonLat(eastOfParis).sub(frame.projectLonLat(paris));
    layer.walk([{ id: 'a', travel, alone: true }]);
    layer.layout(eye, W, H, new Map(), new Map());
    expect(layer.under(...screenOf(eye, eastOfParis))).toEqual({ kind: 'pin', id: 'a' });
    expect(layer.under(...screenOf(eye, paris))).toBeNull();
    // Into a rank that already stands: the rank keeps its pin, the walker has its own.
    layer.walk([{ id: 'b', travel, alone: false }]);
    layer.layout(eye, W, H, new Map(), new Map());
    expect(layer.under(...screenOf(eye, lyon))).toEqual({ kind: 'pin', id: 'b' });
    expect(layer.under(...screenOf(eye, paris))).toEqual({ kind: 'pin', id: 'a' });
  });

  it('stands for a pile as soon as its piece is too small to read (ADR 0035)', () => {
    const eye = eyeOver(paris, 20);
    const layer = laidOut([mine('a', paris)], eye);
    expect(layer.under(...screenOf(eye, paris))).toEqual({ kind: 'pin', id: 'a' });
  });

  it('keeps a moving pile out of any cluster, at the head of its movement', () => {
    const eye = eyeOver(paris, 120);
    const head = frame.projectLonLat(eastOfParis);
    const layer = laidOut(
      [mine('a', paris), mine('arc-1', eastOfParis, true)],
      eye,
      new Map([['arc-1', head]]),
    );
    expect(layer.under(...screenOf(eye, paris))).toEqual({ kind: 'pin', id: 'a' });
    expect(layer.under(...screenOf(eye, eastOfParis))).toEqual({ kind: 'pin', id: 'arc-1' });
  });

  it('merges surveys whose drawn discs touch, though the grid kept them apart', () => {
    const eye = eyeOver(paris, 120);
    const near: LonLat = [5.05, 48.85];
    const apart = Math.hypot(...screenOf(eye, paris).map((v, k) => v - screenOf(eye, near)[k]!));
    // Past both the grid's 22 px and two bare discs' 24: only their drawn 13 px bring them in.
    expect(apart).toBeGreaterThan(24);
    expect(apart).toBeLessThan(28);
    const read = (id: string, at: LonLat) =>
      ({ ...seen(id, at), pierced: { infantry: 200 } }) as Pin;
    const layer = laidOut([read('a', paris), read('b', near)], eye);
    expect(layer.rects()).toHaveLength(1);
  });

  it('labels an escort as a ship, and a headquarters by its own picto', () => {
    const pile = { ...mine('a', paris), stack: { infantry: 2, escort: 1 } } as Pin;
    expect(tagOf([pile])).toBe(` ${pictoText('infantry')}2 ${pictoText('sea')}1 `);
    const hq = { ...mine('h', paris), shape: 'building', key: 'hq', stack: {} } as Pin;
    expect(tagOf([hq])).toBe(` ${pictoText('hq')}1 `);
  });

  it('hangs a label stood off its pin by a thread', () => {
    const eye = eyeOver(paris, 120);
    const layer = new PinLayer(frame, () => null);
    // Four big surveys 25 px round it take every near spot: the label goes further out.
    const [x0, y0] = screenOf(eye, paris);
    const perLon = screenOf(eye, [paris[0] + 1, paris[1]])[0] - x0;
    const perLat = screenOf(eye, [paris[0], paris[1] + 1])[1] - y0;
    const at = (dx: number, dy: number): LonLat => [paris[0] + dx / perLon, paris[1] + dy / perLat];
    const big = (id: string, lonLat: LonLat) =>
      ({ ...seen(id, lonLat), pierced: { infantry: 200 } }) as Pin;
    layer.display([
      { ...mine('a', paris), stack: { infantry: 3 } } as Pin,
      big('e', at(25, 0)),
      big('w', at(-25, 0)),
      big('s', at(0, 25)),
      big('n', at(0, -25)),
    ]);
    layer.engage(new Set(['a']));
    layer.layout(eye, W, H, new Map(), new Map());
    layer.settle();
    layer.layout(eye, W, H, new Map(), new Map());
    const extra = (
      layer as unknown as { shapes: { mesh: { geometry: BufferGeometry } } }
    ).shapes.mesh.geometry.getAttribute('aExtra');
    expect(extra.getW(0)).toBe(-1);
    expect(Math.hypot(extra.getX(0), extra.getY(0))).toBeGreaterThanOrEqual(16);
  });

  it('stands a label on the left, once the camera stopped, when its right covers a survey', () => {
    const eye = eyeOver(paris, 120);
    const layer = new PinLayer(frame, () => null);
    layer.display([
      { ...mine('a', paris), stack: { infantry: 3 } } as Pin,
      seen('c', [3.6, 48.85]),
    ]);
    layer.engage(new Set(['a', 'c']));
    layer.layout(eye, W, H, new Map(), new Map());
    const [x] = screenOf(eye, paris);
    const tagOfA = () =>
      layer
        .rects()
        .find(
          (rect) =>
            rect.top > -1 &&
            Math.abs((rect.left + rect.right) / 2 - x) > 8 &&
            Math.abs((rect.left + rect.right) / 2 - x) < 40,
        )!;
    expect(tagOfA().left).toBeGreaterThan(x);
    layer.settle();
    // The names painted at the same rest read the new spot, before any frame.
    expect(tagOfA().right).toBeLessThan(x);
    layer.layout(eye, W, H, new Map(), new Map());
    expect(tagOfA().right).toBeLessThan(x);
  });

  it('redoes no cluster while the camera stands still', () => {
    const eye = eyeOver(paris, 120);
    const layer = laidOut([mine('a', paris), mine('b', besideParis), mine('c', lyon)], eye);
    const project = vi.spyOn(Vector3.prototype, 'project');
    layer.layout(eye, W, H, new Map(), new Map());
    expect(project).not.toHaveBeenCalled();
    project.mockRestore();
  });

  it('keeps the selected piece out of its cluster, where its ring can be seen', () => {
    const eye = eyeOver(paris, 120);
    const layer = new PinLayer(frame, () => null);
    layer.display([mine('a', paris), mine('b', besideParis)]);
    layer.select('a', '#2a5ba8');
    layer.layout(eye, W, H, new Map(), new Map());
    expect(layer.under(...screenOf(eye, paris))).toEqual({ kind: 'pin', id: 'a' });
  });

  it('lights a lamp three times its pin at night, around mine only', () => {
    const eye = eyeOver(paris, 120);
    const layer = laidOut([mine('a', paris), seen('camp', lyon)], eye);
    const glows: number[] = [];
    layer.lights((_, radius) => glows.push(radius * REACH), 1);
    expect(glows).toEqual([3 * 4]);
  });

  it('says what each disc covers of the board, mine and surveyed, for a contact to ring it (#441)', () => {
    const eye = eyeOver(paris, 120);
    const layer = laidOut([mine('a', paris), seen('camp', lyon)], eye);
    const covered: number[] = [];
    layer.discs((_, radius) => covered.push(radius), 0.5);
    expect(covered).toHaveLength(2);
    expect(Math.min(...covered)).toBeGreaterThan(0.5 * 5);
  });
});

describe('isPinOf', () => {
  it('yields only to the pin of the pile, not to a neighbour outpost’s (#296)', () => {
    const hit = { kind: 'pin', id: 'outpost-near' } as const;
    expect(isPinOf(hit, 'outpost-near')).toBe(true);
    expect(isPinOf(hit, 'outpost:mine')).toBe(false);
    expect(isPinOf({ kind: 'cluster', ids: ['a'], x: 0, y: 0 }, 'a')).toBe(false);
    expect(isPinOf(null, 'a')).toBe(false);
  });
});

describe('PinLayer — under a combat played on the map (#272)', () => {
  const paris: LonLat = [2.35, 48.85];
  const lyon: LonLat = [4.85, 45.76];

  it('lays out no pin inside a veil: the state after the combat waits for its end', () => {
    const eye = eyeOver(paris, 120);
    const layer = new PinLayer(frame, () => null);
    layer.display([seen('pile-paris', paris), mine('pile-lyon', lyon)]);
    const veiled = frame.projectLonLat(paris);
    layer.veil((at) => at.distanceTo(veiled) < 0.1);
    layer.layout(eye, W, H, new Map(), new Map());
    expect(layer.under(...screenOf(eye, paris))).toBeNull();
    expect(layer.under(...screenOf(eye, lyon))).toEqual({ kind: 'pin', id: 'pile-lyon' });
    layer.veil(null);
    layer.layout(eye, W, H, new Map(), new Map());
    expect(layer.under(...screenOf(eye, paris))).toEqual({ kind: 'pin', id: 'pile-paris' });
  });
});

describe('PinLayer — a dismantled outpost’s pin leaves (#340)', () => {
  const paris: LonLat = [2.35, 48.85];
  const outpost: Pin = { ...mine('outpost-o', paris), shape: 'outpost' };
  const lit = (layer: PinLayer) => {
    let lamps = 0;
    layer.lights(() => (lamps += 1), 1);
    return lamps;
  };
  const leaving = () => {
    const eye = eyeOver(paris, 30);
    const layer = new PinLayer(
      frame,
      () => null,
      false,
      () => {},
      () => null,
    );
    layer.display([outpost]);
    layer.leave('outpost-o', 1000, 'full');
    layer.display([]);
    return { eye, layer };
  };

  it('is still drawn while it tips, takes no pointer, and asks for frames', () => {
    const { eye, layer } = leaving();
    layer.layout(eye, W, H, new Map(), new Map(), eye.position, 1200);
    expect(layer.active).toBe(true);
    expect(lit(layer)).toBe(1);
    expect(layer.under(...screenOf(eye, paris))).toBeNull();
  });

  it('is gone once its fall is over', () => {
    const { eye, layer } = leaving();
    layer.layout(eye, W, H, new Map(), new Map(), eye.position, 1000 + PIN_FALL_MS);
    expect(layer.active).toBe(false);
    expect(lit(layer)).toBe(0);
  });

  it('writes how far it has tipped into the shader’s fourth component', () => {
    const { eye, layer } = leaving();
    layer.layout(eye, W, H, new Map(), new Map(), eye.position, 1000 + PIN_TILT_MS);
    const extra = (
      layer as unknown as { shapes: { mesh: { geometry: BufferGeometry } } }
    ).shapes.mesh.geometry.getAttribute('aExtra');
    expect(extra.getW(0)).toBeCloseTo(1.52);
  });

  it('does not tip when motion is reduced: it says where it stood, for a ring of ink', () => {
    const eye = eyeOver(paris, 30);
    const layer = new PinLayer(
      frame,
      () => null,
      false,
      () => {},
      () => null,
    );
    layer.display([outpost]);
    const stood = layer.leave('outpost-o', 1000, 'reduced');
    layer.display([]);
    layer.layout(eye, W, H, new Map(), new Map(), eye.position, 1100);
    expect(stood).not.toBeNull();
    expect(layer.active).toBe(false);
  });

  it('does not play when motion is cut: the pin is simply gone', () => {
    const eye = eyeOver(paris, 30);
    const layer = new PinLayer(
      frame,
      () => null,
      false,
      () => {},
      () => null,
    );
    layer.display([outpost]);
    layer.leave('outpost-o', 1000, 'off');
    layer.display([]);
    layer.layout(eye, W, H, new Map(), new Map(), eye.position, 1100);
    expect(layer.active).toBe(false);
  });
});
