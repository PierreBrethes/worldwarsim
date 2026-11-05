import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AIRFIELD } from '@/emblems/kits/manifest';
import type { Sequence } from './sequences';
import {
  airfieldSequence,
  arrivalRings,
  arriving,
  delayed,
  departs,
  DEPARTURE_WINDOW_MS,
  doorsOf,
  FORMATION_STAGGER_MS,
  formationLead,
  haulSequence,
  HAUL_LEAD_MS,
  homing,
  inFormationOrder,
  launchLead,
  moors,
  playable,
  restAt,
  slipSequence,
  UNDOCK_STAGGER_MS,
  undockLead,
} from './site-ways';
import { formation } from './timelines/airfield';
import { launch } from './timelines/port';

const still: Sequence = { ms: 1000, at: () => ({ root: { travel: [1, 0, 0] } }) };

describe('a piece that waits its turn (#487)', () => {
  it('stands unseen until its lead has passed, then plays from its start', () => {
    const wait = delayed(still, 2000);
    expect(wait.ms).toBe(3000);
    expect(wait.at(0).root?.fade).toBe(0);
    expect(wait.at(1999).root?.fade).toBe(0);
    expect(wait.at(2000).root?.fade).toBeUndefined();
    expect(wait.at(2500).root?.travel).toEqual([1, 0, 0]);
  });

  it('is the sequence itself with no lead', () => {
    expect(delayed(still, 0)).toBe(still);
  });
});

const lane = AIRFIELD.lanes[0];
const out = (to: number) => formation('fighter', { x: lane, z: to }, 5.5);

describe('the doors of a hangar, one set for all its planes (#487)', () => {
  const [a, b] = [out(40), out(30)];
  const lead = 2500;
  const planes = [
    { lead: 0, doors: a.doors, closing: a.closing },
    { lead, doors: b.doors, closing: b.closing },
  ];
  const open = doorsOf(planes);
  const end = lead + b.ms;

  it('opens at the first plane and stays open until the last is clear', () => {
    expect(open(0)).toBe(0);
    for (let t = 1500; t < lead + b.closing; t += 50) expect(open(t)).toBeCloseTo(1, 6);
  });

  it('shuts behind the last plane', () => {
    expect(open(end)).toBe(0);
    expect(open(end + 1000)).toBe(0);
  });

  it('is the doors of its own plane when it is alone', () => {
    const alone = doorsOf([planes[0]!]);
    for (const t of [0, 700, 1500, a.closing + 400, a.ms])
      expect(alone(t)).toBeCloseTo(a.doors(t), 9);
  });
});

describe('the airfield with a door set per hangar (#487)', () => {
  it('moves each hangar its doors name, the right one and the left one', () => {
    const both = airfieldSequence(3000, [
      { lane: AIRFIELD.lanes[0], open: () => 1 },
      { lane: AIRFIELD.lanes[1], open: () => 1 },
    ]);
    const names = Object.keys(both.at(1000));
    expect(names).toContain('porte_gauche_1');
    expect(names).toContain('porte_gauche_1_b');
  });
});

describe('the slip with a hull launched after another (#487)', () => {
  const [first, second] = [
    launch('cargo', 18, 3, { x: 10, z: 175, yaw: Math.PI }),
    launch('cargo', 18, 3, { x: 0, z: 175, yaw: Math.PI }),
  ];
  const lead = first.ms;
  const slip = slipSequence([
    { lead: 0, ...first },
    { lead, ...second },
  ]);

  it('lasts until the last hull is hauled', () => {
    expect(slip.ms).toBe(lead + second.ms);
  });

  it('dresses a new hull on the slip when the second starts: its shores stand again', () => {
    expect(slip.at(lead - 1)['accore_1' as never]).toMatchObject({
      turn: [0, 0, expect.any(Number)],
    });
    expect(slip.at(lead - 1)['accore_1' as never]!.turn![2]).not.toBe(0);
    expect(slip.at(lead)['accore_1' as never]!.turn![2]).toBeCloseTo(0, 9);
    expect(slip.at(lead)['coque_cale' as never]!.fade).toBe(1);
  });
});

const away: Sequence = { ms: 1000, at: () => ({ root: { travel: [40, 30, -20], heading: 1 } }) };

describe('a take-off whose thread leaves from its pile (#269)', () => {
  it('plays as it is, then flies home to the pawn it ends on', () => {
    const home = homing(away);
    expect(home.at(0).root?.travel).toEqual([40, 30, -20]);
    expect(home.ms).toBe(1000);
    for (const v of home.at(1000).root?.travel ?? [1]) expect(v).toBeCloseTo(0);
  });
});

describe('a landing whose thread came in to its pile (#269)', () => {
  it('starts where the pawn stood, then joins its track', () => {
    const land = arriving(away, [-5, 0, 7]);
    expect(land.at(0).root?.travel).toEqual([-5, 0, 7]);
    expect(land.at(1000).root?.travel).toEqual([40, 30, -20]);
    expect(land.ms).toBe(1000);
  });
});

describe('a thread moored to its runway end or offshore (#269, #270)', () => {
  const at = { x: 0, z: 0 };
  const end = { x: 1, z: 0 };
  it('moors a long flight, and a thread with no far end', () => {
    expect(moors(at, end, { x: 3, z: 0 }, false)).toBe(true);
    expect(moors(at, end, null, false)).toBe(true);
  });
  it('leaves a short flight at its point', () => {
    expect(moors(at, end, { x: 2.9, z: 0 }, false)).toBe(false);
  });
  it('never moors in a theatre (Blitz)', () => {
    expect(moors(at, end, { x: 30, z: 0 }, true)).toBe(false);
    expect(moors(at, end, null, true)).toBe(false);
  });
});

describe('a departure (#269, #270)', () => {
  it('plays for a plane whatever its flight, for a hull only moored', () => {
    expect(departs(true, false)).toBe(true);
    expect(departs(false, true)).toBe(true);
    expect(departs(false, false)).toBe(false);
  });
});

describe('planes formed together leave in turn (#487)', () => {
  it('sends the most advanced place first, and each a stagger after the one before', () => {
    const order = inFormationOrder([{ z: 20 }, { z: 60 }, { z: 40 }]);
    expect(order.map(({ z }) => z)).toEqual([60, 40, 20]);
    expect([0, 1, 2].map(formationLead)).toEqual([0, 1, 2].map((n) => n * FORMATION_STAGGER_MS));
  });

  it('launches a hull when the ones before it are moored', () => {
    expect(launchLead([])).toBe(0);
    expect(launchLead([{ ms: 15000 }, { ms: 9000 }])).toBe(24000);
  });
});

describe('hulls putting to sea together, the outer one first (#487)', () => {
  const at = (post: 'mole' | 'couple' | 'roads' | null, since = 0) => ({ post, since });

  it('waits for the roads and the side before the mole, and the roads for none', () => {
    expect(undockLead(at('roads'), [at('couple'), at('mole')])).toBe(0);
    expect(undockLead(at('couple'), [at('roads'), at('mole')])).toBe(UNDOCK_STAGGER_MS);
    expect(undockLead(at('mole'), [at('roads'), at('couple')])).toBe(2 * UNDOCK_STAGGER_MS);
  });

  it('puts the roads before the mole even though both lie at the same distance from it', () => {
    expect(undockLead(at('mole'), [at('roads')])).toBe(UNDOCK_STAGGER_MS);
    expect(undockLead(at('roads'), [at('mole')])).toBe(0);
  });

  it('counts only the hulls cued within the window, and none for a hull with no post', () => {
    expect(undockLead(at('mole', 0), [at('roads', DEPARTURE_WINDOW_MS + 1)])).toBe(0);
    expect(undockLead(at('mole', 0), [at('roads', DEPARTURE_WINDOW_MS - 1)])).toBe(
      UNDOCK_STAGGER_MS,
    );
    expect(undockLead(at(null), [at('roads')])).toBe(0);
    expect(undockLead(at('mole'), [at(null)])).toBe(0);
  });
});

describe('where a departure starts, and what a cue still waits for (#487)', () => {
  const rest = { x: -3, z: 40, yaw: 0 };
  it('starts from the remembered rest at this site, else from the old fixed berth', () => {
    expect(restAt({ site: 'a', rest }, 'a')).toBe(rest);
    expect(restAt({ site: 'a', rest }, 'b')).toBeNull();
    expect(restAt(null, 'a')).toBeNull();
  });

  it('waits while a piece is not laid out, skips one with no place, retries nothing for it', () => {
    expect(playable(['ready', 'wait'])).toBeNull();
    expect(playable(['ready', 'unposted', 'ready'])).toEqual([0, 2]);
    expect(playable(['unposted'])).toEqual([]);
  });

  it('rings each arriving piece at its place, by its half length', () => {
    const [ring] = arrivalRings([{ role: 'cargo', at: 'here' }], 2);
    expect(ring).toEqual({ at: 'here', radius: 65 * 2 });
  });
});

describe('the hull at the side hauled up to the mole (#487)', () => {
  const frame = {
    toBoard: (p: Vector3) => p.clone(),
    toModel: (p: Vector3) => p.clone(),
  };
  const [from, to] = [
    { x: 40, z: 100, yaw: Math.PI },
    { x: 60, z: 100, yaw: Math.PI },
  ];
  const way = haulSequence(frame, 'cargo', from, to, new Vector3(to.x, 0, to.z));

  it('holds where it lay, in view, while the mole hull puts to sea', () => {
    for (const t of [0, HAUL_LEAD_MS - 1]) {
      expect(way.at(t).root?.travel).toEqual([from.x - to.x, 0, 0]);
      expect(way.at(t).root?.fade).toBeUndefined();
    }
  });

  it('is hauled across, and ends at the mole', () => {
    const [x] = way.at(way.ms).root!.travel!;
    expect(x).toBeCloseTo(0, 6);
    expect(way.ms).toBeGreaterThan(HAUL_LEAD_MS);
  });
});
