import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Box3, Color, InstancedMesh, Matrix4, Raycaster, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LonLat } from '@/domain/geo';
import { FLAG_FADE_MS, FLAG_FOOT } from '@/domain/flag-swap';
import { FLAG_SWAP_MS } from '@/domain/ink-bursts';
import { MAST_PX, MAST_UNITS, mastOf, mastPx } from '@/domain/strategic-mast';
import type { StrategicPointView } from '@/domain/player-view';
import { STRATEGIC_POINTS } from '@/domain/strategic-points';
import { RING_RADIUS } from './annotations';
import { Ambience } from './ambience';
import { ANONYMOUS_SPAN, troopScale } from './figurines/figurine';
import { pieceScale } from './piece-scale';
import { LEAST_TARGET_PX, LEAST_TOUCH_PX } from './piece-pick';
import {
  baseRadiusOf,
  mastScale,
  nightInk,
  StrategicMasts,
  type MastPoint,
} from './strategic-masts';
import { LIVE_PX } from './site-loops';

const FOV = 42;
const HEIGHT = 900;
const frame = { projectLonLat: ([lon, lat]: LonLat) => new Vector3(lon, 0, -lat) };
const EYE = new Vector3(0, 30, 30);

const view = (over: Partial<StrategicPointView> = {}): StrategicPointView => ({
  id: 'p',
  key: 'lisbon',
  regionId: 'r',
  point: STRATEGIC_POINTS.lisbon,
  holder: null,
  heldSince: null,
  mine: false,
  contested: false,
  longest: null,
  ...over,
});
const stand = (id: string, lon: number, over: Partial<StrategicPointView> = {}): MastPoint => ({
  id: `strategic-${id}`,
  lonLat: [lon, 40],
  mast: mastOf(view(over), false),
});

function setup(options: { sees?: boolean; touch?: boolean } = {}) {
  const asked: number[] = [];
  const clock = { ms: 1000 };
  const layer = new StrategicMasts(
    frame,
    (_box: Box3, px) => {
      asked.push(px);
      return options.sees ?? true;
    },
    options.touch ?? false,
    () => clock.ms,
  );
  return { layer, asked, clock };
}

const meshes = (layer: StrategicMasts) => layer.object.children as InstancedMesh[];
const matrixOf = (mesh: InstancedMesh, k: number) =>
  new Matrix4().fromArray(mesh.instanceMatrix.array, 16 * k);
const colorOf = (mesh: InstancedMesh, k: number) =>
  new Color().fromArray(mesh.instanceColor!.array, 3 * k);
const orient = (layer: StrategicMasts, distance = 40, night = 0) =>
  layer.orient(EYE, distance, HEIGHT, FOV, night);

beforeEach(() => {
  pieceScale.pxPerUnit = 1172;
});

describe('winding', () => {
  // The material is front-faced only: a triangle wound the other way is culled, and the rim, the
  // dashed ring, the pomme and the star went missing (#683) while the socle and shaft showed.
  it('every triangle of every shape faces the camera: up for the ground, +z for the mast', () => {
    const { layer } = setup();
    for (const mesh of meshes(layer)) {
      const position = mesh.geometry.getAttribute('position');
      const index = mesh.geometry.getIndex()!;
      const onGround = Array.from({ length: position.count }, (_, i) => position.getY(i)).every(
        (y) => y === 0,
      );
      for (let t = 0; t < index.count; t += 3) {
        const [a, b, c] = [0, 1, 2].map((k) =>
          new Vector3().fromBufferAttribute(position, index.getX(t + k)),
        ) as [Vector3, Vector3, Vector3];
        const normal = b.sub(a).cross(c.sub(a));
        expect(onGround ? normal.y : normal.z).toBeGreaterThan(0);
      }
    }
  });
});

describe('the strategic masts layer', () => {
  it('draws every point in five instanced draws, a sixth only for a beam, none per nation, with no shadow', () => {
    const { layer } = setup();
    layer.show([
      stand('a', 1, { holder: { nation: 'germany', heldMs: 0 } }),
      stand('b', 2, { holder: { nation: 'britain', heldMs: 0 } }),
      stand('c', 3),
    ]);
    orient(layer);
    const drawn = meshes(layer);
    expect(drawn).toHaveLength(6);
    expect(drawn.every((mesh) => mesh.isInstancedMesh)).toBe(true);
    expect(drawn.filter((mesh) => mesh.count > 0).length).toBeLessThanOrEqual(5);
    expect(drawn.every((mesh) => !mesh.castShadow && !mesh.receiveShadow)).toBe(true);
    expect(drawn.map((mesh) => mesh.count)).toEqual([3, 0, 3, 3, 3, 0]);
  });

  it('hides the group while no mast is in the field', () => {
    const none = setup({ sees: false });
    none.layer.show([stand('a', 1)]);
    orient(none.layer);
    expect(none.layer.object.visible).toBe(false);
    const some = setup();
    some.layer.show([stand('a', 1)]);
    orient(some.layer);
    expect(some.layer.object.visible).toBe(true);
  });

  it('edges the socle with a liseré in the ink of the point, white when neutral', () => {
    const { layer } = setup();
    layer.show([stand('a', 1, { holder: { nation: 'germany', heldMs: 0 } }), stand('b', 2)]);
    orient(layer);
    const [socle, , mast, rim, flame] = meshes(layer) as [InstancedMesh, ...InstancedMesh[]];
    expect(colorOf(rim!, 0).getHex()).toBe(colorOf(flame!, 0).getHex());
    expect(colorOf(rim!, 1).getHex()).toBe(0xffffff);
    expect(matrixOf(rim!, 0).toArray()).toEqual(matrixOf(socle, 0).toArray());
    // The shaft, the pomme and the socle's fill keep the pen.
    expect(colorOf(mast!, 0).getHex()).toBe(colorOf(socle, 0).getHex());
    expect(colorOf(mast!, 0).getHex()).not.toBe(colorOf(rim!, 1).getHex());
    expect(meshes(layer)).toHaveLength(6);
  });

  it('draws nothing, and is hidden, with no point', () => {
    const { layer } = setup();
    orient(layer);
    expect(layer.object.visible).toBe(false);
    layer.show([stand('a', 1)]);
    orient(layer);
    expect(layer.object.visible).toBe(true);
  });

  it('stands to the north of the point, past its socle and the ring of a camp', () => {
    const { layer } = setup();
    layer.show([stand('a', 5)]);
    orient(layer);
    const scale = mastScale(
      mastPx(40, false, HEIGHT, FOV),
      (2 * Math.tan((FOV * Math.PI) / 360) * 40) / HEIGHT,
    );
    const camp =
      RING_RADIUS *
      troopScale(new Vector3(5, 0, -40).distanceTo(EYE), ANONYMOUS_SPAN, ANONYMOUS_SPAN);
    const foot = new Vector3().setFromMatrixPosition(matrixOf(meshes(layer)[2]!, 0));
    expect(foot.x).toBeCloseTo(5, 5);
    expect(-foot.z).toBeGreaterThan(40);
    expect(-foot.z - 40).toBeCloseTo(baseRadiusOf(scale) + camp, 4);
  });

  it('sizes the mast on screen by mastPx, from the viewport and FOV it is given', () => {
    const { layer } = setup();
    layer.show([stand('a', 5)]);
    for (const [distance, height] of [
      [40, 900],
      [136, 900],
      [136, 1800],
    ] as const) {
      layer.orient(EYE, distance, height, FOV, 0);
      const scale = new Vector3().setFromMatrixScale(matrixOf(meshes(layer)[2]!, 0)).y;
      const px =
        (MAST_UNITS.height * scale * height) / (2 * Math.tan((FOV * Math.PI) / 360) * distance);
      expect(px).toBeCloseTo(mastPx(distance, false, height, FOV), 4);
    }
  });

  it('puts the flame at its height and in its ink, per point, read again by each show', () => {
    const { layer, clock } = setup();
    layer.show([
      stand('a', 1, { holder: { nation: 'germany', heldMs: 0 } }),
      stand('b', 2, { holder: { nation: 'germany', heldMs: 0 }, contested: true }),
    ]);
    orient(layer);
    const flame = meshes(layer)[4]!;
    // Where the pennant hangs, as a share of the mast, read in the mast's own frame.
    const rise = (k: number) =>
      new Vector3()
        .setFromMatrixPosition(matrixOf(flame, k))
        .applyMatrix4(matrixOf(meshes(layer)[2]!, k).invert()).y / MAST_UNITS.height;
    expect(rise(0)).toBeCloseTo(1, 5);
    expect(rise(1)).toBeCloseTo(0.42, 5);
    expect(colorOf(flame, 0).getHex()).toBe(
      new Color(mastOf(view({ holder: { nation: 'germany', heldMs: 0 } }), false).ink).getHex(),
    );
    // Served again with no holder: the swap (below) has played by the time the mast is drawn.
    layer.show([stand('a', 1), stand('b', 2)]);
    clock.ms += FLAG_SWAP_MS;
    orient(layer);
    expect(colorOf(flame, 0).getHex()).toBe(0xffffff);
    expect(rise(1)).toBeCloseTo(1, 5);
  });

  describe('the swap of a taken point (#682)', () => {
    const germany = { holder: { nation: 'germany' as const, heldMs: 0 } };
    const britain = { holder: { nation: 'britain' as const, heldMs: 0 } };
    const flameOf = (layer: StrategicMasts, k = 0) => {
      const flame = meshes(layer)[4]!;
      return {
        rise:
          new Vector3()
            .setFromMatrixPosition(matrixOf(flame, k))
            .applyMatrix4(matrixOf(meshes(layer)[2]!, k).invert()).y / MAST_UNITS.height,
        hex: colorOf(flame, k).getHex(),
      };
    };
    const inkOf = (over: Partial<StrategicPointView>) => new Color(mastOf(view(over), false).ink);

    it('stands still on the first view, for a new point and while the holder is the same', () => {
      const { layer } = setup();
      layer.show([stand('a', 1, germany)]);
      expect(layer.swapping).toBe(false);
      layer.show([stand('a', 1, germany), stand('b', 2, britain)]);
      expect(layer.swapping).toBe(false);
    });

    it('goes down in the old ink, changes ink at the foot, and rises in the new one', () => {
      const { layer, clock } = setup();
      layer.frame(0, 'full');
      layer.show([stand('a', 1, germany)]);
      layer.show([stand('a', 1, britain)]);
      expect(layer.swapping).toBe(true);
      orient(layer);
      expect(flameOf(layer)).toEqual({ rise: expect.closeTo(1, 5), hex: inkOf(germany).getHex() });
      clock.ms += FLAG_SWAP_MS / 4;
      orient(layer);
      expect(flameOf(layer).rise).toBeLessThan(1);
      expect(flameOf(layer).hex).toBe(inkOf(germany).getHex());
      clock.ms += FLAG_SWAP_MS / 4;
      orient(layer);
      expect(flameOf(layer).rise).toBeCloseTo(FLAG_FOOT, 5);
      expect(flameOf(layer).hex).toBe(inkOf(britain).getHex());
    });

    it('asks the loop for frames until the flame has risen, and for none after', () => {
      const { layer, clock } = setup();
      layer.frame(0, 'full');
      layer.show([stand('a', 1, germany)]);
      layer.show([stand('a', 1, britain)]);
      clock.ms += FLAG_SWAP_MS - 1;
      orient(layer);
      expect(layer.swapping).toBe(true);
      clock.ms += 1;
      orient(layer);
      expect(layer.swapping).toBe(false);
      expect(flameOf(layer)).toEqual({ rise: expect.closeTo(1, 5), hex: inkOf(britain).getHex() });
    });

    it('is not restarted by a view that serves the same holder again', () => {
      const { layer, clock } = setup();
      layer.frame(0, 'full');
      layer.show([stand('a', 1, germany)]);
      layer.show([stand('a', 1, britain)]);
      clock.ms += FLAG_SWAP_MS / 2;
      layer.show([stand('a', 1, britain)]);
      clock.ms += FLAG_SWAP_MS / 2;
      orient(layer);
      expect(layer.swapping).toBe(false);
    });

    it('fades the ink in reduced motion and cuts it with motion off', () => {
      for (const [motion, ms] of [
        ['reduced', FLAG_FADE_MS],
        ['off', 0],
      ] as const) {
        const { layer, clock } = setup();
        layer.frame(0, motion);
        layer.show([stand('a', 1, germany)]);
        layer.show([stand('a', 1, britain)]);
        orient(layer);
        const start = flameOf(layer);
        expect(start.rise).toBeCloseTo(1, 5);
        expect(start.hex).toBe(ms === 0 ? inkOf(britain).getHex() : inkOf(germany).getHex());
        clock.ms += ms / 2;
        orient(layer);
        expect(flameOf(layer).rise).toBeCloseTo(1, 5);
        clock.ms += ms;
        orient(layer);
        expect(layer.swapping).toBe(false);
        expect(flameOf(layer).hex).toBe(inkOf(britain).getHex());
      }
    });

    it('plays ralenti times slower, as the capture asks', () => {
      const { layer, clock } = setup();
      (globalThis as { __ralenti?: number }).__ralenti = 10;
      try {
        layer.frame(0, 'full');
        layer.show([stand('a', 1, germany)]);
        layer.show([stand('a', 1, britain)]);
        clock.ms += FLAG_SWAP_MS * 5;
        orient(layer);
        expect(layer.swapping).toBe(true);
        expect(flameOf(layer).hex).toBe(inkOf(britain).getHex());
      } finally {
        delete (globalThis as { __ralenti?: number }).__ralenti;
      }
    });
  });

  describe('the swap played by the absence tour (#682)', () => {
    const germany = { holder: { nation: 'germany' as const, heldMs: 0 } };
    const flame = (layer: StrategicMasts) => {
      const mesh = meshes(layer)[4]!;
      return {
        rise:
          new Vector3()
            .setFromMatrixPosition(matrixOf(mesh, 0))
            .applyMatrix4(matrixOf(meshes(layer)[2]!, 0).invert()).y / MAST_UNITS.height,
        hex: colorOf(mesh, 0).getHex(),
      };
    };
    const ink = new Color(mastOf(view(germany), false).ink).getHex();

    it('lowers and raises the flame of a point already in its new ink, with no false holder', () => {
      const { layer, clock } = setup();
      layer.frame(0, 'full');
      layer.show([stand('a', 1, germany)]);
      expect(layer.swapping).toBe(false);
      layer.swapAt([1, 40], null);
      expect(layer.swapping).toBe(true);
      clock.ms += FLAG_SWAP_MS / 2;
      orient(layer);
      expect(flame(layer)).toEqual({ rise: expect.closeTo(FLAG_FOOT, 5), hex: ink });
      clock.ms += FLAG_SWAP_MS / 2;
      orient(layer);
      expect(layer.swapping).toBe(false);
      expect(flame(layer)).toEqual({ rise: expect.closeTo(1, 5), hex: ink });
    });

    it('goes down in the ink it is given, when the old holder is known', () => {
      const { layer } = setup();
      layer.frame(0, 'full');
      layer.show([stand('a', 1, germany)]);
      layer.swapAt([1, 40], '#336699');
      orient(layer);
      expect(flame(layer).hex).toBe(new Color('#336699').getHex());
    });

    it('leaves a place with no mast alone', () => {
      const { layer } = setup();
      layer.show([stand('a', 1, germany)]);
      layer.swapAt([9, 9], null);
      expect(layer.swapping).toBe(false);
    });
  });

  describe('the swap bounds', () => {
    const germany = { holder: { nation: 'germany' as const, heldMs: 0 } };
    const britain = { holder: { nation: 'britain' as const, heldMs: 0 } };
    const france = { holder: { nation: 'france' as const, heldMs: 0 } };

    it('never takes a ralenti under 1 nor one that is not a number', () => {
      for (const rate of [0.1, -5, Number.NaN]) {
        const { layer, clock } = setup();
        (globalThis as { __ralenti?: number }).__ralenti = rate;
        try {
          layer.frame(0, 'full');
          layer.show([stand('a', 1, germany)]);
          layer.show([stand('a', 1, britain)]);
          clock.ms += FLAG_SWAP_MS;
          orient(layer);
          expect(layer.swapping).toBe(false);
        } finally {
          delete (globalThis as { __ralenti?: number }).__ralenti;
        }
      }
    });

    it('restarts from what is shown when the ink changes again mid-swap', () => {
      const { layer, clock } = setup();
      layer.frame(0, 'full');
      layer.show([stand('a', 1, germany)]);
      layer.show([stand('a', 1, britain)]);
      clock.ms += FLAG_SWAP_MS / 4;
      orient(layer);
      const mesh = meshes(layer)[4]!;
      const shown = new Vector3().setFromMatrixPosition(matrixOf(mesh, 0)).y;
      const hex = colorOf(mesh, 0).getHex();
      layer.show([stand('a', 1, france)]);
      orient(layer);
      expect(new Vector3().setFromMatrixPosition(matrixOf(mesh, 0)).y).toBeCloseTo(shown, 5);
      expect(colorOf(mesh, 0).getHex()).toBe(hex);
    });
  });

  it('rings only the contested points, and the ring turns at full motion only', () => {
    const { layer } = setup();
    layer.show([stand('a', 1), stand('b', 2, { contested: true })]);
    layer.frame(0, 'full');
    orient(layer);
    const ring = meshes(layer)[1]!;
    expect(ring.count).toBe(1);
    const at0 = matrixOf(ring, 0).toArray();
    layer.frame(1.7, 'full');
    orient(layer);
    expect(matrixOf(ring, 0).toArray()).not.toEqual(at0);
    for (const motion of ['reduced', 'off'] as const) {
      layer.frame(0.3, motion);
      orient(layer);
      const still = matrixOf(ring, 0).toArray();
      layer.frame(2.9, motion);
      orient(layer);
      expect(ring.count).toBe(1);
      expect(matrixOf(ring, 0).toArray()).toEqual(still);
    }
  });

  it('holds the pennant at rest unless motion is full', () => {
    const { layer } = setup();
    layer.show([stand('a', 1)]);
    const flame = meshes(layer)[4]!;
    layer.frame(0.4, 'full');
    orient(layer);
    const waving = matrixOf(flame, 0).toArray();
    layer.frame(1.1, 'full');
    orient(layer);
    expect(matrixOf(flame, 0).toArray()).not.toEqual(waving);
    layer.frame(0.4, 'reduced');
    orient(layer);
    const rest = matrixOf(flame, 0).toArray();
    layer.frame(1.1, 'off');
    orient(layer);
    expect(matrixOf(flame, 0).toArray()).toEqual(rest);
  });

  it('marks the star only on a point of mine', () => {
    const { layer } = setup();
    layer.show([stand('a', 1, { mine: true }), stand('b', 2)]);
    orient(layer);
    const star = meshes(layer)[2]!.geometry.getAttribute('aStar');
    expect([star.getX(0), star.getX(1)]).toEqual([1, 0]);
  });

  it('is idle with nothing in view and big enough, and asks for LIVE_PX', () => {
    const none = setup({ sees: false });
    none.layer.show([stand('a', 1)]);
    expect(none.layer.idle()).toBe(true);
    const some = setup();
    expect(some.layer.idle()).toBe(true);
    some.layer.show([stand('a', 1)]);
    expect(some.layer.idle()).toBe(false);
    expect(some.asked).toContain(LIVE_PX);
  });

  it('asks the ambience for a frame, never invalidate, while a mast lives', () => {
    const { layer } = setup();
    const ambience = new Ambience(new Set(['sites']));
    ambience.add(layer);
    layer.show([stand('a', 1)]);
    expect(ambience.advance(1000)).toBe(true);
    ambience.motion = 'reduced';
    expect(ambience.advance(5000)).toBe(false);
  });

  it('lights its socle by night', () => {
    const { layer } = setup();
    layer.show([stand('a', 1), stand('b', 2)]);
    orient(layer);
    const lit: Array<[Vector3, number, number]> = [];
    layer.lights((at, radius, near) => lit.push([at.clone(), radius, near]));
    expect(lit).toHaveLength(2);
    expect(lit[0]![1]).toBeGreaterThanOrEqual(MAST_UNITS.baseRadius);
    expect(lit[0]![2]).toBe(1);
  });

  it('raises the inks toward the moon at night, and not by day', () => {
    const { layer } = setup();
    layer.show([stand('a', 1, { holder: { nation: 'germany', heldMs: 0 } })]);
    orient(layer, 40, 0);
    const day = colorOf(meshes(layer)[4]!, 0).getHex();
    orient(layer, 40, 1);
    expect(colorOf(meshes(layer)[4]!, 0).getHex()).not.toBe(day);
    const ink = new Color('#202020');
    expect(nightInk(ink, 0, new Color()).getHex()).toBe(ink.getHex());
    expect(nightInk(ink, 1, new Color()).b).toBeGreaterThan(nightInk(ink, 1, new Color()).r);
  });

  it('keeps the base at least baseMinShare of the mast', () => {
    expect(baseRadiusOf(1)).toBe(MAST_UNITS.baseRadius);
    const far = 6;
    expect(baseRadiusOf(far)).toBeCloseTo(MAST_PX.baseMinShare * MAST_UNITS.height * far, 8);
  });
});

describe('the beam of the race leader (#678)', () => {
  const lit = (id: string, lon: number, ink = '#aa2222'): MastPoint => ({
    ...stand(id, lon, { holder: { nation: 'germany', heldMs: 0 } }),
    beam: ink,
  });
  const beamMesh = (layer: StrategicMasts) => meshes(layer)[5]!;
  const alphaOf = (layer: StrategicMasts, k: number) =>
    (beamMesh(layer).geometry.getAttribute('aLevel') as { getX(i: number): number }).getX(k);
  const STEP = 50;
  const settle = (layer: StrategicMasts, clock: { ms: number }, ms: number) => {
    for (let at = 0; at < ms; at += STEP) {
      clock.ms += STEP;
      orient(layer);
    }
  };

  it('rises from the head of each lit mast only, in the leader ink, hidden by day or night alike', () => {
    const { layer } = setup();
    layer.show([lit('a', 1), stand('b', 2), lit('c', 3, '#2266aa')]);
    orient(layer);
    expect(beamMesh(layer).count).toBe(2);
    const day = [colorOf(beamMesh(layer), 0), colorOf(beamMesh(layer), 1)];
    expect(day[0]!.getHexString()).toBe('aa2222');
    expect(day[1]!.getHexString()).toBe('2266aa');
    orient(layer, 40, 1);
    expect(colorOf(beamMesh(layer), 0).getHexString()).not.toBe('aa2222');
  });

  it('starts at the head of the mast, along its lean, and rises as high as its pixels ask, over a few masts at least', () => {
    const { layer } = setup();
    layer.show([lit('a', 1)]);
    const rise = (distance: number) => {
      orient(layer, distance);
      const position = beamMesh(layer).geometry.getAttribute('position');
      const ys = Array.from({ length: position.count }, (_, i) => position.getY(i));
      const at = (y: number) => new Vector3(0, y, 0).applyMatrix4(matrixOf(beamMesh(layer), 0));
      const head = new Vector3(0, MAST_UNITS.height, 0).applyMatrix4(
        matrixOf(meshes(layer)[2]!, 0),
      );
      expect(at(Math.min(...ys)).distanceTo(head)).toBeLessThan(1e-4);
      return {
        length: at(Math.max(...ys)).distanceTo(at(Math.min(...ys))),
        mast: head.distanceTo(new Vector3().setFromMatrixPosition(matrixOf(meshes(layer)[2]!, 0))),
      };
    };
    const far = rise(150);
    expect(far.length).toBeGreaterThan(3 * far.mast * 0.99);
    expect(far.length / far.mast).toBeGreaterThan(5);
    const close = rise(3);
    expect(close.length / close.mast).toBeCloseTo(3, 3);
  });

  it('is there at once on the first view, and fades out, in a short fade, when the race falls', () => {
    const { layer, clock } = setup();
    layer.frame(0, 'full');
    layer.show([lit('a', 1)]);
    orient(layer);
    const lit0 = alphaOf(layer, 0);
    expect(lit0).toBeGreaterThan(0.5);
    layer.show([stand('a', 1, { holder: { nation: 'germany', heldMs: 0 } })]);
    settle(layer, clock, 100);
    expect(beamMesh(layer).count).toBe(1);
    expect(alphaOf(layer, 0)).toBeGreaterThan(0);
    expect(alphaOf(layer, 0)).toBeLessThan(0.75 * lit0);
    settle(layer, clock, 1000);
    expect(beamMesh(layer).count).toBe(0);
  });

  it('fades in when the race starts on a point already standing', () => {
    const { layer, clock } = setup();
    layer.frame(0, 'full');
    layer.show([stand('a', 1, { holder: { nation: 'germany', heldMs: 0 } })]);
    orient(layer);
    expect(beamMesh(layer).count).toBe(0);
    layer.show([lit('a', 1)]);
    settle(layer, clock, 50);
    expect(beamMesh(layer).count).toBe(1);
    expect(alphaOf(layer, 0)).toBeLessThan(0.3);
    settle(layer, clock, 1000);
    expect(alphaOf(layer, 0)).toBeGreaterThan(0.5);
  });

  it('is gone at once in reduced and cut motion, which animate nothing', () => {
    for (const motion of ['reduced', 'off'] as const) {
      const { layer } = setup();
      layer.frame(0, motion);
      layer.show([lit('a', 1)]);
      orient(layer);
      layer.show([stand('a', 1)]);
      orient(layer);
      expect(beamMesh(layer).count).toBe(0);
    }
  });

  it('breathes at full motion, holds still at reduced, and stands a paler fixed column when cut', () => {
    const { layer } = setup();
    layer.show([lit('a', 1)]);
    const seen = (motion: 'full' | 'reduced' | 'off', time: number) => {
      layer.frame(time, motion);
      orient(layer);
      return alphaOf(layer, 0);
    };
    const a = seen('full', 0.3);
    const b = seen('full', 1.9);
    expect(a).not.toBeCloseTo(b, 3);
    const rest = seen('reduced', 0.3);
    expect(seen('reduced', 1.9)).toBe(rest);
    const cut = seen('off', 0.3);
    expect(seen('off', 1.9)).toBe(cut);
    expect(cut).toBeLessThan(rest);
    expect(cut).toBeGreaterThan(0);
    expect(Math.max(a, b)).toBeLessThanOrEqual(rest + 1e-9);
  });

  it('asks the ambience for no frame at reduced or cut motion, with a beam lit and in the field', () => {
    const { layer } = setup();
    const ambience = new Ambience(new Set(['sites']));
    ambience.add(layer);
    layer.show([lit('a', 1)]);
    for (const motion of ['reduced', 'off'] as const) {
      ambience.motion = motion;
      layer.frame(0.5, motion);
      orient(layer);
      expect(beamMesh(layer).count).toBe(1);
      expect(ambience.advance(10_000)).toBe(false);
    }
  });

  it('keeps a beam out of the draw while no mast is in the field', () => {
    const { layer } = setup({ sees: false });
    layer.show([lit('a', 1)]);
    orient(layer);
    expect(layer.object.visible).toBe(false);
    expect(layer.idle()).toBe(true);
  });
});

describe('the head of a mast, where its cartouche hangs', () => {
  it('stands over the foot by the mast as drawn, and higher by the star of a point of mine', () => {
    const { layer } = setup();
    layer.show([stand('a', 5), stand('b', 6, { mine: true })]);
    orient(layer);
    const foot = (k: number) => new Vector3().setFromMatrixPosition(matrixOf(meshes(layer)[2]!, k));
    const plain = layer.headOf('strategic-a')!.clone();
    const mine = layer.headOf('strategic-b')!;
    expect(plain.distanceTo(foot(0))).toBeGreaterThan(mastPxUnits());
    expect(mine.distanceTo(foot(1))).toBeGreaterThan(plain.distanceTo(foot(0)));
  });

  it('stands over the star as drawn, along the mast leaning toward the eye, not straight up', () => {
    const { layer } = setup();
    layer.show([stand('b', 6, { mine: true })]);
    orient(layer);
    // The star's tip: the mast's own up, at the mast's scale, as the draw rotates it.
    const matrix = matrixOf(meshes(layer)[2]!, 0);
    const scale = new Vector3().setFromMatrixScale(matrix).y;
    const tip = new Vector3(0, MAST_UNITS.height + 0.0384 + 0.1, 0).applyMatrix4(matrix);
    const head = layer.headOf('strategic-b')!;
    expect(head.distanceTo(tip)).toBeLessThan(0.01 * scale);
  });

  it('is nothing for an id that has no mast', () => {
    const { layer } = setup();
    layer.show([stand('a', 5)]);
    orient(layer);
    expect(layer.headOf('strategic-z')).toBeNull();
  });
});

describe('the mast under the pointer', () => {
  const aim = (from: Vector3, to: Vector3) => {
    const ray = new Raycaster();
    ray.set(from, to.clone().sub(from).normalize());
    return ray;
  };
  const footOf = (layer: StrategicMasts) =>
    new Vector3().setFromMatrixPosition(matrixOf(meshes(layer)[2]!, 0));

  it('answers with the id of the marker, at its foot, middle and head', () => {
    const { layer } = setup();
    layer.show([stand('a', 5)]);
    orient(layer);
    const foot = footOf(layer);
    expect(layer.under(aim(EYE, foot))?.id).toBe('strategic-a');
    const head = foot.clone().add(new Vector3(0, mastPxUnits(), 0));
    expect(layer.under(aim(EYE, head))?.id).toBe('strategic-a');
    expect(layer.under(aim(EYE, foot.clone().add(new Vector3(3, 0, 0))))).toBeNull();
  });

  it('answers nothing for a mast out of the field', () => {
    const { layer } = setup({ sees: false });
    layer.show([stand('a', 5)]);
    orient(layer);
    expect(layer.under(aim(EYE, footOf(layer)))).toBeNull();
  });

  it('takes a wider target under a finger than under a pointer', () => {
    const miss = (width: number) => {
      const away = EYE.distanceTo(new Vector3(5, 0, -40));
      return ((width * 0.9) / 2) * (away / pieceScale.pxPerUnit);
    };
    const hit = (touch: boolean) => {
      const { layer } = setup({ touch });
      layer.show([stand('a', 5)]);
      orient(layer);
      const foot = footOf(layer);
      const sideways = new Vector3(1, 0, 0);
      const spot = foot.clone().addScaledVector(sideways, miss(LEAST_TOUCH_PX));
      return layer.under(aim(EYE, spot));
    };
    expect(LEAST_TOUCH_PX).toBeGreaterThan(LEAST_TARGET_PX);
    expect(hit(false)).toBeNull();
    expect(hit(true)?.id).toBe('strategic-a');
  });
});

function mastPxUnits(): number {
  const scale = mastScale(
    mastPx(40, false, HEIGHT, FOV),
    (2 * Math.tan((FOV * Math.PI) / 360) * 40) / HEIGHT,
  );
  return MAST_UNITS.height * scale;
}

describe('the engine wiring', () => {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf-8');
  const body = (name: string) => {
    const from = source.indexOf(`  ${name}(`);
    return source.slice(from, source.indexOf('\n  }\n', from));
  };

  it('a mast is picked like a camp, by pieceUnder and by carryTargetAt', () => {
    expect(body('private pieceUnder')).toContain('this.masts.under(this.ray)');
    expect(body('private carryTargetAt')).toContain('this.masts.under(this.ray)');
  });

  it('a pile touched wins over the mast it stands by, in both; the carried pile pale home does not', () => {
    expect(body('private pieceUnder')).toMatch(/pile === null \? this\.masts\.under\(this\.ray\)/);
    expect(body('private carryTargetAt')).toMatch(
      /pick === null \|\| pick\.pileId === this\.held\?\.pileId \? this\.masts\.under\(this\.ray\)/,
    );
  });

  it('declares a swap to the loop, so that it draws every image until the flame has risen', () => {
    expect(source).toMatch(/this\.masts\.swapping \|\|/);
  });

  it('lights, orients and disposes with the other layers', () => {
    expect(source).toContain('this.masts.lights(lit)');
    expect(source).toContain('this.masts.orient(');
    expect(source).toContain('this.masts.dispose()');
    expect(source).toContain('this.ambience.add(this.masts)');
  });
});
