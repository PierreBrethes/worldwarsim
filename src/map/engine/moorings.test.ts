import { Group, Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MOLE } from '@/emblems/kits/manifest';
import { LINE_MS, MOORING_MS, RELEASE_MS, RUN_MS } from './mooring';
import { type MooredHull, type MooringFrame, Moorings } from './moorings';

const IDENTITY: MooringFrame = {
  toBoard: (p) => p.clone(),
  toModel: (p) => p.clone(),
  metre: 1,
};
const MIRROR: MooringFrame = {
  toBoard: (p) => new Vector3(-p.x, p.y, p.z),
  toModel: (p) => new Vector3(-p.x, p.y, p.z),
  metre: 1,
};

/** A hull as the engine draws it: its marks 70 m fore and aft, 10 m either side of its middle. */
function hullAt(x: number, z: number, post: MooredHull['post'], id = `p/${post}`): MooredHull {
  const object = new Group();
  const model = new Group();
  object.add(model);
  for (const [end, dz] of [
    ['avant', -70],
    ['arriere', 70],
  ] as const)
    for (const [flank, dx] of [
      ['babord', -10],
      ['tribord', 10],
    ] as const) {
      const mark = new Object3D();
      mark.name = `fx_amarre_${end}_${flank}`;
      mark.position.set(x + dx, 5, z + dz);
      model.add(mark);
    }
  return { id, troop: `t-${id}`, site: 'port', post, object };
}

function layer(hulls: MooredHull[], frame: MooringFrame = IDENTITY) {
  const moorings = new Moorings({ hulls: () => hulls, frameOf: () => frame });
  const shown = () => moorings.group.children.filter((mesh) => mesh.visible).length;
  return { moorings, shown, hulls };
}

const MOLED = () => hullAt(MOLE.inner - 12, 190, 'mole');

describe('the lines of a hull at rest (#500)', () => {
  it('stand with it, with no order given: a view loaded cold, reduced or cut motion', () => {
    const { moorings, shown } = layer([MOLED()]);
    moorings.update(0, 0);
    expect(shown()).toBe(4);
    expect(moorings.active).toBe(false);
  });

  it('turn with a port in mirror: the same lines to the bollards, on the other side', () => {
    const { moorings, shown } = layer([hullAt(-(MOLE.inner - 12), 190, 'mole')], MIRROR);
    moorings.update(0, 0);
    expect(shown()).toBe(4);
  });

  it('draw nothing for a model that carries no marks', () => {
    const bare: MooredHull = { ...MOLED(), object: new Group() };
    const { moorings, shown } = layer([bare]);
    moorings.update(0, 0);
    expect(shown()).toBe(0);
  });

  it('tie the hull at the mole’s side to the one at the mole, and to nothing when there is none', () => {
    const second = hullAt(MOLE.inner - 12 - 24, 190, 'couple');
    const alone = layer([second]);
    alone.moorings.update(0, 0);
    expect(alone.shown()).toBe(0);
    const both = layer([MOLED(), second]);
    both.moorings.update(0, 0);
    expect(both.shown()).toBe(8);
  });
});

describe('the lines run when the hull touches (#500)', () => {
  it('stay out while its order waits, then run one after the other from the touch', () => {
    const { moorings, shown } = layer([MOLED()]);
    moorings.pending('p/mole', 0);
    moorings.update(100, 0);
    expect(shown()).toBe(0);
    moorings.dock('p/mole', 1000);
    moorings.update(1000, 0);
    expect(shown()).toBe(0);
    moorings.update(1000 + LINE_MS / 2, 0);
    expect(shown()).toBe(1);
    expect(moorings.active).toBe(true);
    moorings.update(1000 + RUN_MS, 0);
    expect(shown()).toBe(4);
    moorings.update(1000 + MOORING_MS, 0);
    expect(shown()).toBe(4);
    expect(moorings.active).toBe(false);
  });

  it('stand at rest once the wait is over and no sequence came for the hull', () => {
    const { moorings, shown } = layer([MOLED()]);
    moorings.pending('p/mole', 0);
    moorings.update(5000, 0);
    expect(shown()).toBe(4);
    const other = layer([MOLED()]);
    other.moorings.pending('p/mole', 0);
    other.moorings.settle('p/mole');
    other.moorings.update(10, 0);
    expect(other.shown()).toBe(4);
  });
});

describe('the lines are cast off before the hull leaves (#500)', () => {
  it('come back aboard from the stern, from where the hull last stood, then are gone', () => {
    const hulls = [MOLED()];
    const { moorings, shown } = layer(hulls);
    moorings.update(0, 0);
    // The order: the hull's pile is drawn no more, its pawn waits to leave.
    hulls.length = 0;
    moorings.release('t-p/mole', 100);
    moorings.update(100, 0);
    expect(shown()).toBe(4);
    moorings.update(100 + LINE_MS, 0);
    expect(shown()).toBe(3);
    moorings.update(100 + RELEASE_MS, 0);
    expect(shown()).toBe(1);
    expect(moorings.active).toBe(true);
    moorings.update(100 + RUN_MS, 0);
    expect(shown()).toBe(0);
    expect(moorings.active).toBe(false);
    moorings.update(100 + RUN_MS + 50, 0);
    expect(shown()).toBe(0);
  });

  it('stay a moment on a hull that has just left its pile, until its cast off is ordered', () => {
    const hulls = [MOLED()];
    const { moorings, shown } = layer(hulls);
    moorings.update(0, 0);
    hulls.length = 0;
    moorings.expectCastOff('t-p/mole', 0);
    moorings.update(700, 0);
    expect(shown()).toBe(4);
    expect(moorings.active).toBe(true);
    // The order comes late: the lines are cast off from where they stand, not from nothing.
    moorings.release('t-p/mole', 0);
    moorings.update(800, 0);
    // 800 ms on, the stern's two lines are aboard and the stem's second is half in.
    expect(shown()).toBe(2);
    // A hull that was only gone, no order for it, lets them go.
    const gone = layer([MOLED()]);
    gone.moorings.update(0, 0);
    gone.hulls.length = 0;
    gone.moorings.update(5000, 0);
    expect(gone.shown()).toBe(0);
  });

  it('are gone with a hull no departure is expected for: reduced, cut, a pin, a hull lost', () => {
    const hulls = [MOLED()];
    const { moorings, shown } = layer(hulls);
    moorings.update(0, 0);
    hulls.length = 0;
    moorings.update(100, 0);
    expect(shown()).toBe(0);
    // An expected departure that plays nothing after all lets them go too.
    const other = [MOLED()];
    const second = layer(other);
    second.moorings.update(0, 0);
    other.length = 0;
    second.moorings.expectCastOff('t-p/mole', 0);
    second.moorings.forget('t-p/mole');
    second.moorings.update(100, 0);
    expect(second.shown()).toBe(0);
  });

  it('cast the second hull off when the one at the mole leaves and it is promoted to its post', () => {
    const first = MOLED();
    const side = hullAt(MOLE.inner - 36, 190, 'couple', 'p/side');
    const hulls = [first, side];
    const { moorings, shown } = layer(hulls);
    moorings.update(0, 0);
    expect(shown()).toBe(8);
    // The pass that sends the first hull away promotes the second, in its berth beside the mole.
    hulls.splice(0, 2, { ...side, post: 'mole' });
    moorings.pending('p/side', 50);
    moorings.release('t-p/mole', 50);
    moorings.releaseBeside('port', 50);
    moorings.update(50, 0);
    // Only the lines coming aboard: none runs from it to a bollard before it is hauled up.
    expect(shown()).toBe(8);
    moorings.update(50 + RUN_MS, 0);
    expect(shown()).toBe(0);
  });

  it('draw at least two pixels wide, whatever the distance', () => {
    const { moorings } = layer([MOLED()]);
    moorings.update(0, 0.5);
    const widths = moorings.group.children.map((mesh) => mesh.scale.x);
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it('let the hull at the side go with the one at the mole', () => {
    const hulls = [MOLED(), hullAt(MOLE.inner - 36, 190, 'couple')];
    const { moorings, shown } = layer(hulls);
    moorings.update(0, 0);
    hulls.shift();
    moorings.release('t-p/mole', 50);
    moorings.releaseBeside('port', 50);
    moorings.update(50, 0);
    expect(shown()).toBe(8);
    moorings.update(50 + RUN_MS, 0);
    expect(shown()).toBe(0);
  });

  it('lend nothing to a hull no one cast off (a view loaded cold)', () => {
    const { moorings, shown } = layer([]);
    moorings.release('nobody', 0);
    moorings.update(10, 0);
    expect(shown()).toBe(0);
  });
});
