import { beforeAll, describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import type { Pin } from '@/domain/pins';
import { PROJECTION, WorldFrame } from './frame';
import { PinLayer } from './pins';

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
    const eye = eyeOver(paris, 60);
    const layer = laidOut([mine('a', paris), mine('b', [3.5, 48.85])], eye);
    expect(layer.under(...screenOf(eye, paris))).toEqual({ kind: 'pin', id: 'a' });
  });

  it('gives way to the figurines up close: no pin under the pointer', () => {
    const eye = eyeOver(paris, 20);
    const layer = laidOut([mine('a', paris)], eye);
    expect(layer.under(...screenOf(eye, paris))).toBeNull();
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
});
