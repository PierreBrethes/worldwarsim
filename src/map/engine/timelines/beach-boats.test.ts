import { Euler, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { isRigPart } from '@/emblems/rigs';
import { beachBoatsOf, type Assault } from './beach-boats';

const DEG = Math.PI / 180;
/** The storyboard's hull at the board's origin, a metre of it 0.01 of the board; the beach lies
 *  to its left (+x), the stern at z = -45; two squads of three, men 0.02 tall. */
const squad = (z: number, x = 0.36): Assault['squads'][number] => ({
  men: [
    [x, z],
    [x + 0.03, z - 0.02],
    [x + 0.03, z + 0.02],
  ],
  heading: Math.PI / 2,
  landing: [0.3, z],
});
const scene = (over: Partial<Assault> = {}): Assault => ({
  hull: { at: [0, 0], heading: 0, metre: 0.01, astern: -45 },
  boats: [
    { node: 'boat_left', rest: [7.18, 6.5, -10.3] },
    { node: 'boat_right', rest: [-7.18, 6.5, -10.3] },
  ],
  squads: [squad(-0.16), squad(-0.1)],
  man: 0.02,
  ...over,
});

const bowHeight = (turn: readonly [number, number, number]): number =>
  new Vector3(0, 0, 3.8).applyEuler(new Euler(...turn, 'XYZ')).y;
const boat = (a: ReturnType<typeof beachBoatsOf>, node: 'boat_left' | 'boat_right', t: number) => {
  const pose = a.cargo!.at(t)[node]!;
  const rest = node === 'boat_left' ? [7.18, 6.5, -10.3] : [-7.18, 6.5, -10.3];
  const s = pose.shift ?? [0, 0, 0];
  return {
    at: [rest[0]! + s[0], rest[1]! + s[1], rest[2]! + s[2]] as const,
    // How high the bow stands over the stern's level, once the turn is read as the pose is.
    bowUp: bowHeight(pose.turn ?? [0, 0, 0]),
  };
};
const times = (ms: number) => Array.from({ length: Math.ceil(ms / 20) }, (_, k) => k * 20);

describe('beachBoatsOf, the boats (#482)', () => {
  it('hangs both boats at their davits, and is the rest pose at its end', () => {
    const a = beachBoatsOf(scene());
    const cargo = a.cargo!;
    expect(cargo.family).toBe('cargo');
    expect(boat(a, 'boat_left', 0).at).toEqual([7.18, 6.5, -10.3]);
    expect(cargo.at(cargo.ms)).toEqual({});
    expect(cargo.at(-1)).toEqual({});
    for (const t of times(cargo.ms))
      for (const name of Object.keys(cargo.at(t))) expect(isRigPart('cargo', name)).toBe(true);
  });

  it('swings each boat out on its own side, then lowers it to the water', () => {
    const a = beachBoatsOf(scene());
    const left = boat(a, 'boat_left', 700);
    const right = boat(a, 'boat_right', 1000);
    expect(left.at[0]).toBeCloseTo(7.18 + 2.5, 5);
    expect(right.at[0]).toBeCloseTo(-7.18 - 2.5, 5);
    expect(left.at[1]).toBe(6.5);
    expect(boat(a, 'boat_left', 2000).at[1]).toBeCloseTo(-0.25, 5);
  });

  it('sends the flank nearest the shore straight, the other round the stern', () => {
    const a = beachBoatsOf(scene());
    const zs = (node: 'boat_left' | 'boat_right') =>
      times(a.cargo!.ms).map((t) => boat(a, node, t).at[2]);
    // The direct one never goes behind its davit's depth; the other passes the stern (z = -45).
    expect(Math.min(...zs('boat_left'))).toBeGreaterThan(-45);
    expect(Math.min(...zs('boat_right'))).toBeLessThanOrEqual(-45);
    // Both end where the shore is: the same side (+x) as the squads' landings.
    const grounded = (node: 'boat_left' | 'boat_right') =>
      Math.max(...times(a.cargo!.ms).map((t) => boat(a, node, t).at[0]));
    expect(grounded('boat_left')).toBeCloseTo(30, 0);
    expect(grounded('boat_right')).toBeCloseTo(30, 0);
  });

  it('flips the sides when the shore is on the other flank', () => {
    const flipped = scene({
      squads: [squad(-0.16, -0.36), squad(-0.1, -0.36)].map((s) => ({
        ...s,
        landing: [-0.3, s.landing[1]],
      })),
    });
    const a = beachBoatsOf(flipped);
    const zs = (node: 'boat_left' | 'boat_right') =>
      times(a.cargo!.ms).map((t) => boat(a, node, t).at[2]);
    expect(Math.min(...zs('boat_right'))).toBeGreaterThan(-45);
    expect(Math.min(...zs('boat_left'))).toBeLessThanOrEqual(-45);
  });

  it('grounds with the bow up 4 degrees, then goes back to its davit', () => {
    const a = beachBoatsOf(scene());
    const pitched = times(a.cargo!.ms).filter(
      (t) => Math.abs(boat(a, 'boat_left', t).bowUp - 3.8 * Math.sin(4 * DEG)) < 1e-9,
    );
    expect(pitched.length).toBeGreaterThan(10);
    // It never pitches while it sails or hangs.
    expect(boat(a, 'boat_left', 2000).bowUp).toBeCloseTo(0, 9);
    expect(boat(a, 'boat_left', a.cargo!.ms - 1).at[0]).toBeCloseTo(7.18, 0);
  });

  it('takes the landing where it is given, not the storyboard coordinates', () => {
    const far = beachBoatsOf(
      scene({
        squads: [squad(-0.16), squad(-0.1)].map((s) => ({ ...s, landing: [0.5, s.landing[1]] })),
      }),
    );
    const max = Math.max(...times(far.cargo!.ms).map((t) => boat(far, 'boat_left', t).at[0]));
    expect(max).toBeCloseTo(50, 0);
  });
});

describe('beachBoatsOf, the men (#482)', () => {
  const grounded = (a: ReturnType<typeof beachBoatsOf>) =>
    times(a.cargo!.ms).find((t) => boat(a, 'boat_left', t).bowUp > 0.1)!;

  it('hides them aboard, shows them one by one at the bow of the grounded boat, and ends at rest', () => {
    const a = beachBoatsOf(scene());
    const first = a.squads[0]!;
    const appear = (k: number) =>
      times(first.ms).find((t) => (first.at(t)[`man_${k}`]?.fade ?? 1) > 0)!;
    expect(first.at(0)['man_0']?.fade).toBe(0);
    expect(appear(0)).toBeGreaterThanOrEqual(grounded(a));
    expect(appear(0)).toBeLessThan(appear(1));
    expect(appear(1)).toBeLessThan(appear(2));
    expect(first.at(first.ms)).toEqual({});
  });

  it('has each man hop from the boat to the sand, then walk to his place and face his squad', () => {
    const a = beachBoatsOf(scene());
    const s = a.squads[0]!;
    let hopped = false;
    let strode = false;
    for (const t of times(s.ms)) {
      const m = s.at(t)['man_0'];
      if (m === undefined) continue;
      if ((m.hop ?? 0) > 0.5) {
        hopped = true;
        expect(m.travel![1]).toBeGreaterThan(0);
      }
      if (m.stride !== undefined && m.hop === undefined) strode = true;
    }
    expect(hopped && strode).toBe(true);
    const last = s.at(s.ms - 1)['man_2']!;
    expect(Math.hypot(last.travel![0], last.travel![2])).toBeLessThan(0.02);
    expect(last.heading).toBeCloseTo(Math.PI / 2, 1);
  });

  it('lets the boat return only once its men have jumped', () => {
    const a = beachBoatsOf(scene());
    const s = a.squads[0]!;
    const lastHop = Math.max(
      ...times(s.ms).filter((t) => [0, 1, 2].some((k) => (s.at(t)[`man_${k}`]?.hop ?? 0) > 0)),
    );
    const leaves = times(a.cargo!.ms).find(
      (t) => t > grounded(a) && boat(a, 'boat_left', t).bowUp < 0.1,
    )!;
    expect(leaves).toBeGreaterThanOrEqual(lastHop);
  });

  it('lands the squads past two all at once, at their places, when the first boat grounds', () => {
    const a = beachBoatsOf(scene({ squads: [squad(-0.16), squad(-0.1), squad(-0.04)] }));
    const extra = a.squads[2]!;
    const g = grounded(a);
    expect(extra.at(0)['man_1']).toEqual({ fade: 0 });
    expect(extra.at(g - 40)['man_1']).toEqual({ fade: 0 });
    expect(extra.ms).toBeGreaterThanOrEqual(g - 20);
    expect(extra.ms).toBeLessThanOrEqual(g + 20);
    expect(extra.at(extra.ms)).toEqual({});
    // No boat carries it: the cargo's own sequence does not wait on it.
    expect(a.settled).toBe(Math.max(a.cargo!.ms, a.squads[0]!.ms, a.squads[1]!.ms));
  });

  it('puts one boat to water for the junk, and the rest of the squads ashore at once', () => {
    const a = beachBoatsOf(scene({ boats: [{ node: 'boat_left', rest: [7.18, 6.5, -10.3] }] }));
    for (const t of times(a.cargo!.ms)) expect(a.cargo!.at(t)['boat_right']).toBeUndefined();
    expect(a.squads[1]!.at(0)['man_0']).toEqual({ fade: 0 });
    expect(a.squads[1]!.ms).toBeLessThan(a.squads[0]!.ms);
  });
});

describe('beachBoatsOf, reduced and off motion (#482)', () => {
  it('puts the pile on the beach with a ring of ink there, 0.6 s, when reduced', () => {
    const a = beachBoatsOf(scene(), 'reduced');
    expect(a.cargo).toBeNull();
    expect(a.squads).toEqual([]);
    // On the men, not on the boats' landing: the mean of the six places.
    expect(a.ring!.ms).toBe(600);
    expect(a.ring!.at[0]).toBeCloseTo(0.38, 9);
    expect(a.ring!.at[1]).toBeCloseTo(-0.13, 9);
    expect(a.settled).toBe(600);
  });

  it('puts the pile on the beach and nothing else when off', () => {
    const a = beachBoatsOf(scene(), 'off');
    expect(a).toEqual({ cargo: null, squads: [], ring: null, settled: 0 });
  });

  it('draws no ring when the motion is full', () => {
    expect(beachBoatsOf(scene()).ring).toBeNull();
  });
});

describe('beachBoatsOf, the hull turned and the odd cases (#482)', () => {
  const REST_L: [number, number, number] = [7.18, 6.5, -10.3];

  it('lifts the bow whatever way the boat faces: broadside to the hull as along it', () => {
    // From the davit at z = -10.3 to a landing at the same depth, the boat faces +x (yaw 90 degrees).
    const side = beachBoatsOf(scene({ squads: [{ ...squad(-0.103), landing: [0.3, -0.103] }] }));
    const lifted = (a: ReturnType<typeof beachBoatsOf>) =>
      Math.max(...times(a.cargo!.ms).map((t) => boat(a, 'boat_left', t).bowUp));
    expect(lifted(side)).toBeCloseTo(3.8 * Math.sin(4 * DEG), 9);
    // And along the hull (landing dead astern of the davit), as before.
    const along = beachBoatsOf(
      scene({ squads: [{ ...squad(-0.5), landing: [0.0718 + 0.025, -0.5] }] }),
    );
    expect(lifted(along)).toBeGreaterThan(0.2);
  });

  it('starts every man ashore at once, and settles at 0, when there is no boat', () => {
    const a = beachBoatsOf(scene({ boats: [] }));
    expect(a.cargo).toBeNull();
    expect(a.settled).toBe(0);
    expect(a.squads.map((s) => s.ms)).toEqual([0, 0]);
    expect(a.squads[0]!.at(0)).toEqual({});
  });

  it('turns the hull a quarter: the first jump starts at the bow of the boat, on the board', () => {
    // heading pi/2: a hull's (x, z) is the board's (z, -x) by `metre`. The landing is local (30, -16).
    const landing: [number, number] = [-0.16, -0.3];
    const crew = (z: number) => ({
      men: [
        [-0.16, -0.36],
        [-0.19, -0.38],
        [-0.13, -0.38],
      ] as [number, number][],
      heading: 0,
      landing: [landing[0], landing[1] + z] as [number, number],
    });
    const a = beachBoatsOf(
      scene({
        hull: { at: [0, 0], heading: Math.PI / 2, metre: 0.01, astern: -45 },
        squads: [crew(0), crew(0.2)],
      }),
    );
    const s = a.squads[0]!;
    const t = times(s.ms).find((x) => (s.at(x)['man_0']?.fade ?? 0) > 0)!;
    const m = s.at(t)['man_0']!;
    // The boat's last leg, in the hull's frame, from its swung-out davit to the landing.
    const from = [REST_L[0] + 2.5, REST_L[2]];
    const to = [30, -16];
    const h = Math.atan2(to[0]! - from[0]!, to[1]! - from[1]!);
    const bow = [to[0]! + Math.sin(h) * 3.2, to[1]! + Math.cos(h) * 3.2];
    const expected = [0.01 * bow[1]!, -0.01 * bow[0]!];
    expect(-0.16 + m.travel![0]).toBeCloseTo(expected[0]!, 2);
    expect(-0.36 + m.travel![2]).toBeCloseTo(expected[1]!, 2);
    // A wrong sign in the turn would put it a metre-scale away, a third of the board.
    expect(Math.abs(-0.16 + m.travel![0] - expected[0]!)).toBeLessThan(0.003);
    expect(Math.abs(-0.36 + m.travel![2] - expected[1]!)).toBeLessThan(0.003);
  });

  it('sends only the boat of the shore flank for a single squad', () => {
    const a = beachBoatsOf(scene({ squads: [squad(-0.16)] }));
    expect(Object.keys(a.cargo!.at(2000))).toEqual(['boat_left']);
    expect(a.squads).toHaveLength(1);
  });

  it('sends the junk round the stern when the shore is on its blind side', () => {
    const away = scene({
      boats: [{ node: 'boat_left', rest: REST_L }],
      squads: [squad(-0.16, -0.36)].map((s) => ({
        ...s,
        landing: [-0.3, -0.16] as [number, number],
      })),
    });
    const a = beachBoatsOf(away);
    const zs = times(a.cargo!.ms).map((t) => boat(a, 'boat_left', t).at[2]);
    expect(Math.min(...zs)).toBeLessThanOrEqual(-45);
    expect(Math.min(...zs.slice(0, 1))).toBe(-10.3);
  });

  it('takes the +x flank, the left boat, when the landings sit on the hull axis: a tie goes to +x', () => {
    const mid = scene({
      squads: [squad(-0.16), squad(-0.1)].map((s) => ({
        ...s,
        landing: [0, s.landing[1]] as [number, number],
      })),
    });
    const a = beachBoatsOf(mid);
    const zs = (node: 'boat_left' | 'boat_right') =>
      times(a.cargo!.ms).map((t) => boat(a, node, t).at[2]);
    expect(Math.min(...zs('boat_left'))).toBeGreaterThan(-45);
    expect(Math.min(...zs('boat_right'))).toBeLessThanOrEqual(-45);
  });
});
