import { describe, expect, it } from 'vitest';
import { isRigPart } from '@/emblems/rigs';
import { barracksDoors, wayIn, wayOut } from './barracks';
import { WALK_MIN_PX } from './walk';

const DEG = Math.PI / 180;
type Leaf = 'porte_gauche' | 'porte_droite' | 'remise_porte_gauche' | 'remise_porte_droite';

describe('barracksDoors', () => {
  const doors = barracksDoors({ caserne: [[0, 2000]], remise: [[0, 3000]] });
  const angle = (t: number, name: Leaf) => doors.at(t)[name]?.turn?.[1] ?? 0;

  it('rests on the model: nothing at the start, nothing at the end or after', () => {
    expect(doors.at(0)).toEqual({});
    expect(doors.at(doors.ms)).toEqual({});
    expect(doors.at(doors.ms + 5000)).toEqual({});
  });

  it('swings the two leaves of each door the opposite way, out to 110 degrees', () => {
    expect(angle(275, 'porte_gauche')).toBeGreaterThan(0);
    expect(angle(275, 'porte_droite')).toBe(-angle(275, 'porte_gauche'));
    expect(angle(800, 'porte_gauche')).toBeCloseTo(110 * DEG);
    expect(angle(400, 'remise_porte_gauche')).toBeGreaterThan(0);
    expect(angle(400, 'remise_porte_droite')).toBe(-angle(400, 'remise_porte_gauche'));
    expect(angle(1000, 'remise_porte_gauche')).toBeCloseTo(110 * DEG);
  });

  it('holds each door open until its last piece has passed, then shuts it', () => {
    expect(angle(1999, 'porte_gauche')).toBeCloseTo(110 * DEG);
    expect(angle(2000 + 450 + 40, 'porte_gauche')).toBeLessThan(5 * DEG);
    expect(angle(2600, 'remise_porte_gauche')).toBeCloseTo(110 * DEG);
    expect(angle(3000 + 750, 'remise_porte_gauche')).toBeCloseTo(0);
    expect(doors.ms).toBe(3000 + 750);
  });

  it('breathes a motor out of the shed as its first vehicle starts, and stops', () => {
    const shed = barracksDoors({ remise: [[0, 2500]], motors: [450] });
    expect(shed.at(300).fx_sortie_remise).toBeUndefined();
    const [seconds, fade] = shed.at(900).fx_sortie_remise!.exhaust!;
    expect(seconds).toBeCloseTo(0.45);
    expect(fade).toBe(1);
    expect(shed.at(2600).fx_sortie_remise).toBeUndefined();
  });

  it('opens as far off as its recruits walk out: never through a shut door', () => {
    expect(barracksDoors({ caserne: [[0, 600]] }).minPx).toBe(WALK_MIN_PX);
  });

  it('opens a door again for a recruit that comes after it shut, and holds it for one that comes before', () => {
    const twice = barracksDoors({
      caserne: [
        [0, 1000],
        [3000, 4000],
        [3500, 4500],
      ],
    });
    const at = (t: number) => twice.at(t).porte_gauche?.turn?.[1] ?? 0;
    expect(at(800)).toBeCloseTo(110 * DEG);
    expect(at(2200)).toBeCloseTo(0);
    expect(at(3800)).toBeCloseTo(110 * DEG);
    expect(at(4300)).toBeCloseTo(110 * DEG);
    expect(twice.ms).toBe(4500 + 450 + 80);
  });

  it('leaves a door no piece passes shut', () => {
    const remise = barracksDoors({ remise: [[0, 1500]] });
    expect(remise.at(600).porte_gauche).toBeUndefined();
    expect(remise.at(600).remise_porte_gauche?.turn?.[1]).toBeGreaterThan(0);
  });

  it('names only parts of its family, and outlasts the settle window', () => {
    for (const name of Object.keys(doors.at(300))) expect(isRigPart('barracks', name)).toBe(true);
    expect(barracksDoors({ caserne: [[0, 600]] }).ms).toBeGreaterThan(1000);
  });
});

describe('wayOut', () => {
  /** `barracks.glb`, in metres: its box with the shed and the flagpole, its walls alone. */
  const box = { min: [-25.3, 0, -8.3], max: [39.4, 19.75, 12.35] } as const;
  const walls = { x: [-25.25, 39.15], z: [-7.95, 8.3] } as const;
  const man = { inside: [0, 0.8, 6.4], out: [0, 0.8, 7.9] } as const;
  const shed = { inside: [32, 0, 3.7], out: [32, 0, 7.9] } as const;
  type P = readonly [number, number, number];
  const inWalls = ([x, , z]: P) =>
    x > walls.x[0] && x < walls.x[1] && z > walls.z[0] && z < walls.z[1];
  /** Every point of the way once clear of the façade, a metre apart. */
  const crossesWalls = (path: ReadonlyArray<P>) => {
    const clear = path.findIndex(([, , z]) => z > walls.z[1]);
    return path.slice(clear + 1).some((to, k) => {
      const from = path[clear + k]!;
      const steps = Math.ceil(Math.hypot(to[0] - from[0], to[2] - from[2]));
      return Array.from({ length: steps + 1 }, (_, s) => s / Math.max(steps, 1)).some((f) =>
        inWalls([from[0] + (to[0] - from[0]) * f, 0, from[2] + (to[2] - from[2]) * f]),
      );
    });
  };
  const ranks: ReadonlyArray<[string, P, P]> = [
    ['in front', [0, 0, 40], [0, 0, 1]],
    ['beside the shed', [57, 0, 6], [1, 0, 0]],
    ['beside the west gable', [-50, 0, 0], [-1, 0, 0]],
    ['behind', [5, 0, -40], [0, 0, -1]],
  ];

  it.each(ranks)(
    'walks a man out by the door and the steps to a rank %s, around the walls',
    (_, rank, front) => {
      const path = wayOut({ ...man, rank, front, length: 2.6, box });
      expect(path[0]).toEqual(man.inside);
      expect(path[1]).toEqual(man.out);
      expect(path.at(-1)).toEqual(rank);
      expect(crossesWalls(path)).toBe(false);
      // Its last leg along its front: it stops facing the way it rests.
      const [a, b] = [path.at(-2)!, path.at(-1)!];
      const leg = Math.hypot(b[0] - a[0], b[2] - a[2]);
      expect((b[0] - a[0]) / leg).toBeCloseTo(front[0]);
      expect((b[2] - a[2]) / leg).toBeCloseTo(front[2]);
    },
  );

  it.each(ranks)(
    'drives a vehicle out of the shed to a rank %s, around the walls',
    (_, rank, front) => {
      const path = wayOut({ ...shed, rank, front, length: 4, box });
      expect(path.slice(0, 2)).toEqual([shed.inside, shed.out]);
      expect(path.at(-1)).toEqual(rank);
      expect(crossesWalls(path)).toBe(false);
    },
  );
});

describe('wayIn', () => {
  const box = { min: [-25.3, 0, -8.3], max: [39.4, 19.75, 12.35] } as const;
  type P = readonly [number, number, number];
  const inBox = ([x, , z]: P) =>
    x > box.min[0] && x < box.max[0] && z > box.min[2] && z < box.max[2];
  const crossesBox = (path: ReadonlyArray<P>) =>
    path.slice(1).some((to, k) => {
      const from = path[k]!;
      const steps = Math.ceil(Math.hypot(to[0] - from[0], to[2] - from[2]));
      return Array.from({ length: steps + 1 }, (_, s) => s / Math.max(steps, 1)).some((f) =>
        inBox([from[0] + (to[0] - from[0]) * f, 0, from[2] + (to[2] - from[2]) * f]),
      );
    });
  const cases: ReadonlyArray<[string, P, P, P, P]> = [
    ['from behind, to a rank in front', [0, 0, 0], [0, 0, -100], [0, 0, 40], [0, 0, 1]],
    ['from the west, to a rank beside the shed', [5, 0, 2], [-100, 0, 2], [57, 0, 6], [1, 0, 0]],
    ['from the front, to a rank in front', [0, 0, 60], [0, 0, 100], [10, 0, 40], [0, 0, 1]],
  ];

  it.each(cases)(
    'walks a column in %s, round the building, to its place along its front',
    (_, at, toward, rank, front) => {
      const path = wayIn({ at, toward, rank, front, length: 2.6, box });
      expect(crossesBox(path)).toBe(false);
      expect(path.at(-1)).toEqual(rank);
      const [a, b] = [path.at(-2)!, path.at(-1)!];
      const leg = Math.hypot(b[0] - a[0], b[2] - a[2]);
      expect((b[0] - a[0]) / leg).toBeCloseTo(front[0]);
      expect((b[2] - a[2]) / leg).toBeCloseTo(front[2]);
    },
  );

  it('starts where the column stood when it stood outside the building', () => {
    expect(
      wayIn({
        at: [0, 0, 60],
        toward: [0, 0, 100],
        rank: [10, 0, 40],
        front: [0, 0, 1],
        length: 2.6,
        box,
      })[0],
    ).toEqual([0, 0, 60]);
  });
});
