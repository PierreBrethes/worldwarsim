import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { AIRFIELD } from '@/emblems/kits/manifest';
import { troopMetres } from '@/domain/piece-size';
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
  landingLead,
  THREAD_GAP_M,
  landingOrder,
  QUEUE_MAX,
  queueLeads,
  takeoffLead,
  launchLead,
  moors,
  playable,
  restAt,
  retourLead,
  craneSequence,
  slipSequence,
  alongside,
  UNDOCK_STAGGER_MS,
  undockLead,
} from './site-ways';
import { FIL_STRETCH_MS, formation, landing, parkingZ, takeoff } from './timelines/airfield';
import { launch } from './timelines/port';
import { craneAt, craneParts, craneVisit, PORT_CRANE, craneToward } from './timelines/at-rest';

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
  it('stays lit as long as its last queued plane asks (#478)', () => {
    let end = 3000;
    const lit = airfieldSequence(() => end);
    expect(lit.ms).toBe(3000);
    end = 9000;
    expect(lit.ms).toBe(9000);
  });

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

const [RIGHT, LEFT] = AIRFIELD.lanes as [number, number];
const plane = (side: 0 | 1, z: number, name = '') => ({ x: side === 0 ? RIGHT : LEFT, z, name });
const names = (parts: ReadonlyArray<{ name: string }>) => parts.map(({ name }) => name);

describe('planes of a pile take off and land in a queue (#478)', () => {
  // The right lane is the nearer to the runway's free end.
  const cases = [
    {
      what: 'two fighters in different lanes: the right lane first',
      planes: [plane(1, 60, 'L60'), plane(0, 40, 'R40')],
      out: ['R40', 'L60'],
    },
    {
      what: 'two fighters in one lane: the place in front first',
      planes: [plane(0, 40, 'R40'), plane(0, 60, 'R60')],
      out: ['R60', 'R40'],
    },
    {
      what: 'a bomber alone in the left lane leaves after the right lane',
      planes: [plane(1, 50, 'bomber'), plane(0, 60, 'R60'), plane(0, 40, 'R40')],
      out: ['R60', 'R40', 'bomber'],
    },
  ];
  for (const { what, planes, out } of cases)
    it(`${what}; it lands in the reverse order`, () => {
      expect(names(inFormationOrder(planes))).toEqual(out);
      expect(names(landingOrder(planes))).toEqual([...out].reverse());
    });

  it('starts each plane when the one before has left the ground, the gap kept to what is left', () => {
    // 4 s to the runway and 10 s to leave the ground for each: the next is aligned as it leaves.
    const slot = { align: 4000, free: 10000 };
    expect(queueLeads([slot, slot, slot])).toEqual([0, 6000, 12000]);
    // Already further along than the one before leaves: no wait, never ahead of the one before.
    expect(
      queueLeads([
        { align: 0, free: 3000 },
        { align: 9000, free: 12000 },
      ]),
    ).toEqual([0, 0]);
  });

  it('counts only the departures cued together, and sends the ones past the queue by their thread', () => {
    const at = (side: 0 | 1, z: number, since = 0) => ({
      ...plane(side, z),
      since,
      align: 4000,
      free: 10000,
    });
    const mine = at(1, 60);
    const lead = (...args: Parameters<typeof takeoffLead>) => takeoffLead(...args)?.lead ?? null;
    expect(lead(at(0, 60), [mine])).toBe(0);
    expect(lead(mine, [at(0, 60)])).toBe(6000);
    expect(lead(mine, [at(0, 60, DEPARTURE_WINDOW_MS + 1)])).toBe(0);
    const line = Array.from({ length: QUEUE_MAX }, (_, k) => at(0, 100 - 10 * k));
    expect(takeoffLead(mine, line)).toBeNull();
    expect(takeoffLead(line[QUEUE_MAX - 1]!, [...line.slice(0, -1), mine])).toEqual({
      lead: 6000 * (QUEUE_MAX - 1),
      turn: QUEUE_MAX - 1,
    });
  });

  it('waits for the runway a plane cued earlier still holds, and for none it has left', () => {
    const slot = { align: 4000, free: 10000 };
    expect(queueLeads([slot], 0)).toEqual([0]);
    expect(queueLeads([slot], 9000)).toEqual([5000]);
    expect(queueLeads([slot, slot], 9000)).toEqual([5000, 11000]);
    expect(queueLeads([slot], 3000)).toEqual([0]);
    const mine = { ...plane(0, 60), since: 0, ...slot };
    expect(takeoffLead(mine, [], 9000)).toEqual({ lead: 5000, turn: 0 });
  });

  it('sends the plane past the queue to stand at its place when it lands', () => {
    const slot = { align: 4000, free: 10000 };
    const full = Array.from({ length: QUEUE_MAX }, () => slot);
    expect(landingLead(full.slice(0, -1), slot)).toBe(6000 * (QUEUE_MAX - 1));
    expect(landingLead(full, slot)).toBeNull();
    expect(landingLead([], slot, 7000)).toBe(3000);
  });
});

describe('a queue of the real tracks (#478)', () => {
  const roles = ['fighter', 'bomber', 'airTransport'] as const;
  const spots = roles.flatMap((role) =>
    ([RIGHT, LEFT] as const).map((x) => ({ role, x, z: parkingZ(troopMetres(role) / 2) })),
  );
  const pairs = spots.flatMap((a, i) =>
    spots.flatMap((b, j) => (i === j ? [] : [[a, b] as const])),
  );

  it('takes off with the runway free: each aligned only once the one before is off the ground', () => {
    for (const [a, b] of pairs) {
      const [first, second] = [takeoff(a.role, a), takeoff(b.role, b)];
      expect(first.leaves).toBeGreaterThan(first.ready);
      const [, lead] = queueLeads([
        { align: first.ready, free: first.leaves },
        { align: second.ready, free: second.leaves },
      ]);
      expect(lead! + second.ready).toBeGreaterThanOrEqual(first.leaves);
      expect(lead! + second.ready - first.leaves).toBeLessThan(second.ready);
    }
  });

  it('lands with the runway free: each touches once the one before has left it', () => {
    for (const [a, b] of pairs) {
      const [first, second] = [landing(a.role, a), landing(b.role, b)];
      expect(first.clear).toBeGreaterThan(first.touch);
      const [, lead] = queueLeads([
        { align: first.touch, free: first.clear },
        { align: second.touch, free: second.clear },
      ]);
      expect(lead! + second.touch).toBeGreaterThanOrEqual(first.clear);
    }
  });

  it('trails its rank on the thread, then meets its pawn at the thread start without a jump', () => {
    const at = spots[0]!;
    const track = (back: number) => takeoff(at.role, at, back);
    const x = (back: number, t: number) => track(back).at(t).x;
    const last = (back: number) => track(back).ms - FIL_STRETCH_MS;
    // Before the last stretch the ranks are `THREAD_GAP_M` apart; at the end they stand together.
    expect(x(THREAD_GAP_M, last(THREAD_GAP_M)) - x(0, last(0))).toBeCloseTo(THREAD_GAP_M, 3);
    expect(x(THREAD_GAP_M, track(THREAD_GAP_M).ms)).toBeCloseTo(x(0, track(0).ms), 6);
    expect(track(0).ready).toBe(track(THREAD_GAP_M).ready);
  });

  it('closes its gap with no jump of speed, in or out of the last stretch', () => {
    const at = spots[0]!;
    const back = 2 * THREAD_GAP_M;
    const track = takeoff(at.role, at, back);
    const plain = takeoff(at.role, at, 0);
    // m/s, between two steps of 5 ms.
    const speed = (t: number) => Math.abs(track.at(t + 5).x - track.at(t).x) / 0.005;
    const entry = track.ms - FIL_STRETCH_MS;
    // (a plane that decelerates loses about 0.5 m/s in this time; a linear catch-up jumped by 50.)
    expect(Math.abs(speed(entry + 5) - speed(entry - 10))).toBeLessThan(1);
    // Out of it, as fast as the plane that had no gap to close.
    const out = track.ms - 20;
    const gone = (t: number) => Math.abs(plain.at(t + 5).x - plain.at(t).x) / 0.005;
    expect(Math.abs(speed(out) - gone(plain.ms - 20))).toBeLessThan(1);
  });
});

describe('planes formed together leave in turn (#487)', () => {
  it('sends the most advanced place first, and each a stagger after the one before', () => {
    const order = inFormationOrder([plane(1, 20), plane(1, 60), plane(1, 40)]);
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

describe('hulls that come home together dock one after the other (#477)', () => {
  it('waits for the hulls docked before, as a launch does', () => {
    expect(retourLead([])).toBe(0);
    expect(retourLead([{ ms: 10900 }, { ms: 9000 }])).toBe(19900);
    expect(retourLead([{ ms: 15000 }])).toBe(launchLead([{ ms: 15000 }]));
  });
});

describe('the crane comes to the hull that touches the mole (#477)', () => {
  const { rig, ring } = PORT_CRANE;
  const cargo = { post: 'mole', role: 'cargo', length: 110, yaw: Math.PI } as const;
  /** Where a cargo's middle rests at the mole: its stem 3 m off the quay. */
  const mole = { x: 60.5, z: 105 + 3 + 55 };
  const touch = 11000;
  const sequence = (
    hull: Parameters<typeof craneSequence>[0] = { ...cargo, ...mole },
    loop0 = 13,
  ) => craneSequence(hull, touch, loop0)!;
  /** A pose as plain numbers, to 6 digits: the hull's yaw of π leaves a sine's dust. */
  const plain = (pose: unknown) =>
    JSON.parse(
      JSON.stringify(pose, (_, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 || 0 : v)),
    );
  const parts = (state: ReturnType<typeof craneAt>) => plain(craneParts(rig, state));
  const posed = (seq: Sequence, t: number) => plain(seq.at(t));

  it('plays for the hull at the mole, and for no other: at its side, in the roads, or none', () => {
    expect(sequence()).not.toBeNull();
    for (const post of ['couple', 'roads', null] as const)
      expect(craneSequence({ ...cargo, ...mole, post }, touch, 13)).toBeNull();
  });

  it('keeps its loop out of reach of a hull the jib cannot serve', () => {
    expect(craneSequence({ ...cargo, ...mole, x: 20 }, touch, 13)).toBeNull();
  });

  it('goes on with the loop until the hull touches, with no leap where it takes over', () => {
    const seq = sequence();
    expect(posed(seq, 0)).toEqual(parts(craneAt(13, rig)));
    expect(posed(seq, 4000)).toEqual(parts(craneAt(17, rig)));
    expect(posed(seq, touch)).toEqual(parts(craneAt(13 + touch / 1000, rig)));
  });

  it("comes over the stem the hook is 6 m abaft, and ends at the loop's rest", () => {
    const seq = sequence();
    const deck = { x: mole.x + 0 - ring.x, z: mole.z - 55 + 6 - ring.z };
    const to = craneToward(rig, deck)!;
    const visit = craneVisit(rig, craneAt(13 + touch / 1000, rig), to, 1);
    expect(seq.ms).toBeCloseTo(touch + visit.ms, 6);
    expect(posed(seq, touch + 3900)).toEqual(parts(visit.at(3900)));
    expect(posed(seq, seq.ms)).toEqual(parts(craneAt(0, rig)));
    expect(seq.pool).toBe('site');
    expect(seq.family).toBe('port');
  });

  it('stands at rest until the touch when the loop did not live there', () => {
    const seq = craneSequence({ ...cargo, ...mole }, touch, null)!;
    expect(posed(seq, 5000)).toEqual(parts(craneAt(0, rig)));
    expect(posed(seq, touch)).toEqual(parts(craneAt(0, rig)));
  });

  it('plays with the slip of a launch, each its own parts', () => {
    const first = launch('cargo', 15, 3, { x: 10, z: 175, yaw: Math.PI });
    const slip = slipSequence([{ lead: 0, ...first }]);
    const both = alongside(slip, sequence());
    expect(both.ms).toBe(Math.max(slip.ms, sequence().ms));
    const pose = both.at(2000);
    expect(Object.keys(pose)).toEqual(expect.arrayContaining(['coque_cale', 'accore_1', 'cable']));
  });
});
