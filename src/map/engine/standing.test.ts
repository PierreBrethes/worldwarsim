import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { pilePieces, unitPieces } from '@/domain/pile-pieces';
import type { WorldFrame } from './frame';
import {
  drawnKey,
  dressedGroups,
  formationOf,
  nearestGroup,
  pileLayout,
  pileObject,
  pickedIn,
  StandingLayer,
  takenCopies,
  targetGrowth,
} from './standing';
import { troopSpan } from '@/domain/piece-size';
import { pieceScale } from './piece-scale';
import { TANK_SHARE } from './figurines/figurine';

// The loader wants a DOM: every file is a box of a metre.
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync() {
      return Promise.resolve({
        scene: new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())),
      });
    }
  },
}));

const troop = (role: UnitRole, strength = 100) => ({
  id: role,
  role,
  tier: 1 as const,
  strength,
  nominalStrength: 100,
});

describe('pileLayout', () => {
  it('centres the pieces side by side', () => {
    expect(pileLayout(1)).toEqual([0]);
    expect(pileLayout(2)).toEqual([-0.25, 0.25]);
    expect(pileLayout(4)).toEqual([-0.75, -0.25, 0.25, 0.75]);
  });
});

/** One scale for every piece (ADR 0035): a pile is laid out for its largest piece. */
describe('a pile at the common scale', () => {
  it('measures by its largest piece', () => {
    const span = (roles: UnitRole[]) => {
      const pile = pileObject('france', pilePieces(roles.map((role) => troop(role))))!;
      pile.ready.catch(() => {});
      return pile.span;
    };
    // The tanks lead with an R35 (`troop` is of the first tier): 4 m, still longer than a man.
    expect(span(['infantry', 'armor'])).toBe(troopSpan('armor', 'france', 1));
    expect(span(['armor', 'cargo'])).toBe(troopSpan('cargo'));
  });

  it('keeps a small piece as easy to take as before: its target grows on screen, never shrinks', () => {
    pieceScale.pxPerUnit = 1172;
    // A tank pile at d = 6: some 20 px of tank, a target grown to the floor.
    const near = targetGrowth(TANK_SHARE, 6);
    expect(near).toBeGreaterThan(1);
    // A footprint is 0.45 of the pile's units wide: grown, 28 px.
    expect(0.45 * TANK_SHARE * near * (1172 / 6)).toBeCloseTo(28, 6);
    expect(targetGrowth(1, 4)).toBe(1);
  });
});

describe('formationOf', () => {
  const gap = (a: { x: number; z: number }, b: { x: number; z: number }) =>
    Math.hypot(a.x - b.x, a.z - b.z);

  it('stands up to four abreast, more in ranks', () => {
    expect(formationOf(['land', 'land'], null).map(({ x, z }) => [x, z])).toEqual([
      [-0.31, 0],
      [0.31, 0],
    ]);
    const four = formationOf(Array<'land'>(4).fill('land'), null);
    expect(four.every(({ z }) => z === 0)).toBe(true);
    const five = formationOf(Array<'land'>(5).fill('land'), null);
    expect(new Set(five.map(({ z }) => z)).size).toBe(2);
  });

  it('ranks many units in a tight formation around the point, none in another', () => {
    const groups = formationOf(Array<'land'>(9).fill('land'), null);
    for (let i = 0; i < groups.length; i++) {
      expect(Math.hypot(groups[i]!.x, groups[i]!.z)).toBeLessThan(1.2);
      for (let j = i + 1; j < groups.length; j++)
        expect(gap(groups[i]!, groups[j]!)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
  });

  it('stands hulls on the sea side and land troops on the land side of a shore', () => {
    const groups = formationOf(['land', 'sea', 'land', 'sea'], [1, 0]);
    expect(groups[0]!.x).toBeLessThan(0);
    expect(groups[2]!.x).toBeLessThan(0);
    expect(groups[1]!.x).toBeGreaterThan(0);
    expect(groups[3]!.x).toBeGreaterThan(0);
    for (const land of [groups[0]!, groups[2]!])
      for (const sea of [groups[1]!, groups[3]!]) expect(gap(land, sea)).toBeGreaterThan(0.5);
  });

  it('keeps land troops on a shore off the water', () => {
    for (const { z } of formationOf(['land', 'land'], [0, 1])) expect(z).toBeLessThan(0);
  });
});

describe('dressedGroups', () => {
  it('dresses a pile whose every piece has a figurine, one figurine per troop', () => {
    expect(
      dressedGroups('france', pilePieces([troop('infantry'), troop('infantry')])),
    ).toHaveLength(2);
  });

  it('leaves the whole pile to its plate when one group has none', () => {
    expect(dressedGroups('atlantis', pilePieces([troop('infantry')]))).toBeNull();
    expect(dressedGroups('france', { groups: [], troopIds: [], squad: false })).toBeNull();
  });
});

describe('drawnKey', () => {
  it('redraws a pile whose vehicles cross a wear line, and only then', () => {
    const at = (strength: number) => drawnKey('germany', pilePieces([troop('armor', strength)]));
    expect(at(90)).toBe(at(80));
    expect(at(50)).not.toBe(at(80));
    expect(at(20)).not.toBe(at(50));
  });
});

describe('picking a pile', () => {
  const pieces = pilePieces([
    { ...troop('armor'), id: 'a1' },
    { ...troop('armor'), id: 'a2' },
    { ...troop('infantry'), id: 'i1' },
  ]);
  const pile = pileObject('germany', pieces)!;
  // No model file loads under node: the footprints stand without them.
  pile.ready.catch(() => {});
  pile.object.updateMatrixWorld(true);
  const from = (x: number, z: number) => new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0));
  const slots = formationOf(['land', 'land', 'land'], null);

  it('takes the piece under the pointer, by its footprint and not its triangles', () => {
    slots.forEach(({ x, z }, k) =>
      expect(pickedIn(from(x + 0.05, z + 0.1), pile.targets, pieces)).toEqual([
        ['a1', 'a2', 'i1'][k],
      ]),
    );
  });

  it('takes nothing beside the pile', () => {
    expect(pickedIn(from(3, 0), pile.targets, pieces)).toBeNull();
  });
});

/** **Ce qui est à bord ne se voit pas** (15/10) : le transport se dessine seul, son étiquette
 *  dit qui il porte (`cargoTagsOf`). */
describe('a transport carrying passengers', () => {
  const pieces = pilePieces([
    { ...troop('landTransport'), id: 'l1' },
    { ...troop('infantry'), id: 'i1', carriedBy: 'l1' },
    { ...troop('infantry'), id: 'i2', carriedBy: 'l1' },
  ]);

  it('draws the truck alone, its riders with it', () => {
    expect(pieces.groups.map((group) => [group.role, group.troopIds])).toEqual([
      ['landTransport', ['l1', 'i1', 'i2']],
    ]);
    const pile = pileObject('germany', pieces)!;
    pile.ready.catch(() => {});
    expect(pile.targets).toHaveLength(1);
  });
});

describe('pressing between the units of a Blitz pile', () => {
  const pieces = unitPieces([
    { ...troop('infantry'), id: 'u1' },
    { ...troop('infantry'), id: 'u2' },
    { ...troop('infantry'), id: 'u3' },
  ]);
  const pile = pileObject('germany', pieces)!;
  pile.ready.catch(() => {});
  pile.object.updateMatrixWorld(true);
  const slots = formationOf(['land', 'land', 'land'], null);

  it('gives the unit nearest the pointer, never the whole pile', () => {
    slots.forEach(({ x, z }, k) => {
      const beside = new Vector3(x + 0.1, 0, z + 0.3);
      expect(nearestGroup(beside, pile.targets, pieces)).toEqual([`u${k + 1}`]);
    });
  });
});

describe('the piece in hand answering a click', () => {
  type Copy = { readonly down: { readonly since: number } | null };
  const following: Copy = { down: null };
  const setDown: Copy = { down: { since: 0 } };
  const homeward: Copy = { down: null };

  it('lets the click through the copy that follows the pointer, which stands under it', () => {
    expect(takenCopies(following, null)).toEqual([]);
  });

  it('takes the copy set down under a rose, and the one on its way home', () => {
    expect(takenCopies(setDown, homeward)).toEqual([setDown, homeward]);
    expect(takenCopies(null, homeward)).toEqual([homeward]);
  });
});

/** **Une pile prête ses figurines aux séquences** (ADR 0036, deuxième hôte). */
describe('a pile lent to a sequence', () => {
  const frame = { projectLonLat: () => new Vector3(0, 0, 0) } as unknown as WorldFrame;
  const eye = new Vector3(0, 3, 3);
  const pileOf = (...roles: UnitRole[]) => ({
    id: 'p',
    at: { lonLat: [2, 48] as const },
    pieces: pilePieces(roles.map((role) => troop(role))),
  });
  const standing = async (...roles: UnitRole[]) => {
    const layer = new StandingLayer(
      frame,
      () => {},
      () => null,
    );
    layer.setNation('france');
    layer.display([pileOf(...roles)]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    layer.orient(eye);
    return layer;
  };
  const meshes = (layer: StandingLayer) => {
    const found: Mesh[] = [];
    layer.group.traverse((node) => (node as Mesh).isMesh && found.push(node as Mesh));
    return found.filter((mesh) => mesh.geometry.type === 'BoxGeometry' && mesh.visible);
  };
  // The group order is the pile's: the truck is the only group of this one.
  const TRUCK = 'p/0';

  it('lends a group that stands, with its file and its box', async () => {
    const layer = await standing('landTransport');
    const piece = layer.pieceOf(TRUCK);
    expect(piece?.url).toMatch(/landTransport/);
    expect(piece?.box?.isEmpty()).toBe(false);
    expect(layer.pieceOf('p/9')).toBeNull();
    expect(layer.pieceOf('q/0')).toBeNull();
  });

  it('measures a pile where it stands the moment a fresh copy is in, not at the origin', async () => {
    const layer = new StandingLayer(
      { projectLonLat: () => new Vector3(50, 0, 50) } as unknown as WorldFrame,
      () => {},
      () => null,
    );
    layer.setNation('france');
    layer.display([pileOf('landTransport')]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    layer.orient(new Vector3(50, 3, 53));
    layer.group.updateMatrixWorld(true);
    layer.standIn(
      TRUCK,
      new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())),
    );
    expect(layer.pieceOf(TRUCK)!.box!.min.x).toBeGreaterThan(40);
  });

  it('lends a group still loading, unmeasured, and stands the copy in when it lands', async () => {
    const layer = new StandingLayer(
      frame,
      () => {},
      () => null,
    );
    layer.setNation('france');
    layer.display([pileOf('landTransport')]);
    expect(layer.pieceOf(TRUCK)).toMatchObject({ box: null });
    const copy = new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
    layer.standIn(TRUCK, copy);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Landed, but not yet placed at the board's scale: still not measured.
    expect(layer.pieceOf(TRUCK)?.box).toBeNull();
    layer.orient(eye);
    expect(layer.pieceOf(TRUCK)?.box).not.toBeNull();
    expect(copy.parent).not.toBeNull();
    expect(meshes(layer)).toHaveLength(1);
    layer.standIn(TRUCK, null);
    expect(copy.parent).toBeNull();
    expect(meshes(layer)).toHaveLength(1);
  });

  it('lends no man: a squad has no file of its own', async () => {
    expect((await standing('infantry')).pieceOf(TRUCK)).toBeNull();
  });

  it("stands the copy in the clone's place, at its matrix, and gives the clone back", async () => {
    const layer = await standing('landTransport');
    const clone = meshes(layer)[0]!.parent!;
    layer.group.updateMatrixWorld(true);
    const was = clone.matrixWorld.clone();
    const copy = new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
    layer.standIn(TRUCK, copy);
    layer.group.updateMatrixWorld(true);
    expect(meshes(layer)).toHaveLength(1);
    expect(clone.parent).toBeNull();
    expect(copy.matrixWorld.equals(was)).toBe(true);
    layer.standIn(TRUCK, null);
    expect(copy.parent).toBeNull();
    expect(clone.parent).not.toBeNull();
  });

  it('picks and is under the same pile while a copy stands in', async () => {
    const layer = await standing('landTransport');
    const down = () => new Raycaster(new Vector3(0, 5, 0), new Vector3(0, -1, 0));
    layer.group.updateMatrixWorld(true);
    const [pick, under] = [layer.pick(down())?.pileId, layer.under(down())?.id];
    layer.standIn(
      TRUCK,
      new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())),
    );
    layer.group.updateMatrixWorld(true);
    expect(pick).toBe('p');
    expect(layer.pick(down())?.pileId).toBe(pick);
    expect(layer.under(down())?.id).toBe(under);
  });

  it('takes the loan back from a pile dressed again, or put in hand', async () => {
    const layer = await standing('landTransport');
    layer.standIn(TRUCK, new Group());
    layer.hold({ pileId: 'p', troopIds: ['landTransport'] });
    expect(layer.pieceOf(TRUCK)).toBeNull();
    layer.hold(null);
    expect(layer.pieceOf(TRUCK)).not.toBeNull();
    // A truck gone from burning to smoking is drawn again: other figurines, the loan is over.
    layer.display([
      {
        ...pileOf('landTransport'),
        pieces: pilePieces([{ ...troop('landTransport'), strength: 50 }]),
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    layer.orient(eye);
    expect(layer.pieceOf(TRUCK)).toBeNull();
  });
});
