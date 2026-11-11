import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { buildingSpan, troopSpan } from '@/domain/piece-size';
import { pilePieces } from '@/domain/pile-pieces';
import type { WorldFrame } from './frame';
import { garrisonFoot } from './maquettes';
import { Pawn } from './pawn';
import { pieceScale } from './piece-scale';
import { pileObject, StandingLayer } from './standing';
import { FLOOR_PX, GARRISON_FLOOR_PX, type Figurine } from './figurines/figurine';

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

// Read at the full common scale; the share pieces are drawn at has its tests in `figurine.test.ts`.
pieceScale.size = 1;

/** CSS pixels per board unit seen from one unit away, on the reference window 900 px tall. */
const REFERENCE = 900 / (2 * Math.tan((21 * Math.PI) / 180));
const DISTANCES = [4, 5, 6, 8, 10, 15, 20, 25, 30, 43];
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
      rank: false,
      width: Infinity,
      deep: [0, 0] as const,
      scale: 1,
      toBoard: (point: Vector3) => point.clone(),
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

/** **The figurine floor** (ADR 0035 §10), read at the full common scale: a troop in the field never
 *  reads under 16 px until d ≈ 43, one in a garrison under 8 px — and no more than that once its
 *  own size is under it, so that a garrison stays near its site's proportion. */
describe('the figurine floor', () => {
  afterEach(() => {
    pieceScale.size = 1;
    pieceScale.pxPerUnit = 1172;
  });

  const lengthOn = (pile: Group, eye: Vector3) => {
    const box = drawnBox(pile);
    return ((box.max.z - box.min.z) * REFERENCE) / pile.position.distanceTo(eye);
  };

  for (const height of [650, 900])
    it(`stands a garrison's tanks at 8 px or more from d = 4 to 43, on a window ${height} px tall`, async () => {
      pieceScale.pxPerUnit = height / (2 * Math.tan((21 * Math.PI) / 180));
      const { layer, object } = await garrison();
      for (const d of DISTANCES) {
        const eye = new Vector3(0, d, 1);
        layer.orient(eye);
        const pile = object();
        expect(pile.visible).toBe(true);
        expect(lengthOn(pile, eye)).toBeGreaterThanOrEqual(GARRISON_FLOOR_PX - 0.01);
        // Grown, it still stands clear of its barracks turned any way (half its diagonal).
        expect(drawnBox(pile).min.z).toBeGreaterThan(BARRACKS / Math.SQRT2);
      }
    });

  it("holds a garrison at its own floor, not the field's: 8 px where a pile of tanks in the field reads the man's 16, times the tank's share", async () => {
    const { layer, object } = await garrison();
    for (const d of [20, 25, 30, 43]) {
      const eye = new Vector3(0, d, 1);
      layer.orient(eye);
      expect(lengthOn(object(), eye)).toBeCloseTo(GARRISON_FLOOR_PX, 1);
    }
    const field = new StandingLayer(
      { projectLonLat: () => new Vector3(0, 0, 0) } as unknown as WorldFrame,
      () => {},
      () => null,
    );
    field.setNation('france');
    field.display([
      { id: 'stack-field', at: { lonLat: [0, 0] }, pieces: pilePieces([troop(1), troop(2)]) },
    ]);
    await vi.waitFor(() => expect(field.group.children.length).toBeGreaterThan(0));
    const pile = field.group.children.find((child) => child instanceof Group)!;
    for (const d of [20, 25, 30, 43]) {
      const eye = new Vector3(0, d, 1);
      field.orient(eye);
      // A tank grows by the man's factor: the squad's 16 px make it that many times larger (#534).
      expect(lengthOn(pile, eye)).toBeCloseTo(
        (FLOOR_PX * troopSpan('armor', 'france', 1)) / troopSpan('infantry'),
        1,
      );
    }
  });

  it('keeps a tank as large as it is against the squad it marches with, in the field', async () => {
    const field = new StandingLayer(
      { projectLonLat: () => new Vector3(0, 0, 0) } as unknown as WorldFrame,
      () => {},
      () => null,
    );
    field.setNation('france');
    const squad = { ...troop(3), id: 'inf-3', role: 'infantry' as const };
    field.display([
      { id: 'inf', at: { lonLat: [0, 0] }, pieces: pilePieces([squad]) },
      { id: 'mix', at: { lonLat: [0, 0] }, pieces: pilePieces([squad, troop(1)]) },
    ]);
    await vi.waitFor(() => expect(field.group.children.length).toBeGreaterThan(1));
    const eye = new Vector3(0, 25, 1);
    field.orient(eye);
    const [alone, mixed] = field.group.children.filter((child) => child instanceof Group);
    const spans = (...roles: Array<'infantry' | 'armor'>) =>
      pileObject('france', pilePieces(roles.map((role) => ({ ...troop(1), id: role, role }))))!
        .span;
    // The mixed pile is drawn at its tank's span over the man's: the ratio of the two spans.
    expect(mixed!.scale.x / alone!.scale.x).toBeCloseTo(
      spans('infantry', 'armor') / spans('infantry'),
      6,
    );
  });

  it('gives way to its pin past d ≈ 43, and later when the player grows the pieces', async () => {
    const { layer, object } = await garrison();
    layer.orient(new Vector3(0, 55, 1));
    expect(object().visible).toBe(false);
    pieceScale.size = 1.25;
    layer.orient(new Vector3(0, 52, 1));
    expect(object().visible).toBe(true);
    layer.orient(new Vector3(0, 70, 1));
    expect(object().visible).toBe(false);
  });

  it('melts into its pin without a jump: smaller on screen with every step back past d = 42', async () => {
    const { layer, object } = await garrison();
    const sizes: number[] = [];
    for (let d = 42; d <= 55; d += 0.5) {
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
    // Its pin span reads 20 px at d = 43: the label and the pin give way with the piece.
    expect((layer.spanOf('stack-paris')! * REFERENCE) / 43).toBeCloseTo(19.5, 1);
  });

  /** A man of his span, standing on a pawn's point. */
  const manPawn = () => {
    const span = troopSpan('infantry');
    const model = new Mesh(new BoxGeometry(span / 4, span, span / 4));
    model.position.y = span / 2;
    const object = new Group();
    object.add(model);
    const man: Figurine = { object, span, ready: Promise.resolve(), spin() {} };
    const pawn = new Pawn('#000', { land: man, sea: null, air: null });
    pawn.place(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
    return { pawn, object, span };
  };

  it('draws the man at his own size where he reads over the floor, d = 2: no floor there', () => {
    const { pawn, object, span } = manPawn();
    pawn.orient(new Vector3(0, 2, 0), 0);
    expect(new Box3().setFromObject(object).getSize(new Vector3()).y).toBeCloseTo(span, 9);
  });

  it("stands a moving man at 16 px or more until d = 43, and his pin's beyond", () => {
    const { pawn, object } = manPawn();
    for (const d of DISTANCES) {
      pawn.orient(new Vector3(0, d, 0), 0);
      expect(object.visible).toBe(true);
      const height = new Box3().setFromObject(object).getSize(new Vector3()).y;
      expect((height * REFERENCE) / d).toBeGreaterThanOrEqual(FLOOR_PX - 0.01);
    }
    pawn.orient(new Vector3(0, 55, 0), 0);
    expect(object.visible).toBe(false);
  });
});

describe('two piles at the foot of one site (#341)', () => {
  it('stand abreast, not on one another', async () => {
    const { layer } = await garrison();
    layer.display([
      { id: 'a', at: { beside: 'site' }, pieces: pilePieces([troop(1), troop(2)]) },
      { id: 'b', at: { beside: 'site' }, pieces: pilePieces([troop(3), troop(4)]) },
    ]);
    await vi.waitFor(() =>
      expect(layer.group.children.filter((c) => c instanceof Group).length).toBe(2),
    );
    const eye = new Vector3(0, 6, 1);
    layer.orient(eye);
    layer.orient(eye);
    const [a, b] = layer.group.children.filter((child) => child instanceof Group);
    expect(a!.position.distanceTo(b!.position)).toBeGreaterThan(0.1);
  });
});

describe('a garrison ranked on the yard of a socle (ADR 0038 §5)', () => {
  const rankOf = (width: number) => () => ({
    at: new Vector3(0, 0.5, 0),
    step: [1, 2] as const,
    facing: 0,
    rank: true,
    width,
    deep: [0, 1] as const,
    scale: 1,
    toBoard: (point: Vector3) => point.clone(),
  });
  const stood = async (width: number, ids: string[]) => {
    const ranked = new StandingLayer({} as WorldFrame, () => {}, rankOf(width));
    ranked.setNation('france');
    ranked.display(
      ids.map((id, k) => ({
        id,
        at: { beside: 'site' },
        pieces: pilePieces([troop(2 * k + 1), troop(2 * k + 2)]),
      })),
    );
    await vi.waitFor(() =>
      expect(ranked.group.children.filter((c) => c instanceof Group).length).toBe(ids.length),
    );
    const eye = new Vector3(1, 6, 3);
    ranked.orient(eye);
    ranked.orient(eye);
    return ranked.group.children.filter((child) => child instanceof Group);
  };

  it('stands piles abreast along the rank, centred on fx_rang, on the socle top', async () => {
    const [a, b] = await stood(30, ['a', 'b']);
    // Facing +z the rank runs along +x, about the marker at (1, 2): one pile each side of it.
    expect(a!.position.y).toBe(0.5);
    expect(a!.position.z).toBeCloseTo(b!.position.z);
    expect(a!.position.z).toBeGreaterThan(2);
    expect(b!.position.x).toBeGreaterThan(a!.position.x);
    expect((a!.position.x + b!.position.x) / 2).toBeCloseTo(1, 6);
  });

  it('opens the next row, deeper, when the rank is full, instead of leaving its rectangle', async () => {
    const [a, b, c] = await stood(0.0001, ['a', 'b', 'c']);
    expect(a!.position.x).toBeCloseTo(1, 6);
    expect(b!.position.x).toBeCloseTo(1, 6);
    expect(c!.position.x).toBeCloseTo(1, 6);
    expect(b!.position.z).toBeGreaterThan(a!.position.z);
    expect(c!.position.z).toBeGreaterThan(b!.position.z);
  });
});

describe('a garrison handed back to the ground, attached to a site (#341)', () => {
  type Inner = { dressed: Map<string, { object: Group }> };
  const frame = {
    projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, lat),
  } as unknown as WorldFrame;
  const objectOf = (layer: StandingLayer, id: string) =>
    (layer as unknown as Inner).dressed.get(id)!.object;
  const standing = async (garrisonAt: ConstructorParameters<typeof StandingLayer>[2]) => {
    const layer = new StandingLayer(frame, () => {}, garrisonAt);
    layer.setNation('france');
    return layer;
  };
  const foot = () => ({
    at: new Vector3(0, 0, 0),
    step: [0, 2] as const,
    facing: 0,
    rank: false,
    width: Infinity,
    deep: [0, 0] as const,
    scale: 1,
    toBoard: (point: Vector3) => point.clone(),
  });

  it('leaves the garrison the server attached where it stands, whatever the order served', async () => {
    const layer = await standing(foot);
    layer.display([
      {
        id: 'razed',
        at: { beside: 'site', from: [3, 4] },
        pieces: pilePieces([troop(1), troop(2)]),
      },
      { id: 'own', at: { beside: 'site' }, pieces: pilePieces([troop(3), troop(4)]) },
    ]);
    await vi.waitFor(() => expect((layer as unknown as Inner).dressed.size).toBe(2));
    await vi.waitFor(() => expect(layer.group.children.length).toBe(2));
    layer.orient(new Vector3(0, 6, 1));
    layer.orient(new Vector3(0, 6, 1));
    expect(objectOf(layer, 'own').position.x).toBe(0);
    expect(objectOf(layer, 'razed').position.x).not.toBe(0);
  });

  it('falls back to its own point while its site has no ground to stand beside', async () => {
    const layer = await standing(() => null);
    layer.display([
      { id: 'razed', at: { beside: 'site', from: [3, 4] }, pieces: pilePieces([troop(1)]) },
      { id: 'own', at: { beside: 'site' }, pieces: pilePieces([troop(2)]) },
    ]);
    await vi.waitFor(() => expect(layer.group.children.length).toBe(2));
    layer.orient(new Vector3(0, 6, 1));
    expect(objectOf(layer, 'razed').visible).toBe(true);
    expect(objectOf(layer, 'razed').position.x).toBe(3);
    expect(objectOf(layer, 'own').visible).toBe(false);
  });
});
