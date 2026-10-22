import { beforeAll, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import type { Pin } from '@/domain/pins';
import { PROJECTION, WorldFrame } from './frame';
import { MapEngine } from './index';
import { PinLayer } from './pins';

/**
 * **The player's path through a pin** (#234): the engine's own press, carry, drop and approach,
 * run on a real pin layer — the canvas and the figurines are stood in for, the routing is not.
 */
beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ width: 10 }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }), elementFromPoint: () => null },
  });
});

const W = 1440;
const H = 900;
const frame = new WorldFrame(PROJECTION);
const paris: LonLat = [2.35, 48.85];
const lyon: LonLat = [4.85, 45.76];
const besideLyon: LonLat = [5.0, 45.8];

const mine = (id: string, lonLat: LonLat): Pin => ({
  id,
  anchor: { kind: 'ground', lonLat },
  shape: 'pile',
  side: 'mine',
  ink: '#2a5ba8',
});

type Hook = (...args: never[]) => unknown;

/** An engine reduced to what a press on the canvas reads, its eye far above France. */
function engineOver(pins: ReadonlyArray<Pin>, figurine: string | null = null) {
  const eye = new PerspectiveCamera(42, W / H, 0.5, 3000);
  const ground = frame.projectLonLat(paris);
  eye.position.copy(ground).add(new Vector3(0, 120, 0.001));
  eye.lookAt(ground);
  eye.updateMatrixWorld();
  const layer = new PinLayer(frame, () => null);
  layer.display(pins);
  layer.layout(eye, W, H, new Map(), new Map());
  const hit = figurine === null ? null : { id: figurine, distance: 1 };
  const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
    pins: layer,
    screenWidth: W,
    screenHeight: H,
    aim: new Vector2(),
    ray: new Raycaster(),
    held: null,
    placing: null,
    spaceHeld: false,
    renderer: {
      domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) },
    },
    syncEye: () => eye,
    standing: {
      under: () => hit,
      pick: () => null,
      pileOfLabel: (id: string) => (pins.some((pin) => pin.id === id) ? id : null),
    },
    camps: { under: () => null },
    arcs: { pawnUnder: () => null },
    maquettes: { under: () => null },
  }) as unknown as MapEngine;
  const at = (lonLat: LonLat): [number, number] => {
    const v = frame.projectLonLat(lonLat).project(eye);
    return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H];
  };
  const call = <F extends Hook>(name: string) =>
    (engine as unknown as Record<string, F>)[name]!.bind(engine) as F;
  return { engine, at, call };
}

describe('a pin on the player’s path', () => {
  it('takes the press before the figurine it stands over', () => {
    const { engine, at, call } = engineOver([mine('pile-paris', paris)], 'figurine');
    const onPiecePress = vi.fn(() => true);
    engine.onPiecePress = onPiecePress;
    const [clientX, clientY] = at(paris);
    call<(event: object, press: object) => boolean>('pressPiece')(
      { clientX, clientY, pointerType: 'mouse' },
      { picks: true },
    );
    expect(onPiecePress).toHaveBeenCalledWith(expect.objectContaining({ labelId: 'pile-paris' }));
  });

  it('carries the pile of mine it stands for', () => {
    const { at, call } = engineOver([mine('pile-paris', paris)]);
    expect(call<(x: number, y: number) => unknown>('carryFrom')(...at(paris))).toEqual({
      kind: 'label',
      labelId: 'pile-paris',
    });
  });

  it('is what a carried piece is dropped on', () => {
    const { at, call } = engineOver([mine('pile-paris', paris)]);
    expect(call<(x: number, y: number) => unknown>('carryTargetAt')(...at(paris))).toEqual({
      kind: 'label',
      labelId: 'pile-paris',
    });
  });

  it('brings the camera down onto a cluster, unless a piece is in hand', () => {
    const { engine, at, call } = engineOver([mine('a', lyon), mine('b', besideLyon)]);
    const journeyTo = vi.fn();
    Object.assign(engine, { journeyTo });
    const approach = call<(x: number, y: number) => boolean>('approachClusterAt');
    expect(approach(...at(lyon))).toBe(true);
    expect(journeyTo).toHaveBeenCalledWith(['a', 'b'], [], 0, expect.any(Number));
    Object.assign(engine, { held: { pileId: 'a', troopIds: [] } });
    expect(approach(...at(lyon))).toBe(false);
  });
});
