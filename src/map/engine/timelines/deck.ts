import { type Matrix4, type Mesh, type Object3D, Vector3 } from 'three';
import { MOLE } from '@/emblems/kits/manifest';
import type { Sequence } from '../sequences';
import type { GangwayLift } from './gangway';

/**
 * **A carrier's flight deck** (#506), in the file's own metres: its level (the lift's top), how far
 * it reaches to each flank across the lift's station, and the lift's footprint. Read off the
 * hull's vertices, not off a mark: the files carry no gangway (`fx_passerelle`).
 */
export type Deck = {
  readonly y: number;
  /** The deck's two edges across the lift's station: the smallest and the greatest `x`. */
  readonly edges: readonly [min: number, max: number];
  readonly lift: {
    readonly min: readonly [x: number, z: number];
    readonly max: readonly [x: number, z: number];
  };
};

/** How far a vertex may stand from the lift's top and still be the deck's surface (m of the file). */
const LEVEL = 0.3;

/**
 * **The flight deck of a carrier file**, `null` when it has no `ascenseur` or no flat surface at
 * its level. Its edges are where the flat surface cuts the plane of the lift's station (`z`).
 */
export function deckOf(scene: Object3D): Deck | null {
  scene.updateMatrixWorld(true);
  const lift = scene.getObjectByName('ascenseur');
  if (lift === undefined) return null;
  const top = new Vector3(-Infinity, -Infinity, -Infinity);
  const low = new Vector3(Infinity, Infinity, Infinity);
  lift.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const { index, attributes } = mesh.geometry;
    const position = attributes.position!;
    const at = new Vector3();
    for (let k = 0; k < (index?.count ?? position.count); k++) {
      at.fromBufferAttribute(position, index?.getX(k) ?? k).applyMatrix4(mesh.matrixWorld);
      top.max(at);
      low.min(at);
    }
  });
  const y = top.y;
  const z = (low.z + top.z) / 2;
  let min = Infinity;
  let max = -Infinity;
  const corners = [new Vector3(), new Vector3(), new Vector3()] as const;
  scene.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    for (let up: Object3D | null = node; up !== null; up = up.parent)
      if (/^(fx_|fond|ascenseur)/.test(up.name)) return;
    const { index, attributes } = mesh.geometry;
    const count = index?.count ?? attributes.position!.count;
    for (let t = 0; t + 2 < count; t += 3) {
      corners.forEach((corner, k) =>
        corner
          .fromBufferAttribute(attributes.position!, index?.getX(t + k) ?? t + k)
          .applyMatrix4(mesh.matrixWorld),
      );
      if (corners.some((corner) => Math.abs(corner.y - y) > LEVEL)) continue;
      for (let k = 0; k < 3; k++) {
        const [a, b] = [corners[k]!, corners[(k + 1) % 3]!];
        if ((a.z - z) * (b.z - z) > 0 || a.z === b.z) continue;
        const x = a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x);
        min = Math.min(min, x);
        max = Math.max(max, x);
      }
    }
  });
  if (min > max) return null;
  return { y, edges: [min, max], lift: { min: [low.x, low.z], max: [top.x, top.z] } };
}

/** The room a man takes on the lift, in metres: a rank of men a pace and a half apart. `@a-mesurer` */
const RANK = 1.3;

/**
 * **Where the men go aboard a carrier** (#506), in the port's metres (`toModel` takes the board's to
 * them, a port laid in mirror turned back): the edge of the deck on the mole's side, where the
 * plank's head rests, and a spot on the lift for each of `men`, the nearest to the plank first.
 * `frame` takes a point of the file to the board, `metre` is the file's metres per unit.
 */
export function deckLanding({
  deck,
  frame,
  toModel,
  metre,
  men,
}: {
  readonly deck: Deck;
  readonly frame: Matrix4;
  readonly toModel: (board: Vector3) => Vector3;
  readonly metre: number;
  readonly men: number;
}): { readonly head: Vector3; readonly spots: ReadonlyArray<Vector3> } {
  const portOf = (x: number, z: number): Vector3 =>
    toModel(new Vector3(x, deck.y, z).applyMatrix4(frame));
  const z = (deck.lift.min[1] + deck.lift.max[1]) / 2;
  const head = deck.edges
    .map((x) => portOf(x, z))
    .reduce((best, edge) =>
      Math.abs(edge.x - MOLE.inner) < Math.abs(best.x - MOLE.inner) ? edge : best,
    );
  const centre = portOf((deck.lift.min[0] + deck.lift.max[0]) / 2, z);
  const across = [
    (deck.lift.max[0] - deck.lift.min[0]) * metre,
    (deck.lift.max[1] - deck.lift.min[1]) * metre,
  ] as const;
  const [cols, rows] = across.map((room) => Math.max(1, Math.floor(room / RANK))) as [
    number,
    number,
  ];
  const spots = Array.from({ length: cols * rows }, (_, k) =>
    centre
      .clone()
      .add(
        new Vector3(
          ((k % cols) - (cols - 1) / 2) * RANK,
          0,
          (Math.floor(k / cols) - (rows - 1) / 2) * RANK,
        ),
      ),
  );
  spots.sort((a, b) => a.distanceTo(head) - b.distanceTo(head));
  return { head, spots: spots.slice(0, men) };
}

/**
 * **The lift's own sequence** (#506): the `ascenseur` goes down `drop` (the file's units) as the men
 * ride it, and comes up empty (`lift`, from `gangwayOf`). Judged on the hull, which is the piece seen.
 */
export function liftSequence(lift: GangwayLift, drop: number): Sequence<'carrier'> {
  const ms = lift.end + 1;
  return {
    family: 'carrier',
    pool: 'site',
    anywhere: true,
    ms,
    at: (t) =>
      t < lift.start || t >= ms ? {} : { ascenseur: { shift: [0, -lift.depth(t) * drop, 0] } },
  };
}
