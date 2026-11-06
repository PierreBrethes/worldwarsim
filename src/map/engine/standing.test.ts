import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  type RingGeometry,
  Vector3,
} from 'three';
import { pileLayout } from '@/domain/pile-layout';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import type { MapMotion } from '@/domain/map-motion';
import { pilePieces, postedAt, unitPieces } from '@/domain/pile-pieces';
import { AIRFIELD } from '@/emblems/kits/manifest';
import { apron, berths, layout, type Place } from './timelines/rest';
import type { WorldFrame } from './frame';
import {
  besideSites,
  drawnKey,
  dressedGroups,
  formationOf,
  labelOfPile,
  nearestGroup,
  pileObject,
  pickedIn,
  StandingLayer,
  takenCopies,
  targetGrowth,
} from './standing';
import { troopSpan } from '@/domain/piece-size';
import { pieceScale } from './piece-scale';
import { floorGrowth, TANK_SHARE, troopPinSpan, troopScale } from './figurines/figurine';

// The loader wants a DOM: every file is a box of a metre.
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync() {
      return Promise.resolve({
        scene: new Group().add(
          new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()),
          Object.assign(new Group(), { name: 'fx_smoke' }),
        ),
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

  it('faces the heading it arrived by, and the board on a shore (#362)', async () => {
    const flat = {
      projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, -lat),
    } as unknown as WorldFrame;
    const frontOf = async (seaward: readonly [number, number] | null) => {
      const layer = new StandingLayer(
        flat,
        () => {},
        () => null,
        () => seaward,
      );
      layer.setNation('france');
      layer.display([{ ...pileOf('landTransport'), facing: 90 }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      layer.orient(new Vector3(2, 3, -45));
      return layer.placeOf(TRUCK)!.front;
    };
    const east = await frontOf(null);
    expect(east.x).toBeCloseTo(1, 2);
    expect(east.z).toBeCloseTo(0, 2);
    const shore = await frontOf([0, 1]);
    expect(shore.z).toBeCloseTo(1, 6);
  });

  it('measures a truck nose to tail whichever way its rank turns (#271)', async () => {
    const flat = {
      projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, -lat),
    } as unknown as WorldFrame;
    const turned = async (facing: number) => {
      const layer = new StandingLayer(
        flat,
        () => {},
        () => null,
      );
      layer.setNation('france');
      layer.display([{ ...pileOf('landTransport'), facing }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      layer.orient(new Vector3(2, 3, -45));
      const size = layer.pieceOf(TRUCK)!.box!.getSize(new Vector3());
      return { length: layer.lengthOf(TRUCK)!, box: Math.max(size.x, size.z) };
    };
    const [straight, aslant] = [await turned(0), await turned(30)];
    expect(aslant.length).toBeCloseTo(straight.length, 6);
    expect(aslant.box).toBeGreaterThan(aslant.length + 0.01);
  });

  it('lends a piece with its length nose to tail, as a barracks door reads it', async () => {
    const lent = async (facing: number) => {
      const layer = new StandingLayer(
        {
          projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, -lat),
        } as unknown as WorldFrame,
        () => {},
        () => null,
      );
      layer.setNation('france');
      layer.display([{ ...pileOf('landTransport'), facing }]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      layer.orient(new Vector3(2, 3, -45));
      return { lent: layer.pieceOf(TRUCK)!.length, own: layer.lengthOf(TRUCK) };
    };
    const aslant = await lent(30);
    expect(aslant.lent).toBe(aslant.own);
    expect(aslant.lent).toBeCloseTo((await lent(0)).lent!, 6);
  });

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

  it('measures a walking copy with the rank it walks to: a walk seen at either end goes on', async () => {
    const layer = await standing('landTransport');
    const rank = layer.placeOf(TRUCK)!.at;
    const copy = new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
    copy.children[0]!.position.set(500, 0, 0);
    layer.standIn(TRUCK, copy);
    const box = layer.pieceOf(TRUCK)!.box!;
    expect(box.containsPoint(rank)).toBe(true);
    expect(box.max.x).toBeGreaterThan(rank.x + 1);
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

  it('lends a squad of men moved whole: no file to cook, a clone of the men drawn', async () => {
    const layer = await standing('infantry');
    const piece = layer.pieceOf('p/0');
    expect(piece?.url).toBeUndefined();
    expect(piece?.box?.isEmpty()).toBe(false);
    const drawn = meshes(layer);
    const copy = layer.copyOf('p/0')!;
    const cloned: Mesh[] = [];
    copy.traverse((node) => (node as Mesh).isMesh && cloned.push(node as Mesh));
    expect(cloned).toHaveLength(drawn.length);
    expect(cloned.some((mesh) => drawn.includes(mesh))).toBe(false);
    expect(layer.copyOf('p/9')).toBeNull();
  });

  it('says where a group stands on the board, and the way it faces', async () => {
    const layer = await standing('infantry', 'armor');
    const [first, second] = [layer.placeOf('p/0')!, layer.placeOf('p/1')!];
    // Side by side, the pile at the origin of the board, facing as the pile does.
    expect(first.at.x).toBeLessThan(0);
    expect(second.at.x).toBeCloseTo(-first.at.x);
    expect(first.at.z).toBeCloseTo(0);
    expect(second.front.toArray()).toEqual([0, 0, 1]);
    expect(layer.placeOf('p/9')).toBeNull();
    // The three men of the squad, front first: where each walks to, in file.
    expect(first.men).toHaveLength(3);
    expect(first.men[0]!.z).toBeGreaterThan(first.men[1]!.z);
    expect(second.men).toEqual([]);
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

  it('leaves no glow at its rank while its only group plays away, and glows again given back (#271)', async () => {
    const layer = await standing('landTransport');
    const glows = () => {
      let count = 0;
      layer.lights(() => count++);
      return count;
    };
    expect(glows()).toBe(1);
    layer.standIn(TRUCK, new Group());
    expect(glows()).toBe(0);
    layer.standIn(TRUCK, null);
    expect(glows()).toBe(1);
  });

  it('keeps the glow of a pile whose other groups stay at their rank', async () => {
    const layer = await standing('infantry', 'armor');
    layer.standIn('p/0', new Group());
    let count = 0;
    layer.lights(() => count++);
    expect(count).toBe(1);
  });

  it('takes the loan back from a pile dressed again, or put in hand', async () => {
    const layer = await standing('landTransport');
    layer.standIn(TRUCK, new Group());
    layer.hold({ pileId: 'p', troopIds: ['landTransport'] });
    expect(layer.pieceOf(TRUCK)).toBeNull();
    layer.hold(null);
    expect(layer.pieceOf(TRUCK)).not.toBeNull();
    layer.standIn(TRUCK, new Group());
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

  describe('a pile that grows by a troop walking to its rank', () => {
    const grown = async (
      claim: ReadonlyArray<number> | null,
      motion: MapMotion = 'full',
      options: { opens?: boolean; formed?: boolean } = {},
    ) => {
      const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
      const layer = await standing('infantry');
      const was = layer.placeOf('p/0')!.at.x;
      layer.display([pileOf('infantry', 'armor')]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      layer.orient(eye);
      layer.motion = motion;
      if (claim) layer.arrive('p', claim, options);
      layer.orient(eye);
      const at = (ms: number) => {
        clock.mockReturnValue(ms);
        layer.orient(eye);
        return layer.placeOf('p/0')!.at.x;
      };
      return { was, at, clock, layer };
    };
    /** The staple's stroke round the pile (#277), and how much of it is drawn. */
    const staple = (layer: StandingLayer) => {
      let found: Mesh | null = null;
      layer.group.traverse((node) => {
        const mesh = node as Mesh;
        if (mesh.isMesh && mesh.visible && mesh.geometry.type === 'RingGeometry')
          if ((mesh.geometry as RingGeometry).parameters.thetaLength > 2 * Math.PI) found = mesh;
      });
      return found as Mesh | null;
    };

    it('opens the rank in the half-second before a deploying column reaches it (#277)', async () => {
      const { was, at, clock } = await grown([1000], 'full', { opens: true });
      expect(at(400)).toBeCloseTo(was);
      const gliding = at(750);
      const settled = at(1000);
      expect(gliding).toBeLessThan(was);
      expect(gliding).toBeGreaterThan(settled);
      expect(at(1600)).toBeCloseTo(settled);
      clock.mockRestore();
    });

    it('staples the squad once its last newcomer stands, and only then (#277)', async () => {
      const { at, clock, layer } = await grown([1000], 'full', { opens: true, formed: true });
      at(900);
      expect(staple(layer)).toBeNull();
      at(1300);
      const stroke = staple(layer)!;
      expect(stroke.geometry.drawRange.count).toBeLessThan(stroke.geometry.index!.count);
      at(1650);
      expect(stroke.geometry.drawRange.count).toBeGreaterThanOrEqual(stroke.geometry.index!.count);
      at(2000);
      expect(staple(layer)).toBeNull();
      clock.mockRestore();
    });

    it('lays no staple while a column of mine still heads there, nor when motion is cut', async () => {
      const { at, clock, layer } = await grown([1000], 'full', { opens: true });
      at(1300);
      expect(staple(layer)).toBeNull();
      clock.mockRestore();
      const cut = await grown([1000], 'off', { opens: true, formed: true });
      cut.at(1300);
      expect(staple(cut.layer)).toBeNull();
      cut.clock.mockRestore();
    });

    it('lays the staple whole at reduced motion, then pales it in 0.3 s (#277)', async () => {
      const { at, clock, layer } = await grown([1000], 'reduced', { opens: true, formed: true });
      at(1050);
      const stroke = staple(layer)!;
      expect(stroke.geometry.drawRange.count).toBeGreaterThanOrEqual(stroke.geometry.index!.count);
      at(1200);
      expect((stroke.material as MeshStandardMaterial).opacity).toBeLessThan(0.75);
      at(1400);
      expect(staple(layer)).toBeNull();
      clock.mockRestore();
    });

    it('halts a column joining the pile at its edge, nowhere else (#277)', async () => {
      const one = (await standing('infantry')).edgeAt([2, 48]);
      const layer = await standing('infantry', 'armor', 'landTransport');
      expect(one).toBeGreaterThan(0);
      // A wider rank, a further edge.
      expect(layer.edgeAt([2, 48])).toBeGreaterThan(one);
      expect(layer.edgeAt([2.5, 48])).toBe(0);
    });

    it('holds the rank as it stood until the newcomer arrives, then glides it in half a second', async () => {
      const { was, at, clock } = await grown([1000]);
      expect(at(500)).toBeCloseTo(was);
      const gliding = at(1250);
      const settled = at(1600);
      expect(settled).toBeLessThan(was);
      expect(gliding).toBeLessThan(was);
      expect(gliding).toBeGreaterThan(settled);
      clock.mockRestore();
    });

    it("holds the rank while the newcomer's model is still loading, for its walk to claim", async () => {
      const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
      const layer = await standing('infantry');
      const was = layer.placeOf('p/0')!.at.x;
      layer.display([pileOf('infantry', 'armor')]);
      // Two frames before the tank's file lands: placed, not ready.
      layer.orient(eye);
      layer.orient(eye);
      await new Promise((resolve) => setTimeout(resolve, 0));
      layer.orient(eye);
      layer.arrive('p', [1000]);
      clock.mockReturnValue(500);
      layer.orient(eye);
      expect(layer.placeOf('p/0')!.at.x).toBeCloseTo(was);
      clock.mockRestore();
    });

    it('glides a part of the way at each arrival, half a second each', async () => {
      const { was, at, clock } = await grown([1000, 2000]);
      expect(at(900)).toBeCloseTo(was);
      const half = at(1600);
      const settled = at(2600);
      expect(half).toBeLessThan(was);
      expect(half).toBeGreaterThan(settled);
      expect(half).toBeCloseTo((was + settled) / 2);
      clock.mockRestore();
    });

    it('stands the rank at once out of full motion, walks or not', async () => {
      const { was, at, clock } = await grown([1000], 'off');
      expect(at(10)).toBeLessThan(was);
      clock.mockRestore();
    });

    it('stands the rank at once in its new places when no walk claims it', async () => {
      const { was, at, clock } = await grown(null);
      expect(at(10)).toBeLessThan(was);
      clock.mockRestore();
    });
  });

  describe('what wears on the model', () => {
    const smoking = (pieces = pilePieces([{ ...troop('landTransport'), strength: 50 }])) => ({
      ...pileOf('landTransport'),
      pieces,
    });
    const burning = () => smoking(pilePieces([{ ...troop('landTransport'), strength: 10 }]));
    const copyWithMarker = () =>
      new Group().add(
        new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()),
        Object.assign(new Group(), { name: 'fx_smoke' }),
      );
    const dressed = (layer: StandingLayer) =>
      (layer as unknown as { dressed: Map<string, { smokes: Array<{ object: Group }> }> }).dressed;
    const fresh = (pile: ReturnType<typeof smoking>) => {
      const layer = new StandingLayer(
        frame,
        () => {},
        () => null,
      );
      layer.setNation('france');
      layer.display([pile]);
      return layer;
    };

    it('lets the plume follow the copy, and come back with the model', async () => {
      const layer = fresh(smoking());
      await new Promise((resolve) => setTimeout(resolve, 0));
      layer.orient(eye);
      const plume = dressed(layer).get('p')!.smokes[0]!.object;
      const home = plume.parent;
      const copy = copyWithMarker();
      layer.standIn(TRUCK, copy);
      expect(plume.parent).toBe(copy.getObjectByName('fx_smoke'));
      layer.standIn(TRUCK, null);
      expect(plume.parent).toBe(home);
    });

    it('puts the plume and the char on the model drawn, not on a copy that came first', async () => {
      const layer = fresh(burning());
      const copy = copyWithMarker();
      layer.standIn(TRUCK, copy);
      await new Promise((resolve) => setTimeout(resolve, 0));
      layer.orient(eye);
      const plume = dressed(layer).get('p')!.smokes[0]!.object;
      layer.standIn(TRUCK, null);
      const model = layer.group.getObjectByName('fx_smoke')!.parent!;
      expect(plume.parent).toBe(model.getObjectByName('fx_smoke'));
      const hull = (root: Group) =>
        (root.children.find((c) => (c as Mesh).isMesh) as Mesh).material;
      const [origin, plain] = [hull(model as Group), copy.children[0] as Mesh];
      expect(origin).toBeDefined();
      // The copy was charred as well while it stood in.
      expect(plain.material).not.toBe(origin);
    });

    it('gives the washed-out model back washed when the pile is taken mid-sequence', async () => {
      const layer = fresh(smoking());
      await new Promise((resolve) => setTimeout(resolve, 0));
      layer.orient(eye);
      const copy = copyWithMarker();
      layer.standIn(TRUCK, copy);
      layer.hold({ pileId: 'p', troopIds: ['landTransport'] });
      expect(copy.parent).toBeNull();
      const meshOf = () => {
        const found: Mesh[] = [];
        layer.group.traverse((n) => (n as Mesh).isMesh && found.push(n as Mesh));
        return found.find(
          (m) => m.geometry.type === 'BoxGeometry' && m.userData.grip === undefined,
        )!;
      };
      expect(meshOf().userData.unwashed).toBeDefined();
      // The sequence finishes on its next step: nothing to give back twice.
      layer.standIn(TRUCK, null);
      expect(meshOf().userData.unwashed).toBeDefined();
    });
  });
});

describe('labelOfPile', () => {
  const pieces = pilePieces([troop('infantry')]);
  it('names the mast a garrison stands beside, the label it hangs from, or its own', () => {
    expect(labelOfPile({ id: 'b', at: { beside: 'building-hq' }, pieces }, 'b')).toBe(
      'building-hq',
    );
    expect(labelOfPile({ id: 'o', label: 'outpost-1', at: { lonLat: [0, 0] }, pieces }, 'o')).toBe(
      'outpost-1',
    );
    expect(labelOfPile({ id: 'p', at: { lonLat: [0, 0] }, pieces }, 'p')).toBe('p');
    expect(labelOfPile(undefined, 'p')).toBe('p');
  });
});

describe('besideSites (#341)', () => {
  const pieces = pilePieces([troop('infantry')]);
  const ground = { id: 'g', at: { lonLat: [2.35, 48.85] as const }, pieces };
  const hq = { id: 'building-hq@2.35,48.85', at: [2.35, 48.85] as const };

  it('stands a pile posted at the point of a site beside it, not under it, and remembers its point', () => {
    const [moved] = besideSites([ground], [hq]);
    expect(moved!.at).toEqual({ beside: hq.id, from: [2.35, 48.85] });
  });

  it('keeps the pile its own label: the site it stands at is not what it answers to', () => {
    const [moved] = besideSites([ground], [hq]);
    expect(labelOfPile(moved, 'g')).toBe('g');
    expect(labelOfPile({ ...ground, label: 'outpost-1' }, 'g')).toBe('outpost-1');
  });

  it('leaves a pile elsewhere, and a garrison already beside its own, where they are', () => {
    const beside = { id: 'b', at: { beside: 'building-hq' }, pieces };
    const sites = [{ id: 'building-hq@2,48', at: [2, 48] as const }];
    expect(besideSites([ground, beside], sites)).toEqual([ground, beside]);
  });

  it('leaves a fleet at its point: its hulls dock along the quay of a port, not on land', () => {
    const fleet = { id: 'f', at: ground.at, pieces: pilePieces([troop('escort')]) };
    expect(besideSites([fleet], [hq])).toEqual([fleet]);
  });
});

/** **La pièce se met en batterie d'elle-même** (#325) : aucune vue n'arrive quand `emplacedAt`
 *  passe, la couche programme le changement de pose. */
describe('a gun going into battery', () => {
  it('is dressed at rest, then in battery once its instant passes', () => {
    vi.useFakeTimers({ now: 1_000 });
    try {
      const layer = new StandingLayer(
        { projectLonLat: () => new Vector3() } as unknown as WorldFrame,
        () => {},
        () => null,
      );
      layer.setNation('france');
      const gun = { ...troop('artillery'), emplacedAt: 31_000 };
      layer.display([
        { id: 'p', at: { lonLat: [2, 49] }, pieces: pilePieces([gun], { afloat: false }) },
      ]);
      expect(layer.pieceOf('p/0')?.pose).toBeUndefined();
      vi.advanceTimersByTime(30_100);
      expect(layer.pieceOf('p/0')?.pose).toBe('emplaced');
      layer.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a pile drawn again under a gesture (#277)', () => {
  const flat = {
    projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, -lat),
  } as unknown as WorldFrame;
  const eye = new Vector3(2, 3, -45);
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const one = (id: string, role: UnitRole, carriedBy?: string) => ({
    ...troop(role),
    id,
    ...(carriedBy === undefined ? {} : { carriedBy }),
  });
  const pile = (id: string, lon: number, ...troops: ReturnType<typeof one>[]) => ({
    id,
    at: { lonLat: [lon, 48] as const },
    pieces: pilePieces(troops),
  });
  const drawn = async (...piles: ReturnType<typeof pile>[]) => {
    const layer = new StandingLayer(
      flat,
      () => {},
      () => null,
    );
    layer.setNation('france');
    layer.display(piles);
    await tick();
    layer.orient(eye);
    layer.orient(eye);
    return layer;
  };
  const x = (layer: StandingLayer, id: string) => layer.placeOf(id)!.at.x;

  it('holds a pile a sequence will claim, then stands it once the wait is over', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    const layer = await drawn(pile('p', 2, one('a', 'infantry')));
    const was = x(layer, 'p/0');
    layer.display([pile('p', 2, one('a', 'infantry'), one('b', 'armor'))]);
    layer.expect('p');
    await tick();
    layer.orient(eye);
    layer.orient(eye);
    expect(x(layer, 'p/0')).toBeCloseTo(was, 6);
    clock.mockReturnValue(3000);
    layer.orient(eye);
    expect(x(layer, 'p/0')).not.toBeCloseTo(was, 3);
    clock.mockRestore();
  });

  it('remembers where each troop last stood as its pile is drawn again, for three seconds', async () => {
    const date = vi.spyOn(Date, 'now').mockReturnValue(0);
    const squad = [one('a', 'infantry'), one('b', 'armor')];
    const layer = await drawn(pile('p', 2, ...squad));
    const stood = layer.placeOf('p/1')!.at.clone();
    const apart = [pile('p', 2, squad[0]!), pile('q', 2.3, squad[1]!)];
    layer.display(apart);
    expect(layer.lastSeen('b')!.at.distanceTo(stood)).toBeCloseTo(0, 6);
    date.mockReturnValue(3001);
    layer.display(apart);
    expect(layer.lastSeen('b')).toBeNull();
    date.mockRestore();
  });

  it('holds the men just landed on their truck, the same however often it is asked', async () => {
    const layer = await drawn(pile('p', 2, one('t', 'landTransport'), one('i', 'infantry', 't')));
    layer.display([pile('p', 2, one('t', 'landTransport'), one('i', 'infantry'))]);
    await tick();
    layer.orient(eye);
    const groups = layer.piecesOf('p')!.groups;
    const truck = `p/${groups.findIndex(({ role }) => role === 'landTransport')}`;
    const men = `p/${groups.findIndex(({ role }) => role === 'infantry')}`;
    layer.anchor(truck);
    const held = [x(layer, truck), x(layer, men)];
    layer.anchor(truck);
    expect([x(layer, truck), x(layer, men)]).toEqual(held);
    layer.arrive('p', []);
    const gap = held[0]! - x(layer, truck);
    expect(Math.abs(gap)).toBeGreaterThan(1e-3);
    expect(held[1]! - x(layer, men)).toBeCloseTo(gap, 6);
  });

  it('draws a man boarding until his walk ends, and forgets him with his pile', async () => {
    const truck = pile('p', 2, one('t', 'landTransport'));
    const layer = await drawn(truck);
    const rider = {
      troopId: 'i',
      figures: [1, 1, 1] as const,
      at: new Vector3(2, 0, -48),
      heading: 0,
    };
    const [walker] = layer.board('p', [rider]);
    await tick();
    expect(layer.placeOf(walker!)).not.toBeNull();
    layer.standIn(walker!, new Group());
    layer.standIn(walker!, null);
    expect(layer.placeOf(walker!)).toBeNull();
    const [again] = layer.board('p', [rider]);
    await tick();
    layer.display([]);
    layer.display([truck]);
    await tick();
    layer.orient(eye);
    expect(layer.placeOf(again!)).toBeNull();
  });
});

/** **Un tas à quai prend l'échelle de son port** (#433, option C) : son seuil d'épingle, son
 *  plancher et son pied sont ceux du tas dessiné à cette échelle. */
describe('a fleet docked at a port drawn smaller', () => {
  type Inner = { dressed: Map<string, { object: Group }> };
  const frame = {
    projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, lat),
  } as unknown as WorldFrame;
  const eye = new Vector3(0, 0.4, 0.4);
  const docked = async (scale: number) => {
    const piles: number[] = [];
    const layer = new StandingLayer(
      frame,
      () => {},
      (_, pile) => {
        piles.push(pile);
        return {
          at: new Vector3(0, 0, 0),
          step: [0, 0] as const,
          facing: 0,
          rank: false,
          width: Infinity,
          deep: [0, 0] as const,
          scale,
          toBoard: (point: Vector3) => point.clone(),
        };
      },
    );
    layer.setNation('france');
    layer.display([
      { id: 'f', at: { beside: 'port', quay: [0, 0] }, pieces: pilePieces([troop('cargo')]) },
    ]);
    await vi.waitFor(() => expect(layer.group.children.length).toBe(1));
    layer.orient(eye);
    const { object } = (layer as unknown as Inner).dressed.get('f')!;
    return { size: object.scale.x, piles, pin: layer.spanOf('f')! };
  };

  it('is drawn at the port scale, stood off by its drawn span, pinned by it', async () => {
    const whole = await docked(1);
    const small = await docked(0.4);
    // The first asks are for its port's front alone (#436), at no pile.
    const span = whole.piles.find((pile) => pile > 0)!;
    expect(small.piles.some((pile) => Math.abs(pile - span * 0.4) < 1e-12)).toBe(true);
    const d = eye.length();
    expect(small.size / whole.size).toBeCloseTo(
      (0.4 * troopScale(d, span * 0.4)) / troopScale(d, span),
      9,
    );
    expect(small.pin).toBeCloseTo(troopPinSpan(span * 0.4), 12);
  });
});

/** **Les coques d'un port tourné se rangent le long de son bord d'eau** (#436) : la formation lit le
 *  cap de la maquette, pas la grille autour du point. */
describe('a fleet at the quay of a turned port', () => {
  it('stands its hulls to seaward of the pile along the port front, not along the grid', async () => {
    const layer = new StandingLayer(
      { projectLonLat: () => new Vector3() } as unknown as WorldFrame,
      () => {},
      () => ({
        at: new Vector3(),
        step: [0, 0] as const,
        facing: Math.PI / 2,
        rank: false,
        width: Infinity,
        deep: [0, 0] as const,
        scale: 1,
        toBoard: (point: Vector3) => point.clone(),
      }),
      // The grid round the point reads no shore.
      () => null,
    );
    layer.setNation('france');
    layer.display([
      { id: 'f', at: { beside: 'port', quay: [0, 0] }, pieces: pilePieces([troop('cargo')]) },
    ]);
    await vi.waitFor(() => expect(layer.group.children.length).toBe(1));
    const { object } = (
      layer as unknown as { dressed: Map<string, { object: Group }> }
    ).dressed.get('f')!;
    const hull = object.children[0]!;
    expect(hull.position.x).toBeGreaterThan(0.4);
    expect(hull.position.z).toBeCloseTo(0, 9);
  });
});

/** **Une pièce au repos se range à son poste** (#475) : l'avion sur l'aire, la coque au môle, loin
 *  de la formation de leur pile, et le rang de la garnison ne les compte plus. */
describe('pieces resting at their post', () => {
  type Inner = { dressed: Map<string, { object: Group }> };
  const eye = new Vector3(0, 0.4, 0.4);
  const SITE = new Vector3(0.3, 0, 0.2);
  /** A site at `SITE`, a hundredth of a board unit to the metre, turned to nothing. */
  const toBoard = (point: Vector3) => point.clone().multiplyScalar(0.01).add(SITE);
  const stub = {
    at: SITE,
    step: [0, 0] as const,
    facing: 0,
    rank: false,
    width: Infinity,
    deep: [0, 0] as const,
    scale: 1,
    toBoard,
  };
  const unit = (role: UnitRole, id: string) => ({ ...troop(role), id });
  const standing = async (piles: Parameters<StandingLayer['display']>[0], rank = false) => {
    const layer = new StandingLayer(
      { projectLonLat: () => new Vector3() } as unknown as WorldFrame,
      () => {},
      () => ({ ...stub, rank, width: 100 }),
      () => null,
    );
    layer.setNation('france');
    layer.display(piles);
    await vi.waitFor(() => expect(layer.group.children.length).toBe(piles.length));
    layer.orient(eye);
    return layer;
  };
  const growthOf = (role: UnitRole) =>
    floorGrowth(SITE.distanceTo(eye), pileObject('france', pilePieces([troop(role)]))!.span) *
    pieceScale.size;
  const near = (at: Vector3, to: Vector3) => expect(at.distanceTo(to)).toBeLessThan(1e-9);

  it('stands the planes of an airfield on its apron, the men in the pile', async () => {
    const pieces = postedAt(
      pilePieces([unit('fighter', 'a'), unit('fighter', 'b'), unit('infantry', 'i')]),
      'airfield',
    );
    const layer = await standing([{ id: 'p', at: { beside: 'site' }, pieces }]);
    const g = growthOf('fighter');
    const slots = apron(['fighter', 'fighter'], g);
    pieces.groups.forEach(({ role }, k) => {
      const at = layer.placeOf(`p/${k}`)!.at;
      if (role !== 'fighter') return expect(at.distanceTo(SITE)).toBeLessThan(0.1);
      const slot = slots[pieces.groups.slice(0, k).filter((x) => x.role === 'fighter').length]!;
      near(at, toBoard(new Vector3(slot.x, AIRFIELD.top, slot.z)));
    });
  });

  it('stands the hulls of a port along its mole, a third in the roads', async () => {
    const pieces = postedAt(
      pilePieces([unit('cargo', 'a'), unit('escort', 'b'), unit('cargo', 'c')]),
      'port',
    );
    const layer = await standing([{ id: 'p', at: { beside: 'site', quay: [0, 0] }, pieces }]);
    const g = growthOf('cargo');
    const slots = berths(
      pieces.groups.map(({ role }) => role as 'cargo' | 'escort'),
      g,
    );
    pieces.groups.forEach((_, k) => {
      const slot = slots[k]!;
      near(layer.placeOf(`p/${k}`)!.at, toBoard(new Vector3(slot.x, 0, slot.z)));
    });
  });

  it('turns a plane nose to the runway and a hull stem to the land', async () => {
    const air = await standing([
      {
        id: 'p',
        at: { beside: 'site' },
        pieces: postedAt(pilePieces([unit('fighter', 'a')]), 'airfield'),
      },
    ]);
    const front = air.placeOf('p/0')!.front;
    expect(Math.atan2(front.x, front.z)).toBeCloseTo(0, 9);
    const sea = await standing([
      {
        id: 'p',
        at: { beside: 'site', quay: [0, 0] },
        pieces: postedAt(pilePieces([unit('cargo', 'a')]), 'port'),
      },
    ]);
    expect(Math.abs(sea.placeOf('p/0')!.front.z)).toBeCloseTo(1, 9);
    expect(sea.placeOf('p/0')!.front.z).toBeLessThan(0);
  });

  it('does not count the planes in the rank of the garrison', async () => {
    const planes = postedAt(
      pilePieces([unit('fighter', 'a'), unit('fighter', 'b'), unit('fighter', 'c')]),
      'airfield',
    );
    const men = pilePieces([unit('infantry', 'i')]);
    const centred = async (piles: Parameters<StandingLayer['display']>[0]) => {
      const layer = await standing(piles, true);
      return (layer as unknown as Inner).dressed.get('men')!.object.position.x;
    };
    const alone = await centred([{ id: 'men', at: { beside: 'site' }, pieces: men }]);
    const beside = await centred([
      { id: 'planes', at: { beside: 'site' }, pieces: planes },
      { id: 'men', at: { beside: 'site' }, pieces: men },
    ]);
    expect(beside).toBeCloseTo(alone, 9);
  });

  it('keeps what is not posted where the pile stands it, as before', async () => {
    const pieces = pilePieces([unit('fighter', 'a')]);
    const layer = await standing([{ id: 'p', at: { beside: 'site' }, pieces }]);
    expect(layer.placeOf('p/0')!.at.distanceTo(SITE)).toBeLessThan(0.1);
  });

  const planes = (...ids: string[]) =>
    postedAt(pilePieces(ids.map((id) => unit('fighter', id))), 'airfield');
  const spot = (layer: StandingLayer, k: number) => {
    const { at } = layer.placeOf(`p/${k}`)!;
    return at;
  };
  const wanted = (place: Place) =>
    toBoard(
      new Vector3(
        layout([{ role: 'fighter', place }], growthOf('fighter'))[0]!.x,
        AIRFIELD.top,
        layout([{ role: 'fighter', place }], growthOf('fighter'))[0]!.z,
      ),
    );

  it('does not draw a fifth fighter: the apron holds four', async () => {
    const layer = await standing([
      { id: 'p', at: { beside: 'site' }, pieces: planes('a', 'b', 'c', 'd', 'e') },
    ]);
    const { figurines } = (
      layer as unknown as { dressed: Map<string, { figurines: Array<{ object: Group }> }> }
    ).dressed.get('p')!;
    expect(figurines.map(({ object }) => object.visible)).toEqual([true, true, true, true, false]);
  });

  it('keeps the place of a plane while it stays: the one before it leaving moves no other', async () => {
    const layer = await standing([{ id: 'p', at: { beside: 'site' }, pieces: planes('a', 'b') }]);
    const before = spot(layer, 1).clone();
    layer.display([{ id: 'p', at: { beside: 'site' }, pieces: planes('b') }]);
    await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
    layer.orient(eye);
    near(spot(layer, 0), before);
  });

  it('sends a plane formed at its hangar ahead, and one come home to the back', async () => {
    for (const [how, place] of [
      ['formed', { lane: 1, rank: 1 }],
      ['returned', { lane: 1, rank: 0 }],
    ] as const) {
      const layer = await standing([{ id: 'p', at: { beside: 'site' }, pieces: planes('a') }]);
      layer.display([{ id: 'p', at: { beside: 'site' }, pieces: planes('a', 'b') }]);
      await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
      layer.arrivedAt('p', [1], how);
      layer.orient(eye);
      near(spot(layer, 1), wanted(place));
    }
  });

  /** A browser's storage, kept from one layer to the next: a reload (#524). */
  const browser = (places?: Record<string, Place>) => {
    const stored = new Map<string, string>();
    if (places) stored.set('wws-apron-places', JSON.stringify(places));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    return stored;
  };
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the places of a transport and of a fighter formed beside it across a reload (#524)', async () => {
    browser();
    const pile = (...roles: UnitRole[]) => ({
      id: 'p',
      at: { beside: 'site' },
      pieces: postedAt(pilePieces(roles.map((role, k) => unit(role, `t${k}`))), 'airfield'),
    });
    const live = await standing([pile('airTransport')]);
    live.display([pile('airTransport', 'fighter')]);
    await vi.waitFor(() => expect(live.isDressed('p')).toBe(true));
    live.arrivedAt(
      'p',
      [live.piecesOf('p')!.groups.findIndex((g) => g.role === 'fighter')],
      'formed',
    );
    live.orient(eye);
    const reloaded = await standing([pile('airTransport', 'fighter')]);
    for (const troop of ['t0', 't1']) {
      const k = (layer: StandingLayer) =>
        layer.piecesOf('p')!.groups.findIndex((g) => g.troopIds[0] === troop);
      near(spot(reloaded, k(reloaded)), spot(live, k(live)));
    }
  });

  it('lays out afresh two planes recalled at one place, and one formed since (#524)', async () => {
    browser({ a: { lane: 1, rank: 0 }, b: { lane: 1, rank: 0 } });
    const both = await standing([{ id: 'p', at: { beside: 'site' }, pieces: planes('a', 'b') }]);
    near(spot(both, 0), wanted({ lane: 1, rank: 0 }));
    near(spot(both, 1), wanted({ lane: 0, rank: 0 }));
    const layer = await standing([{ id: 'p', at: { beside: 'site' }, pieces: planes('c') }]);
    layer.display([{ id: 'p', at: { beside: 'site' }, pieces: planes('c', 'a') }]);
    await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
    layer.arrivedAt('p', [1], 'formed');
    layer.orient(eye);
    near(spot(layer, 1), wanted({ lane: 1, rank: 1 }));
  });

  it('stores nothing from a view that loads empty: the next reload still finds its places (#524)', async () => {
    const stored = browser({ a: { lane: 1, rank: 0 } });
    const layer = await standing([]);
    layer.orient(eye);
    expect(JSON.parse(stored.get('wws-apron-places')!)).toEqual({ a: { lane: 1, rank: 0 } });
  });

  const hullsAt = (...ids: string[]) =>
    postedAt(pilePieces(ids.map((id) => unit('cargo', id))), 'port');
  const port = (...ids: string[]) => [
    { id: 'p', at: { beside: 'site', quay: [0, 0] as [number, number] }, pieces: hullsAt(...ids) },
  ];
  const redraw = async (layer: StandingLayer, ...ids: string[]) => {
    layer.display(port(...ids));
    await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
    layer.orient(eye);
  };

  it('keeps the post of a hull while it stays: a hull leaving the side or the roads moves no other (#487)', async () => {
    const layer = await standing(port('a', 'b', 'c'));
    const [a, c] = [spot(layer, 0).clone(), spot(layer, 2).clone()];
    await redraw(layer, 'a', 'c');
    near(spot(layer, 0), a);
    // `c` was in the roads and stays: the side of the mole is free for the next, not for it.
    near(spot(layer, 1), c);
    expect(layer.takePromotions()).toEqual([]);
  });

  it('moves the hull at the side up to the mole when the one there leaves, and says so (#487)', async () => {
    const layer = await standing(port('a', 'b', 'c'));
    const [mole, side, roads] = [0, 1, 2].map((k) => spot(layer, k).clone()) as [
      Vector3,
      Vector3,
      Vector3,
    ];
    await redraw(layer, 'b', 'c');
    near(spot(layer, 0), mole);
    near(spot(layer, 1), roads);
    expect(side.distanceTo(mole)).toBeGreaterThan(1e-3);
    const [moved] = layer.takePromotions();
    expect(moved).toMatchObject({ site: 'site', id: 'p/0', role: 'cargo' });
    expect(moved!.from.x).toBeLessThan(moved!.to.x);
    expect(layer.takePromotions()).toEqual([]);
  });

  it('tells the post of the piece a sequence plays for: the mole, the side, the roads, none (#477)', async () => {
    const layer = await standing(port('a', 'b', 'c'));
    expect([0, 1, 2].map((k) => layer.postOf(`p/${k}`))).toEqual(['mole', 'couple', 'roads']);
    expect(layer.postOf('p/9')).toBeNull();
    expect(layer.postOf('nobody/0')).toBeNull();
  });

  it('remembers where a plane rested when it leaves, for its take-off (#487)', async () => {
    const layer = await standing([{ id: 'p', at: { beside: 'site' }, pieces: planes('a', 'b') }]);
    const at = layer.restOf('b');
    expect(at?.site).toBe('site');
    layer.display([{ id: 'p', at: { beside: 'site' }, pieces: planes('a') }]);
    await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
    layer.orient(eye);
    expect(layer.restOf('b')).toEqual(at);
    expect(layer.restOf('nobody')).toBeNull();
  });

  it('drops the rests kept for a site that turns over: they are no longer where they were (#476)', async () => {
    let mirrored = false;
    const layer = new StandingLayer(
      { projectLonLat: () => new Vector3() } as unknown as WorldFrame,
      () => {},
      () => ({ ...stub, mirrored }),
      () => null,
    );
    layer.setNation('france');
    const at = { beside: 'site' };
    layer.display([{ id: 'p', at, pieces: planes('a', 'b') }]);
    await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
    layer.orient(eye);
    expect(layer.restOf('b')).not.toBeNull();
    mirrored = true;
    layer.display([{ id: 'p', at, pieces: planes('a') }]);
    await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
    layer.orient(eye);
    expect(layer.restOf('a')).not.toBeNull();
    expect(layer.restOf('b')).toBeNull();
  });

  it('forgets where a plane rested after SEEN_MS, and keeps the place of one come back (#487)', async () => {
    const layer = await standing([{ id: 'p', at: { beside: 'site' }, pieces: planes('a', 'b') }]);
    const first = layer.restOf('b');
    const clock = vi.spyOn(performance, 'now');
    const t0 = performance.now();
    layer.display([{ id: 'p', at: { beside: 'site' }, pieces: planes('a') }]);
    await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
    clock.mockReturnValue(t0);
    layer.orient(eye);
    expect(layer.restOf('b')).toEqual(first);
    // Back before SEEN_MS: it rests where it rests now, not where it once left.
    layer.display([{ id: 'p', at: { beside: 'site' }, pieces: planes('b') }]);
    await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
    layer.orient(eye);
    expect(layer.restOf('b')).not.toEqual(first);
    // Gone for good, then past SEEN_MS.
    layer.display([{ id: 'p', at: { beside: 'site' }, pieces: planes('a') }]);
    await vi.waitFor(() => expect(layer.isDressed('p')).toBe(true));
    clock.mockReturnValue(t0 + 100);
    layer.orient(eye);
    expect(layer.restOf('b')).not.toBeNull();
    clock.mockReturnValue(t0 + 3101);
    layer.orient(eye);
    expect(layer.restOf('b')).toBeNull();
    clock.mockRestore();
  });

  it('tells the post of a hull that left (#487)', async () => {
    const layer = await standing(port('a', 'b'));
    expect(layer.restOf('b')?.post).toBe('couple');
    await redraw(layer, 'a');
    expect(layer.restOf('b')?.post).toBe('couple');
  });

  it('remembers the last plane of a site too: its pile is gone with it (#487)', async () => {
    const layer = await standing([{ id: 'p', at: { beside: 'site' }, pieces: planes('a') }]);
    const at = layer.restOf('a');
    layer.display([]);
    layer.orient(eye);
    expect(at).not.toBeNull();
    expect(layer.restOf('a')).toEqual(at);
  });

  it('says a plane with no place is not drawn: the apron holds four (#487)', async () => {
    const layer = await standing([
      { id: 'p', at: { beside: 'site' }, pieces: planes('a', 'b', 'c', 'd', 'e') },
    ]);
    expect([0, 1, 2, 3, 4].map((k) => layer.unposted(`p/${k}`))).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it('draws the ring of a posted pile round the pieces where they rest', async () => {
    const layer = await standing([{ id: 'p', at: { beside: 'site' }, pieces: planes('a', 'b') }]);
    const { ring, figurines, outline } = (
      layer as unknown as {
        dressed: Map<
          string,
          { ring: Group; figurines: Array<{ object: Group }>; outline: { x: number; z: number } }
        >;
      }
    ).dressed.get('p')!;
    const [a, b] = figurines.map(({ object }) => object.position);
    expect(ring.position.x).toBeCloseTo((a!.x + b!.x) / 2, 9);
    expect(ring.position.z).toBeCloseTo((a!.z + b!.z) / 2, 9);
    expect(outline.z).toBeGreaterThan(Math.abs(a!.z - b!.z) / 2);
  });

  it('takes a posted piece in hand with the others, not at its post', () => {
    const pieces = postedAt(pilePieces([unit('fighter', 'a')]), 'airfield');
    const posted = pileObject('france', pieces)!;
    posted.ready.catch(() => {});
    expect(posted.figurines.length).toBe(1);
    expect(drawnKey('france', pieces)).not.toBe(
      drawnKey('france', pilePieces([unit('fighter', 'a')])),
    );
  });
});
