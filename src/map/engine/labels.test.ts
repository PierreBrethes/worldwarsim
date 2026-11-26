import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import { PROJECTION, WorldFrame } from './frame';
import { LabelLayer } from './labels';
import { pieceScale } from './piece-scale';
import { ANONYMOUS_SPAN } from './figurines/figurine';

// The geometry and the thresholds are read at the full common scale: the share pieces are drawn
// at multiplies every size alike, and has its own tests (`figurine.test.ts`).
pieceScale.size = 1;

const W = 1440;
const H = 900;
const frame = new WorldFrame(PROJECTION);
const paris: LonLat = [2.35, 48.85];

function eyeOver(at: LonLat, distance: number): PerspectiveCamera {
  const eye = new PerspectiveCamera(42, W / H, 0.5, 3000);
  const ground = frame.projectLonLat(at);
  eye.position.copy(ground).add(new Vector3(0, distance, 0.001));
  eye.lookAt(ground);
  eye.updateMatrixWorld();
  return eye;
}

/** What each label does at this distance: shown, parked at the edge, or neither. */
function shownAt(distance: number) {
  const layer = new LabelLayer(
    frame,
    () => null,
    () => 1,
    () => false,
  );
  layer.setAnchors([
    { id: 'pile', anchor: { kind: 'ground', lonLat: paris }, withRegionLayer: false, pinned: true },
    { id: 'point', anchor: { kind: 'ground', lonLat: paris }, withRegionLayer: false },
  ]);
  return Object.fromEntries(
    layer
      .project(eyeOver(paris, distance), W, H, new Map())
      .map(({ id, visible, atEdge }) => [id, { visible, atEdge }]),
  );
}

describe('the label of a piece the board pins (#234)', () => {
  it('gives way to its pin far away, without parking at the edge', () => {
    expect(shownAt(120)).toEqual({
      pile: { visible: false, atEdge: false },
      point: { visible: true, atEdge: false },
    });
  });

  it('names its figurines up close', () => {
    expect(shownAt(4).pile).toEqual({ visible: true, atEdge: false });
  });

  it('gives way as soon as its piece is too small to read: a tank under its pin from d = 7 (ADR 0035)', () => {
    expect(shownAt(20).pile).toEqual({ visible: false, atEdge: false });
  });
});

/** **Le nom d'un gisement ne paraît qu'au rapproché** (#239, maquette `bassin.html`) : de loin,
 *  le bassin est un lavis et ne dit rien ; il se nomme en fondu quand on s'approche. */
describe('the name of a deposit', () => {
  const nameAt = (distance: number) => {
    const layer = new LabelLayer(
      frame,
      () => null,
      () => 1,
      () => false,
    );
    layer.setAnchors([
      { id: 'deposit', anchor: { kind: 'ground', lonLat: paris }, withRegionLayer: true },
    ]);
    const [name] = layer.project(eyeOver(paris, distance), W, H, new Map());
    return { visible: name!.visible, atEdge: name!.atEdge, fade: name!.fade };
  };

  it('says nothing from far, where the regions are still drawn', () => {
    expect(nameAt(40)).toMatchObject({ visible: false, atEdge: false });
  });

  it('is written whole up close', () => {
    expect(nameAt(4)).toEqual({ visible: true, atEdge: false, fade: 1 });
  });

  it('fades in between', () => {
    const { fade } = nameAt(13);
    expect(fade).toBeGreaterThan(0);
    expect(fade).toBeLessThan(1);
  });
});

/** **Le cartouche d'un mât s'accroche à son sommet** (#683) : la projection part du sommet que le
 *  moteur dit, et la distance reste celle du pied. */
describe('the label of a mast', () => {
  it('lands where the head of its mast is, not on its foot', () => {
    const head = frame.projectLonLat(paris).add(new Vector3(0, 0.5, 0));
    const project = (raised: boolean) => {
      const layer = new LabelLayer(
        frame,
        () => null,
        () => 1,
        () => false,
        () => null,
        () => ANONYMOUS_SPAN,
        (id) => (raised && id === 'mast' ? head : null),
      );
      layer.setAnchors([
        { id: 'mast', anchor: { kind: 'ground', lonLat: paris }, withRegionLayer: false },
      ]);
      const [at] = layer.project(eyeOver(paris, 20), W, H, new Map());
      return { y: at!.y, distance: at!.distance };
    };
    const foot = project(false);
    const lifted = project(true);
    expect(lifted.y).toBeLessThan(foot.y);
    expect(lifted.distance).toBeCloseTo(foot.distance);
  });
});
