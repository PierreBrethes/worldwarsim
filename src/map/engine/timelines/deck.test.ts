import { Box3, BoxGeometry, Group, Matrix4, Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { troopMetres } from '@/domain/piece-size';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { MOLE } from '@/emblems/kits/manifest';
import { sceneOfFile } from '../gltf-scene.fixture';
import { deckOf, deckLanding, liftSequence } from './deck';
import { gangwayOf, plankFoot } from './gangway';
import { berths } from './rest';

/** The most a plank may span, from the mole's deck to the deck's edge (m). `@a-mesurer` */
const PLANK_MAX = 30;

/** A carrier of a nation's file at the mole, in a port as drawn or laid in mirror (#476). */
function berthed(url: string, mirrored: boolean, turned = false) {
  const scene = sceneOfFile(url);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const k = troopMetres('carrier') / Math.max(size.x, size.z);
  const [at] = berths(
    ['carrier'],
    1,
    ['mole'],
    [(2 * Math.max(box.max.x, -box.min.x)) / Math.max(size.x, size.z)],
  );
  const way = mirrored ? -1 : 1;
  // The port's metres to the board: laid in mirror, its x is turned over.
  const toModel = (p: Vector3) => new Vector3(way * (p.x - 5), p.y, p.z - 3);
  const frame = new Matrix4()
    .makeTranslation(way * at!.x + 5, 0, at!.z + 3)
    .multiply(new Matrix4().makeRotationY(mirrored !== turned ? 0 : Math.PI))
    .multiply(new Matrix4().makeScale(k, k, k));
  return { scene, frame, toModel, metre: k };
}

const files = Object.entries(FIGURINE_FILES).map(
  ([nation, entry]) => [nation, (entry as { carrier: string }).carrier] as const,
);

describe('deckOf on a file without a hull or a lift (#506)', () => {
  it('reads nothing: no lift, or a lift with no hull round it', () => {
    expect(deckOf(new Group())).toBeNull();
    const lift = new Group();
    lift.name = 'ascenseur';
    lift.add(new Mesh(new BoxGeometry(2, 1, 2)));
    expect(deckOf(new Group().add(lift))).toBeNull();
  });
});

describe.each(files)('the flight deck of the %s carrier (#506)', (_, url) => {
  it('is read off the file: its level is the lift’s top, its edges cut the lift’s station', () => {
    const deck = deckOf(sceneOfFile(url))!;
    expect(deck).not.toBeNull();
    expect(deck.y).toBeGreaterThan(5);
    expect(deck.edges[0]).toBeLessThan(deck.lift.min[0]);
    expect(deck.edges[1]).toBeGreaterThan(deck.lift.max[0]);
  });

  describe.each([false, true])('in a port laid in mirror: %s (#476)', (mirrored) => {
    const { scene, frame, toModel, metre } = berthed(url, mirrored);
    const deck = deckOf(scene)!;
    const men = 12;
    const place = deckLanding({ deck, frame, toModel, metre, men });
    const foot = plankFoot(place.head);

    it('lays a plank from the mole’s deck, in from its face, up to the deck’s edge on the mole’s side', () => {
      expect(place.head.x).toBeLessThan(MOLE.inner);
      expect(foot[0]).toBeGreaterThan(place.head.x);
      expect(foot[2]).toBe(place.head.z);
      expect(place.head.y).toBeGreaterThan(foot[1]);
      expect(Math.hypot(foot[0] - place.head.x, foot[1] - place.head.y)).toBeLessThan(PLANK_MAX);
    });

    it('takes the edge nearer the mole, whichever way the hull is berthed', () => {
      for (const turned of [false, true]) {
        const there = berthed(url, mirrored, turned);
        const { head } = deckLanding({ deck, ...there, men });
        const edges = deck.edges.map((x) =>
          there.toModel(
            new Vector3(x, deck.y, (deck.lift.min[1] + deck.lift.max[1]) / 2).applyMatrix4(
              there.frame,
            ),
          ),
        );
        expect(Math.abs(head.x - MOLE.inner)).toBe(
          Math.min(...edges.map((edge) => Math.abs(edge.x - MOLE.inner))),
        );
      }
    });

    it('ranks every man on the lift, at the deck’s level, the nearest to the plank first', () => {
      expect(place.spots).toHaveLength(men);
      const lift = [deck.lift.min, deck.lift.max].map(([x, z]) =>
        toModel(new Vector3(x, deck.y, z).applyMatrix4(frame)),
      );
      const [lowX, highX] = [Math.min(...lift.map((p) => p.x)), Math.max(...lift.map((p) => p.x))];
      const [lowZ, highZ] = [Math.min(...lift.map((p) => p.z)), Math.max(...lift.map((p) => p.z))];
      for (const spot of place.spots) {
        expect(spot.x).toBeGreaterThan(lowX);
        expect(spot.x).toBeLessThan(highX);
        expect(spot.z).toBeGreaterThan(lowZ);
        expect(spot.z).toBeLessThan(highZ);
        expect(spot.y).toBeCloseTo(place.head.y, 3);
      }
      const away = place.spots.map((spot) => spot.distanceTo(place.head));
      expect(away).toEqual([...away].sort((a, b) => a - b));
      expect(
        new Set(place.spots.map((spot) => `${spot.x.toFixed(2)} ${spot.z.toFixed(2)}`)).size,
      ).toBe(men);
    });
  });
});

describe('the lift’s sequence (#506)', () => {
  const { lift } = gangwayOf({
    man: 1.8,
    squads: [
      {
        men: [
          [
            [0, 0, 0],
            [5, 0, 0],
          ],
        ],
      },
    ],
    lift: { drop: 6.5 },
  });
  const seq = liftSequence(lift!, 5);

  it('lets the lift down its drop as the men ride it, and back up empty', () => {
    expect(seq.family).toBe('carrier');
    expect(seq.at(lift!.start - 1)).toEqual({});
    expect(seq.at(lift!.bottom).ascenseur?.shift).toEqual([0, -5, 0]);
    expect(seq.at(lift!.end - 1).ascenseur?.shift?.[1]).toBeGreaterThan(-0.01);
    expect(seq.at(seq.ms)).toEqual({});
  });

  it('plays on the hull’s own pool, whether or not the hull is in the field', () => {
    expect(seq.pool).toBe('site');
    expect(seq.anywhere).toBe(true);
  });
});
