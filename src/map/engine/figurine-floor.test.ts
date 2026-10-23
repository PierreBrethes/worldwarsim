import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { buildingSpan, troopSpan } from '@/domain/piece-size';
import { pilePieces } from '@/domain/pile-pieces';
import type { WorldFrame } from './frame';
import { garrisonFoot } from './maquettes';
import { Pawn } from './pawn';
import { pieceScale } from './piece-scale';
import { StandingLayer } from './standing';
import type { Figurine } from './figurines/figurine';

// Every sculpted file lands as a tank-shaped box, 2.6 long: the pile stands as in the game.
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync() {
      const scene = new Group();
      scene.add(new Mesh(new BoxGeometry(1.2, 1, 2.6), new MeshStandardMaterial()));
      return Promise.resolve({ scene });
    }
  },
}));

/** CSS pixels per board unit seen from one unit away, on the reference window 900 px tall. */
const REFERENCE = 900 / (2 * Math.tan((21 * Math.PI) / 180));
const DISTANCES = [4, 5, 6, 8, 10, 15, 20, 25, 30];
const BARRACKS = buildingSpan('barracks');

const troop = (k: number) => ({
  id: `armor-${k}`,
  role: 'armor' as const,
  tier: 1 as const,
  strength: 100,
  nominalStrength: 100,
});

/** A garrison of two tanks at the foot of a barracks at the origin, its front towards +z. */
async function garrison(): Promise<{ layer: StandingLayer; object: () => Group }> {
  const layer = new StandingLayer(
    {} as WorldFrame,
    () => {},
    (_, pile) => ({
      at: new Vector3(0, 0, 0),
      step: [0, garrisonFoot(BARRACKS, pile) * pieceScale.size],
      facing: 0,
    }),
  );
  layer.setNation('france');
  layer.display([
    {
      id: 'stack-paris',
      at: { beside: 'building-barracks@paris' },
      pieces: pilePieces([troop(1), troop(2)]),
    },
  ]);
  await vi.waitFor(() => expect(layer.group.children.length).toBeGreaterThan(0));
  return { layer, object: () => layer.group.children.find((child) => child instanceof Group)! };
}

/** What is drawn of an object: its click targets are unseen footprints that grow on their own. */
function drawnBox(object: Group): Box3 {
  const box = new Box3();
  object.updateMatrixWorld(true);
  object.traverseVisible((node) => {
    if (node instanceof Mesh) box.expandByObject(node);
  });
  return box;
}

/** **The figurine floor** (ADR 0035 §10): a troop never reads under ~20 px until d ≈ 30. */
describe('the figurine floor', () => {
  afterEach(() => {
    pieceScale.size = 1;
    pieceScale.pxPerUnit = 1172;
  });

  for (const height of [650, 900])
    it(`stands a garrison's tanks at 20 px or more from d = 4 to 30, on a window ${height} px tall`, async () => {
      pieceScale.pxPerUnit = height / (2 * Math.tan((21 * Math.PI) / 180));
      const { layer, object } = await garrison();
      for (const d of DISTANCES) {
        const eye = new Vector3(0, d, 1);
        layer.orient(eye);
        const pile = object();
        expect(pile.visible).toBe(true);
        const box = drawnBox(pile);
        const length = box.max.z - box.min.z;
        const px = (length * REFERENCE) / pile.position.distanceTo(eye);
        expect(px).toBeGreaterThanOrEqual(19.5);
        // Grown, it still stands clear of its barracks turned any way (half its diagonal).
        expect(box.min.z).toBeGreaterThan(BARRACKS / Math.SQRT2);
      }
    });

  it('gives way to its pin past d ≈ 30, and later when the player grows the pieces', async () => {
    const { layer, object } = await garrison();
    layer.orient(new Vector3(0, 40, 1));
    expect(object().visible).toBe(false);
    pieceScale.size = 1.25;
    layer.orient(new Vector3(0, 36, 1));
    expect(object().visible).toBe(true);
    layer.orient(new Vector3(0, 50, 1));
    expect(object().visible).toBe(false);
  });

  it('melts into its pin without a jump: smaller on screen with every step back past d = 29', async () => {
    const { layer, object } = await garrison();
    const sizes: number[] = [];
    for (let d = 29; d <= 40; d += 0.5) {
      const eye = new Vector3(0, d, 1);
      layer.orient(eye);
      sizes.push(object().visible ? object().scale.x / object().position.distanceTo(eye) : 0);
    }
    expect(sizes.at(-1)).toBe(0);
    for (let k = 1; k < sizes.length; k++) {
      expect(sizes[k]).toBeLessThanOrEqual(sizes[k - 1]! * 1.0001);
      expect(sizes[k - 1]! - sizes[k]!).toBeLessThan(0.2 * sizes[0]!);
    }
  });

  it('pins a pile by its floor, as its label and its pin read it', async () => {
    const { layer } = await garrison();
    // Its pin span reads 20 px at d = 30: the label and the pin give way with the piece.
    expect((layer.spanOf('stack-paris')! * REFERENCE) / 30).toBeCloseTo(19.5, 1);
  });

  it("stands a moving man at 20 px or more until d = 30, and his pin's beyond", () => {
    const span = troopSpan('infantry');
    const model = new Mesh(new BoxGeometry(span / 4, span, span / 4));
    model.position.y = span / 2;
    const object = new Group();
    object.add(model);
    const man: Figurine = { object, span, ready: Promise.resolve(), spin() {} };
    const pawn = new Pawn('#000', { land: man, sea: null, air: null });
    pawn.place(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
    for (const d of DISTANCES) {
      pawn.orient(new Vector3(0, d, 0), 0);
      expect(object.visible).toBe(true);
      const height = new Box3().setFromObject(object).getSize(new Vector3()).y;
      expect((height * REFERENCE) / d).toBeGreaterThanOrEqual(19.5);
    }
    pawn.orient(new Vector3(0, 40, 0), 0);
    expect(object.visible).toBe(false);
  });
});
