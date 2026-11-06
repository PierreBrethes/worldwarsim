import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, MeshStandardMaterial, type Object3D, Vector3, type Mesh } from 'three';
import { FINAL_POSE_MS } from '@/domain/combat-on-map';
import type { ReplayView } from '@/domain/player-view';
import { REPLAY_MS, stepBounds } from '@/domain/replay';
import { troopSpan } from '@/domain/piece-size';
import { CombatLayer, WAIT_MS } from './combats';
import { ANONYMOUS_SPAN } from './figurines/figurine';
import { REPLAY_STAGE } from './replay';
import { INDIRECT_ELEVATION } from './articulation';

const heard = vi.hoisted(() => [] as string[]);
vi.mock('../table-sound', () => ({ playTableSound: (sound: string) => heard.push(sound) }));
/** A gun as its articulated copy keeps it: its barrel, a muzzle at its end. */
vi.mock('./sequences', async (original) => {
  const { Group } = await import('three');
  return {
    ...(await original<typeof import('./sequences')>()),
    articulatedOf: () => {
      const gun = new Group();
      const barrel = Object.assign(new Group(), { name: 'barrel' });
      barrel.add(Object.assign(new Group(), { name: 'fx_muzzle' }));
      gun.add(barrel);
      return Promise.resolve(gun);
    },
  };
});

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
    Path2D: class {},
  });
});

/** Two blocks against my two men: one of theirs falls, one of mine routs. */
const combat = (id: string, troops = 2): ReplayView => ({
  combatId: id,
  at: 0,
  point: { lon: 4.9, lat: 49.7 },
  side: 'attacker',
  won: true,
  mine: [{ role: 'infantry', tier: 1, troops, lost: 10, routed: 1, destroyed: 0 }],
  theirs: { troops: 2, lost: 50, routed: 0, destroyed: 1 },
});

const scale = () => 1;
const at = new Vector3();

describe('CombatLayer', () => {
  it('plays three combats at once, and holds the final pose of a fourth', () => {
    const layer = new CombatLayer();
    for (const id of ['a', 'b', 'c', 'd']) layer.play(combat(id), null, at, 0, 0);
    layer.advance(0, scale);
    expect(layer.active).toBe(true);
    layer.advance(FINAL_POSE_MS + 1, scale);
    expect(layer.group.children).toHaveLength(3);
    layer.advance(REPLAY_MS, scale);
    expect(layer.group.children).toHaveLength(0);
    expect(layer.active).toBe(false);
  });

  it('holds the final pose of a combat of more than twelve pieces a side', () => {
    const layer = new CombatLayer();
    layer.play(combat('a', 13), null, at, 0, 0);
    expect(layer.active).toBe(false);
    layer.advance(FINAL_POSE_MS + 1, scale);
    expect(layer.group.children).toHaveLength(0);
  });

  it('asks a whole frame per step when reduced, and none between', () => {
    const layer = new CombatLayer();
    layer.motion = 'reduced';
    layer.play(combat('a'), null, at, 0, 0);
    expect(layer.active).toBe(false);
    expect(layer.advance(0, scale)).toBe(true);
    expect(layer.advance(100, scale)).toBe(false);
    expect(layer.advance(stepBounds('pose').start + 1, scale)).toBe(true);
    expect(layer.advance(REPLAY_MS, scale)).toBe(true);
    expect(layer.group.children).toHaveLength(0);
  });

  it('shows the final pose alone when cut: one frame as it comes, one as it goes', () => {
    const layer = new CombatLayer();
    layer.motion = 'off';
    layer.play(combat('a'), null, at, 0, 0);
    expect(layer.active).toBe(false);
    expect(layer.advance(0, scale)).toBe(true);
    expect(layer.advance(FINAL_POSE_MS / 2, scale)).toBe(false);
    expect(layer.advance(FINAL_POSE_MS + 1, scale)).toBe(true);
    expect(layer.group.children).toHaveLength(0);
  });

  it('turns the attacker about on the spot by the end, and sets the defender on the point', () => {
    const layer = new CombatLayer();
    layer.motion = 'off';
    layer.play(combat('a'), null, at, 0, 0);
    layer.advance(0, scale);
    const scene = layer.group.children[0]!;
    // My two men (the attacker's), then their two: holders first, in that order.
    const [mine, , theirs] = scene.children;
    expect(mine!.rotation.y).toBeCloseTo(Math.PI / 2 + Math.PI);
    // A block, unturned: the defender does not walk home.
    expect(theirs!.rotation.y).toBeCloseTo(0);
    // Their line, the defender's, stands across the point.
    scene.updateMatrixWorld(true);
    expect(theirs!.getWorldPosition(new Vector3()).x).toBeCloseTo(0);
  });

  it('shows nothing past the floor, and veils nothing there', () => {
    const layer = new CombatLayer();
    layer.play(combat('a'), null, at, 0, 0);
    layer.advance(0, () => 0);
    expect(layer.group.children[0]!.visible).toBe(false);
    expect(layer.veils).toHaveLength(0);
  });
});

describe('CombatLayer, after the review', () => {
  it('drops a waiting point after WAIT_MS, with a whole frame to show the board again', () => {
    const layer = new CombatLayer();
    const settled: string[] = [];
    layer.onSettled = (id) => settled.push(id);
    layer.wait('a', at, ANONYMOUS_SPAN, 0);
    expect(layer.advance(10, scale)).toBe(false);
    expect(layer.veils).toHaveLength(1);
    expect(layer.advance(WAIT_MS + 1, scale)).toBe(true);
    expect(layer.veils).toHaveLength(0);
    expect(settled).toEqual(['a']);
  });

  it('clears every scene and every wait, settling each (a replay opens)', () => {
    const layer = new CombatLayer();
    const settled: string[] = [];
    layer.onSettled = (id) => settled.push(id);
    layer.play(combat('a'), null, at, 0, 0);
    layer.wait('b', at, ANONYMOUS_SPAN, 0);
    layer.advance(0, scale);
    layer.clear();
    expect(layer.group.children).toHaveLength(0);
    expect(layer.active).toBe(false);
    layer.advance(1, scale);
    expect(layer.veils).toHaveLength(0);
    expect(settled.sort()).toEqual(['a', 'b']);
  });

  it('leaves the dispatch to the stamp when one went up, and settles it when none did (#327)', () => {
    const layer = new CombatLayer();
    const settled: string[] = [];
    layer.onSettled = (id) => settled.push(id);
    layer.play(combat('a'), null, at, 0, 0);
    layer.play(combat('big', 13), null, at, 0, 0);
    // Not at once: the final pose's stamp is not born yet.
    expect(settled).toEqual([]);
    layer.advance(0, scale);
    layer.advance(stepBounds('compte-rendu').start + 1, scale);
    layer.advance(REPLAY_MS, scale);
    // Both stamped: the stamp lifting releases each dispatch, not the layer.
    expect(settled).toEqual([]);
    layer.play(combat('far'), null, at, 0, 0);
    layer.play(combat('far-big', 13), null, at, 0, 0);
    layer.advance(1000, () => 0);
    layer.advance(1000 + REPLAY_MS, () => 0);
    expect(settled.sort()).toEqual(['far', 'far-big']);
  });

  it('plays one combat of six pieces a side at most on a phone (décision de Pierre du 31/10)', () => {
    const layer = new CombatLayer();
    layer.phone = true;
    layer.play(combat('seven', 7), null, at, 0, 0);
    expect(layer.active).toBe(false);
    layer.play(combat('a'), null, at, 0, 0);
    layer.play(combat('b'), null, at, 0, 0);
    expect(layer.group.children).toHaveLength(3);
    layer.advance(0, scale);
    expect(layer.active).toBe(true);
  });

  it('is silent past the floor, where nothing shows', () => {
    const layer = new CombatLayer();
    layer.play(combat('a'), null, at, 0, 0);
    heard.length = 0;
    layer.advance(stepBounds('frappe').start + 10, () => 0);
    expect(heard).toEqual([]);
    layer.advance(stepBounds('frappe').start + 20, scale);
    expect(heard).toEqual(['fire']);
  });
});

describe('CombatLayer, the report stamp (#327)', () => {
  const reported = (layer: CombatLayer) => {
    const ids: string[] = [];
    layer.onReport = (view) => ids.push(view.combatId);
    return ids;
  };

  it('reports a played combat once, as its account begins', () => {
    const layer = new CombatLayer();
    const ids = reported(layer);
    layer.play(combat('a'), null, at, 0, 0);
    layer.advance(stepBounds('compte-rendu').start - 1, scale);
    expect(ids).toEqual([]);
    layer.advance(stepBounds('compte-rendu').start + 1, scale);
    layer.advance(stepBounds('compte-rendu').start + 500, scale);
    expect(ids).toEqual(['a']);
  });

  it('reports a combat that holds its final pose with it, cut or too big', () => {
    const layer = new CombatLayer();
    const ids = reported(layer);
    layer.play(combat('big', 13), null, at, 0, 0);
    layer.advance(0, scale);
    expect(ids).toEqual(['big']);
  });

  it('reports nothing past the floor, nor for a scene a replay cleared', () => {
    const layer = new CombatLayer();
    const ids = reported(layer);
    layer.play(combat('far', 13), null, at, 0, 0);
    layer.advance(0, () => 0);
    layer.play(combat('gone'), null, at, 0, 0);
    layer.clear();
    layer.advance(REPLAY_MS, scale);
    expect(ids).toEqual([]);
  });

  it('knows a combat shown from the first image it stands at a scale above zero', () => {
    const layer = new CombatLayer();
    const told: string[] = [];
    layer.onShown = (id) => told.push(id);
    layer.play(combat('a'), null, at, 0, 0);
    layer.wait('w', at, ANONYMOUS_SPAN, 0);
    expect(layer.shown('a')).toBe(false);
    layer.advance(0, () => 0);
    expect(layer.shown('a')).toBe(false);
    layer.advance(10, scale);
    layer.advance(20, scale);
    expect(layer.shown('a')).toBe(true);
    expect(layer.shown('w')).toBe(false);
    expect(told).toEqual(['a']);
  });
});

describe('CombatLayer, the flashes that light the night (#332)', () => {
  /** The strongest flash the layer shows over the whole account, sampled every 50 ms. */
  const peak = (motion: 'full' | 'reduced' | 'off'): number => {
    const layer = new CombatLayer();
    layer.motion = motion;
    layer.play(combat('a'), null, new Vector3(3, 0, 4), 0, 0);
    let best = 0;
    for (let t = 0; t < REPLAY_MS; t += 50) {
      layer.advance(t, scale);
      for (const flash of layer.flashes()) best = Math.max(best, flash.strength);
    }
    return best;
  };

  it('lights during the volleys, from a scene standing at its point', () => {
    expect(peak('full')).toBeGreaterThan(0.9);
    const layer = new CombatLayer();
    layer.play(combat('a'), null, new Vector3(3, 0, 4), 0, 0);
    for (let t = 0; t < REPLAY_MS && layer.flashes().length === 0; t += 50) layer.advance(t, scale);
    const [flash] = layer.flashes();
    expect(flash!.at.distanceTo(new Vector3(3, 0, 4))).toBeLessThan(flash!.reach);
  });

  it('holds a steady flash when reduced, and none when cut', () => {
    expect(peak('reduced')).toBe(1);
    expect(peak('off')).toBe(0);
  });

  it('lights nothing past the floor, where the scene is not shown', () => {
    const layer = new CombatLayer();
    layer.play(combat('a'), null, at, 0, 0);
    for (let t = 0; t < REPLAY_MS; t += 50) {
      layer.advance(t, () => 0);
      expect(layer.flashes()).toHaveLength(0);
    }
  });

  it("keeps the models' own materials in a final pose, where nobody fires", () => {
    const materials = (layer: CombatLayer, k: number): unknown[] => {
      const found: unknown[] = [];
      layer.group.children[k]!.traverse((part) => {
        const material = (part as Mesh).material;
        if (material instanceof MeshStandardMaterial) found.push(material);
      });
      return found;
    };
    const held = new CombatLayer();
    held.play(combat('a', 13), null, at, 0, 0);
    held.play(combat('b', 13), null, at, 0, 0);
    held.advance(0, scale);
    expect(materials(held, 0).some((m) => materials(held, 1).includes(m))).toBe(true);
    const playing = new CombatLayer();
    playing.play(combat('a'), null, at, 0, 0);
    playing.play(combat('b'), null, at, 0, 0);
    playing.advance(0, scale);
    expect(materials(playing, 0).some((m) => materials(playing, 1).includes(m))).toBe(false);
  });
});

describe('CombatLayer, at sea (#324)', () => {
  it('plays the ships alone: what they carry does not show, and drowns in the dispatch', () => {
    const forces = [
      { role: 'escort' as const, tier: 1 as const, troops: 1, lost: 0, routed: 0, destroyed: 0 },
    ];
    const view: ReplayView = {
      ...combat('sea'),
      mine: [...forces, { role: 'infantry', tier: 1, troops: 2, lost: 0, routed: 0, destroyed: 0 }],
      theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
      faced: { nation: 'germany', forces: forces.map((f) => ({ ...f, strength: 100 })) },
    };
    const layer = new CombatLayer();
    const told: ReplayView[] = [];
    layer.onReport = (each) => told.push(each);
    layer.play(view, 'france', at, 0, 0, 'sea');
    // Two ships, their two shots, and each its slick and its bubbles (#514).
    expect(layer.group.children[0]!.children).toHaveLength(8);
    layer.advance(stepBounds('compte-rendu').start + 1, scale);
    expect(told[0]!.mine).toHaveLength(2);
  });

  it('plays bombers striking a moored fleet: only what is carried stays off the scene', () => {
    const view: ReplayView = {
      ...combat('air'),
      mine: [{ role: 'bomber', tier: 1, troops: 2, lost: 0, routed: 0, destroyed: 0 }],
      theirs: { troops: 1, lost: 0, routed: 0, destroyed: 1 },
      faced: {
        nation: 'germany',
        forces: [
          { role: 'escort', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 1, strength: 100 },
        ],
      },
    };
    const layer = new CombatLayer();
    layer.play(view, 'france', at, 0, 0, 'sea');
    // Two bombers, one escort, their three shots, and each of the three its slick and bubbles.
    expect(layer.group.children[0]!.children).toHaveLength(12);
  });

  it('veils a waiting point by hulls of the ship it is seen by, not by a tank', () => {
    const reachOf = (span: number) => {
      const layer = new CombatLayer();
      layer.wait('w', at, span, 0);
      layer.advance(1, scale);
      return layer.veils[0]!.reach;
    };
    expect(reachOf(troopSpan('escort')) / reachOf(ANONYMOUS_SPAN)).toBeCloseTo(
      troopSpan('escort') / ANONYMOUS_SPAN,
    );
  });

  it('glows at night over its ships and a hull around them, not over its whole reach', () => {
    const escort = {
      role: 'escort' as const,
      tier: 1 as const,
      troops: 1,
      lost: 0,
      routed: 0,
      destroyed: 0,
    };
    const view: ReplayView = {
      ...combat('night'),
      mine: [escort],
      theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
      faced: { nation: 'germany', forces: [{ ...escort, strength: 100 }] },
    };
    const layer = new CombatLayer();
    layer.play(view, 'france', at, 0, 0, 'sea');
    layer.advance(stepBounds('frappe').start, scale);
    const radii: number[] = [];
    layer.lights((_, radius) => radii.push(radius));
    const ships = layer.group.children[0]!.children.slice(0, 2);
    const far = Math.max(
      ...ships.flatMap(({ position }) => [Math.abs(position.x), Math.abs(position.z)]),
    );
    expect(radii).toEqual([expect.closeTo(far + troopSpan('escort') / REPLAY_STAGE)]);
  });

  it('settles at once, with no scene, a combat at sea with a side left empty', () => {
    const view: ReplayView = {
      ...combat('carried'),
      mine: [{ role: 'infantry', tier: 1, troops: 2, lost: 0, routed: 0, destroyed: 0 }],
      theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
      faced: {
        nation: 'germany',
        forces: [
          { role: 'escort', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0, strength: 100 },
        ],
      },
    };
    const layer = new CombatLayer();
    const settled: string[] = [];
    layer.onSettled = (id) => settled.push(id);
    layer.play(view, 'france', at, 0, 0, 'sea');
    expect(layer.group.children).toHaveLength(0);
    expect(settled).toEqual(['carried']);
  });
});

describe('CombatLayer, the seats tag of a hull going down (#514)', () => {
  const escort = {
    role: 'escort' as const,
    tier: 1 as const,
    troops: 1,
    lost: 0,
    routed: 0,
    destroyed: 0,
  };
  /** My loaded cargo, shot down by their escort: mine when I lose the cargo, theirs when I shoot. */
  const drowning = (id: string, drowned = true, hulls = 1): ReplayView => ({
    ...combat(id),
    side: 'defender',
    won: false,
    atSea: true,
    mine: [{ role: 'cargo', tier: 1, troops: hulls, lost: 12, routed: 0, destroyed: hulls }],
    theirs: { troops: 1, lost: 0, routed: 0, destroyed: 0 },
    faced: { nation: 'germany', forces: [{ ...escort, strength: 100 }] },
    ...(drowned ? { drowned: { men: 100, machines: 48, seats: 9 } } : {}),
  });
  const watched = (layer: CombatLayer) => {
    const seen: Array<[string, string | null]> = [];
    layer.onSeatsTag = (view, tag) => seen.push([view.combatId, tag]);
    return seen;
  };
  const sinkingAt = stepBounds('frappe').end + 1000 + 1600;

  it('hangs it whole, strikes it through, and takes it down as the sea empties', () => {
    const layer = new CombatLayer();
    const seen = watched(layer);
    layer.play(drowning('a'), 'france', at, 0, 0, 'sea');
    for (const t of [0, 1000, sinkingAt - 1, sinkingAt, sinkingAt + 100, REPLAY_MS - 1])
      layer.advance(t, scale);
    layer.advance(REPLAY_MS, scale);
    expect(seen).toEqual([
      ['a', 'whole'],
      ['a', 'struck'],
      ['a', null],
    ]);
  });

  it('is told once per change, however many frames draw it', () => {
    const layer = new CombatLayer();
    const seen = watched(layer);
    layer.play(drowning('a'), 'france', at, 0, 0, 'sea');
    for (let t = 0; t < 4000; t += 50) layer.advance(t, scale);
    expect(seen).toEqual([['a', 'whole']]);
  });

  it('hangs none for the side that watches the hull go down: it was told nothing of the cargo', () => {
    const layer = new CombatLayer();
    const seen = watched(layer);
    layer.play(drowning('a', false), 'france', at, 0, 0, 'sea');
    for (const t of [0, sinkingAt, REPLAY_MS - 1]) layer.advance(t, scale);
    expect(seen).toEqual([]);
  });

  it('hangs one for several hulls, not one each', () => {
    const layer = new CombatLayer();
    const seen = watched(layer);
    layer.play(drowning('a', true, 2), 'france', at, 0, 0, 'sea');
    layer.advance(0, scale);
    expect(seen).toEqual([['a', 'whole']]);
  });

  it('hangs none in the final pose a phone gives past six hulls, the sea being empty there', () => {
    const layer = new CombatLayer();
    layer.phone = true;
    const seen = watched(layer);
    layer.play(drowning('a', true, 7), 'france', at, 0, 0, 'sea');
    layer.advance(0, scale);
    expect(seen).toEqual([]);
  });

  it('keeps the frozen steps whole, then empty at the account', () => {
    const layer = new CombatLayer();
    layer.motion = 'reduced';
    const seen = watched(layer);
    layer.play(drowning('a'), 'france', at, 0, 0, 'sea');
    layer.advance(stepBounds('frappe').start + 1, scale);
    layer.advance(stepBounds('compte-rendu').start + 1, scale);
    expect(seen).toEqual([
      ['a', 'whole'],
      ['a', null],
    ]);
  });

  it('stamps as the six steps end and holds the empty sea two seconds more', () => {
    const layer = new CombatLayer();
    const told: string[] = [];
    layer.onReport = (view) => told.push(view.combatId);
    layer.play(drowning('a'), 'france', at, 0, 0, 'sea');
    layer.advance(REPLAY_MS - 1, scale);
    expect(told).toEqual([]);
    layer.advance(REPLAY_MS, scale);
    expect(told).toEqual(['a']);
    layer.advance(REPLAY_MS + 1500, scale);
    expect(layer.group.children).toHaveLength(1);
    layer.advance(REPLAY_MS + 2000, scale);
    expect(layer.group.children).toHaveLength(0);
  });

  it('takes it down when the scene is cleared under it', () => {
    const layer = new CombatLayer();
    const seen = watched(layer);
    layer.play(drowning('a'), 'france', at, 0, 0, 'sea');
    layer.advance(0, scale);
    layer.clear();
    expect(seen.at(-1)).toEqual(['a', null]);
  });
});

/** **Le bombardement sur la carte** (#325) : ma batterie reste sa pile, sa pièce relayée par une
 *  copie qui tire, menée par l'horloge du combat ; la cible voit l'obus tomber et la gerbe. */
describe('CombatLayer, a bombardment', () => {
  const shelled = (side: ReplayView['side']): ReplayView => ({
    ...combat('b'),
    side,
    mine:
      side === 'attacker'
        ? [{ role: 'artillery', tier: 1, troops: 1, lost: 0, routed: 0, destroyed: 0 }]
        : [{ role: 'infantry', tier: 1, troops: 2, lost: 40, routed: 0, destroyed: 1 }],
    theirs:
      side === 'attacker'
        ? { troops: 2, lost: 40, routed: 0, destroyed: 1 }
        : { troops: 1, lost: 0, routed: 0, destroyed: 0 },
    bombardment: side === 'attacker' ? { from: { lon: 4.0, lat: 49.5 } } : {},
  });
  const battery = { at: new Vector3(-5, 0, 0), within: 1 };

  it("fires my gun from its own pile, raised to 35°, and gives it back at the scene's end", async () => {
    const layer = new CombatLayer();
    const stood: Array<string | null> = [];
    let copy: Object3D | null = null;
    layer.host = {
      batteryNear: (point, within) => (point.distanceTo(battery.at) <= within ? 'p/0' : null),
      pieceOf: () => ({ url: 'gun.glb', pose: 'emplaced', box: null }),
      standIn: (id, standing) => {
        stood.push(standing === null ? null : id);
        copy = standing;
      },
    };
    layer.play(shelled('attacker'), 'france', at, 0, 0, 'land', battery);
    layer.advance(0, scale);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stood).toEqual(['p/0']);
    new Group().add(copy!);
    layer.advance(stepBounds('frappe').start + 10, scale);
    expect(copy!.getObjectByName('barrel')!.rotation.x).toBeCloseTo(-INDIRECT_ELEVATION);
    // A veil leaves my battery standing while it fires.
    expect(layer.batteries).toEqual([battery]);
    // My gun's flash lights the night from its muzzle.
    const muzzle = copy!.getObjectsByProperty('isSprite', true)[0]!.getWorldPosition(new Vector3());
    expect(layer.flashes().some((flash) => flash.at.distanceTo(muzzle) < 1e-6)).toBe(true);
    layer.advance(REPLAY_MS, scale);
    expect(stood).toEqual(['p/0', null]);
  });

  it('gives the piece back when its pile goes from under the copy mid-scene', async () => {
    const layer = new CombatLayer();
    const stood: Array<string | null> = [];
    let drawn = true;
    layer.host = {
      batteryNear: () => 'p/0',
      pieceOf: () => (drawn ? { url: 'gun.glb', pose: 'emplaced', box: null } : null),
      standIn: (id, standing) => void stood.push(standing === null ? null : id),
    };
    layer.play(shelled('attacker'), 'france', at, 0, 0, 'land', battery);
    layer.advance(0, scale);
    await new Promise((resolve) => setTimeout(resolve, 0));
    drawn = false;
    layer.advance(stepBounds('frappe').start + 10, scale);
    expect(stood).toEqual(['p/0', null]);
    layer.advance(REPLAY_MS, scale);
    expect(stood).toEqual(['p/0', null]);
  });

  it('shells the target from nowhere: no gun, a burst rising on its pieces', () => {
    const layer = new CombatLayer();
    layer.host = {
      batteryNear: () => {
        throw new Error('the target has no battery to find');
      },
      pieceOf: () => null,
      standIn: () => {},
    };
    // Even handed a battery, the target's scene has none to fire.
    layer.play(shelled('defender'), null, at, 0, 0, 'land', battery);
    let burst = 0;
    const { start, end } = stepBounds('frappe');
    for (let t = start; t < end; t += 20) {
      layer.advance(t, scale);
      for (const flash of layer.flashes()) burst = Math.max(burst, flash.strength);
    }
    expect(burst).toBeGreaterThan(0.5);
  });
});
