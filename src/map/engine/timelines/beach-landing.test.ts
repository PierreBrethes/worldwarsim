import { Box3, Matrix4, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { troopMetres } from '@/domain/piece-size';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { sceneOfFile } from '../gltf-scene.fixture';
import { beachBoatsOf } from './beach-boats';
import { assaultOf, boatsOfScene, landingVerdict } from './beach-landing';

const files = Object.entries(FIGURINE_FILES).map(
  ([nation, entry]) => [nation, (entry as { cargo: string }).cargo] as const,
);

describe('landingVerdict (#509)', () => {
  const play = {
    role: 'cargo',
    ground: 'beach',
    motion: 'full',
    veiled: false,
    big: true,
  } as const;

  it('plays a cargo before a beach, in the field, at full motion', () => {
    expect(landingVerdict(play)).toBe('play');
  });

  it.each([
    ['a carrier', { role: 'carrier' }],
    ['a quay, whose men have no sequence before #512', { ground: 'quay' }],
    ['reduced motion', { motion: 'reduced' }],
    ['motion off', { motion: 'off' }],
    ['a combat at the point', { veiled: true }],
    ['a pile too small on screen', { big: false }],
  ] as const)('poses at once for %s', (_, change) => {
    expect(landingVerdict({ ...play, ...change })).toBeNull();
  });
});

describe('assaultOf on a bare frame (#509)', () => {
  const boats = [{ node: 'boat_left' as const, rest: [7, 6, -10] as const }];
  const frame = new Matrix4()
    .makeTranslation(5, 0, 3)
    .multiply(new Matrix4().makeScale(0.01, 0.01, 0.01));
  const squad = (x: number) => ({
    men: [new Vector3(x, 0, 3), new Vector3(x + 0.03, 0, 3.02), new Vector3(x + 0.03, 0, 2.98)],
    front: new Vector3(1, 0, 0),
  });

  it('puts nothing out without a boat or without a man', () => {
    expect(
      assaultOf({ frame, boats: [], astern: -40, squads: [squad(5.4)], man: 0.02 }),
    ).toBeNull();
    expect(assaultOf({ frame, boats, astern: -40, squads: [], man: 0.02 })).toBeNull();
    expect(
      assaultOf({
        frame,
        boats,
        astern: -40,
        squads: [{ men: [], front: new Vector3(1, 0, 0) }],
        man: 0.02,
      }),
    ).toBeNull();
  });

  it('grounds a boat 6 m short of its squad, on the line to the hull, facing the squad as it stands', () => {
    const a = assaultOf({ frame, boats, astern: -40, squads: [squad(5.4)], man: 0.02 })!;
    expect(a.squads[0]!.landing[0]).toBeCloseTo(5.4 + 0.02 - 0.06, 6);
    expect(a.squads[0]!.landing[1]).toBeCloseTo(3, 6);
    expect(a.squads[0]!.heading).toBeCloseTo(Math.PI / 2, 6);
  });

  it('grounds the boat at the water edge when the squad stands inland of it', () => {
    // The shore runs along x = 5.2: water to the hull's side of it, sand beyond.
    const wet = (x: number) => x < 5.2;
    const a = assaultOf({ frame, boats, astern: -40, squads: [squad(5.4)], man: 0.02, wet })!;
    expect(a.squads[0]!.landing[0]).toBeCloseTo(5.2, 1);
    expect(a.squads[0]!.landing[0]).toBeGreaterThanOrEqual(5.18);
    expect(a.squads[0]!.landing[1]).toBeCloseTo(3, 6);
  });

  it('keeps the landing short of its squad when the water is nearer than that', () => {
    const a = assaultOf({
      frame,
      boats,
      astern: -40,
      squads: [squad(5.4)],
      man: 0.02,
      wet: (x) => x < 5.41,
    })!;
    expect(a.squads[0]!.landing[0]).toBeCloseTo(5.4 + 0.02 - 0.06, 6);
  });

  it('keeps the landing short of the hull when the pile is packed tight', () => {
    const a = assaultOf({ frame, boats, astern: -40, squads: [squad(5.08)], man: 0.02 })!;
    expect(a.squads[0]!.landing[0]).toBeGreaterThan(5.04);
  });
});

describe.each(files)('the assault of the %s cargo on a beach (#509)', (_, url) => {
  const { boats, astern } = boatsOfScene(sceneOfFile(url));

  it('reads its boats and a stern behind them: the junk hangs one, the others two', () => {
    expect(boats.length).toBeGreaterThanOrEqual(1);
    expect(boats.length).toBeLessThanOrEqual(2);
    for (const { rest } of boats) expect(rest[2]).toBeGreaterThan(astern);
  });

  describe.each([0, Math.PI / 2, Math.PI, -Math.PI / 2 + 0.3])('the hull turned %f', (heading) => {
    describe.each([1, -1])('and the shore on its side %i', (shore) => {
      const scene = sceneOfFile(url);
      const box = new Box3().setFromObject(scene);
      const size = box.getSize(new Vector3());
      const k = troopMetres('cargo') / Math.max(size.x, size.z);
      const frame = new Matrix4()
        .makeTranslation(5, 0, 3)
        .multiply(new Matrix4().makeRotationY(heading))
        .multiply(new Matrix4().makeScale(k, k, k));
      // Two squads of three, 45 m off the hull's flank and 30 m apart along it.
      const crew = (z: number) => {
        const at = (dx: number, dz: number) =>
          new Vector3(shore * 45 + dx, 0, z + dz).applyMatrix4(frame);
        return {
          men: [at(0, 0), at(2, 1.5), at(2, -1.5)],
          front: new Vector3(shore, 0, 0).transformDirection(frame),
        };
      };
      const man = 1.8 * k;
      const assault = assaultOf({ frame, boats, astern, squads: [crew(-10), crew(20)], man })!;
      const a = beachBoatsOf(assault);

      it('reads the hull off the frame', () => {
        expect(assault.hull.metre).toBeCloseTo(k, 9);
        expect(Math.cos(assault.hull.heading)).toBeCloseTo(Math.cos(heading), 6);
        expect(Math.sin(assault.hull.heading)).toBeCloseTo(Math.sin(heading), 6);
        expect(assault.hull.at[0]).toBeCloseTo(5, 9);
        expect(assault.hull.at[1]).toBeCloseTo(3, 9);
      });

      it('hangs its boats at rest, puts them to the water and takes them home', () => {
        const rest = a.cargo!.at(0);
        for (const { node } of boats) expect(rest[node]!.shift).toEqual([0, 0, 0]);
        expect(a.cargo!.at(a.cargo!.ms)).toEqual({});
        expect(Object.keys(a.cargo!.at(a.cargo!.ms / 2)).sort()).toEqual(
          boats.map(({ node }) => node).sort(),
        );
      });

      it('grounds a boat on each squad’s landing, on the board', () => {
        const board = (rest: readonly number[], shift: readonly number[]) =>
          new Vector3(
            rest[0]! + shift[0]!,
            rest[1]! + shift[1]!,
            rest[2]! + shift[2]!,
          ).applyMatrix4(frame);
        assault.squads.slice(0, boats.length).forEach(({ landing }) => {
          let nearest = Infinity;
          for (let t = 0; t < a.cargo!.ms; t += 20)
            for (const { node, rest } of boats) {
              const at = board(rest, a.cargo!.at(t)[node]!.shift ?? [0, 0, 0]);
              nearest = Math.min(nearest, Math.hypot(at.x - landing[0], at.z - landing[1]));
            }
          expect(nearest).toBeLessThan(0.15 * k * 3.8);
        });
      });

      it('sets every man down at the place the pile drew him', () => {
        a.squads.forEach((sequence, n) => {
          const pose = sequence.at(sequence.ms - 1);
          assault.squads[n]!.men.forEach((_, m) => {
            const travel = pose[`man_${m}`]?.travel ?? [0, 0, 0];
            expect(Math.hypot(travel[0], travel[2])).toBeLessThan(man * 0.01);
          });
          expect(sequence.at(sequence.ms)).toEqual({});
        });
        expect(a.settled).toBeGreaterThan(0);
      });
    });
  });
});
