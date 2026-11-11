import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3, type MeshBasicMaterial } from 'three';
import { annotationFigurine, eraseAnnotation, inkAnnotation } from './annotations';
import { Pawn } from './pawn';
import { troopScale } from './figurines/figurine';

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
    Path2D: class {
      moveTo() {}
      lineTo() {}
      closePath() {}
    },
  });
});

const inkOf = (object: ReturnType<typeof inkAnnotation>['object']) => {
  let opacity = NaN;
  object.traverse((part) => {
    if (part instanceof Mesh) opacity = (part.material as MeshBasicMaterial).opacity;
  });
  return opacity;
};

describe('inkAnnotation (F2)', () => {
  it('lies flat on the board, where a block stood', () => {
    const { object } = inkAnnotation('land', 0, null);
    const box = new Box3().setFromObject(object);
    expect(box.max.y - box.min.y).toBeLessThan(1e-3);
    expect(box.max.x - box.min.x).toBeGreaterThan(0);
  });

  it('pales with the age of the survey', () => {
    expect(inkOf(inkAnnotation('sea', 0, null).object)).toBe(1);
    expect(inkOf(inkAnnotation('sea', 0, 12 * 60).object)).toBeLessThan(1);
  });
});

const materialOf = (object: ReturnType<typeof inkAnnotation>['object']) => {
  let material: MeshBasicMaterial | null = null;
  object.traverse((part) => {
    if (part instanceof Mesh) material = part.material as MeshBasicMaterial;
  });
  return material!;
};
const freed = (material: MeshBasicMaterial) => {
  const seen = { material: false, map: false };
  material.addEventListener('dispose', () => (seen.material = true));
  material.map?.addEventListener('dispose', () => (seen.map = true));
  return seen;
};

describe('the ink an annotation is drawn with', () => {
  it('is shared by the same medium, hour and age, and freed with its last annotation', () => {
    const first = inkAnnotation('land', 7 * 3_600_000, 60);
    const second = inkAnnotation('land', 7 * 3_600_000, 60);
    const material = materialOf(first.object);
    expect(materialOf(second.object)).toBe(material);
    const seen = freed(material);
    eraseAnnotation(first.object);
    expect(seen).toEqual({ material: false, map: false });
    eraseAnnotation(second.object);
    expect(seen).toEqual({ material: true, map: true });
  });

  it('is freed with the pawn of the enemy thread that wore it', () => {
    const figurine = annotationFigurine('sea', 5 * 3_600_000);
    const seen = freed(materialOf(figurine.object as ReturnType<typeof inkAnnotation>['object']));
    const pawn = new Pawn('#000', { land: null, sea: figurine, air: null });
    pawn.dispose();
    expect(seen).toEqual({ material: true, map: true });
  });
});

/** The floor is read on the man for real figurines only: a land block that grew by his factor would tell a tank (#534). */
describe('the floor of an enemy annotation on land', () => {
  it('stays at its own, like its sea and air sisters', () => {
    const note = annotationFigurine('land', 0);
    const pawn = new Pawn('#000', { land: note, sea: null, air: null });
    pawn.place(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
    pawn.orient(new Vector3(0, 5, 0), 0);
    expect(note.object.scale.x).toBeCloseTo(troopScale(5, note.span, note.span), 12);
  });
});
