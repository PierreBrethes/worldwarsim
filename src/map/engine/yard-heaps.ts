import {
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ResourceKey } from '@/domain/ids';
import { RESOURCE_INKS } from './palette';

/**
 * **The heap in a yard** (#707): what waits at the foot of my exploitation, laid by the engine on
 * its yard at one of four sizes, the stacks of `heapReadingOf` — the label above it says the
 * number. Ore and coal lie in mounds, oil in barrels, food in sacks; each in its resource's ink.
 * In metres of the site's file, its foot at the origin on the yard: it grows with its maquette.
 */
export type HeapShape = 'mound' | 'barrels' | 'sacks';

export const HEAP_SHAPES: Readonly<Record<ResourceKey, HeapShape>> = {
  steel: 'mound',
  coal: 'mound',
  oil: 'barrels',
  food: 'sacks',
  // No exploitation heaps ammunition: an arsenal makes it into the stock.
  ammunition: 'barrels',
};

/** The yard's top in the files, over the socle's 2.2: a heap stands on it. */
export const YARD_TOP = 2.22;

/** One piece of a heap: where its foot stands, how far it is turned, how large it is drawn. */
export type HeapPiece = readonly [x: number, y: number, z: number, yaw: number, size: number];

/**
 * **A mound of ore** (`size` its radius): a main cone that widens, and from the second stack on
 * smaller cones shovelled against it. Drawn larger than life, as the seals are, to read at the
 * closest zoom. @a-mesurer
 */
const MOUNDS: ReadonlyArray<ReadonlyArray<HeapPiece>> = [
  [[0, 0, 0, 0, 3]],
  [
    [0, 0, 0, 0, 4],
    [3.6, 0, 1.8, 1, 2.3],
  ],
  [
    [0, 0, 0, 0, 5],
    [4.2, 0, 2.2, 1, 2.8],
    [-4, 0, 2.4, 2, 2.4],
  ],
  [
    [0, 0, 0, 0, 6],
    [4.9, 0, 2.6, 1, 3.2],
    [-4.8, 0, 2.8, 2, 2.9],
    [0.8, 0, -4.9, 3, 2.6],
  ],
];

/** A barrel's radius and height, a sack's length, in metres: larger than life. @a-mesurer */
const BARREL = { radius: 1.1, height: 2.2 };
const SACK = { length: 3, width: 1.8, height: 1.5 };
/** The spacing of a row of barrels or sacks on the ground, centre to centre. */
const STEP = { barrels: 2.4, sacks: 3.1 } as const;

/**
 * **Barrels and sacks in layers**, columns by rows from the ground up, each stack a larger pile:
 * a layer lies in the hollows of the one below, a sack sinks a little into its bed.
 */
const LAYERS: Readonly<
  Record<
    'barrels' | 'sacks',
    ReadonlyArray<ReadonlyArray<readonly [columns: number, rows: number]>>
  >
> = {
  barrels: [
    [[3, 1]],
    [[3, 2]],
    [
      [4, 2],
      [3, 1],
    ],
    [
      [4, 3],
      [3, 2],
    ],
  ],
  sacks: [
    [[2, 2]],
    [
      [3, 2],
      [2, 1],
    ],
    [
      [3, 3],
      [2, 2],
    ],
    [
      [4, 3],
      [3, 2],
      [2, 1],
    ],
  ],
};
/** A row of sacks lies closer than a row of barrels: a sack is narrower than it is long. */
const ROW_SHARE = { barrels: 1, sacks: 0.62 } as const;
const BED = { barrels: 1, sacks: 0.8 } as const;

function layersOf(shape: 'barrels' | 'sacks', stack: number): HeapPiece[] {
  const step = STEP[shape];
  const height = (shape === 'barrels' ? BARREL.height : SACK.height) * BED[shape];
  return LAYERS[shape][stack - 1]!.flatMap(([columns, rows], level) =>
    Array.from({ length: columns * rows }, (_, k): HeapPiece => {
      const column = k % columns;
      const row = Math.floor(k / columns);
      // A sack lies a little askew; a barrel stands square.
      const yaw = shape === 'sacks' ? ((column * 7 + row * 3 + level) % 5) * 0.06 - 0.12 : 0;
      return [
        (column - (columns - 1) / 2) * step,
        level * height,
        (row - (rows - 1) / 2) * step * ROW_SHARE[shape],
        yaw,
        1,
      ];
    }),
  );
}

/** **The pieces of a heap at a stack**, 1 to 4: none at 0. */
export function heapPieces(shape: HeapShape, stack: number): ReadonlyArray<HeapPiece> {
  if (stack < 1) return [];
  const at = Math.min(4, Math.round(stack));
  return shape === 'mound' ? MOUNDS[at - 1]! : layersOf(shape, at);
}

/** **How high a heap stands over the yard**, in metres: where the label sits on it. */
export function heapHeight(shape: HeapShape, stack: number): number {
  const pieces = heapPieces(shape, stack);
  if (shape !== 'mound')
    return Math.max(
      0,
      ...pieces.map(([, y]) => y + (shape === 'barrels' ? BARREL.height : SACK.height)),
    );
  return Math.max(0, ...pieces.map(([, , , , size]) => size * MOUND_RISE));
}

/** A mound's height to its radius: a heap of ore, not a pyramid. */
const MOUND_RISE = 0.7;
/** Its ink darkened so much on its shaded faces, lifted so much on its lit ones. */
const SHADES = [0.78, 0.9, 1, 1.08] as const;

/** One piece's geometry, its foot at the origin, each face shaded apart: cut paper, not a mesh. */
function pieceGeometry(shape: HeapShape, seed: number): BufferGeometry {
  const made =
    shape === 'mound'
      ? new ConeGeometry(1, MOUND_RISE, 7, 1).translate(0, MOUND_RISE / 2, 0)
      : shape === 'barrels'
        ? new CylinderGeometry(BARREL.radius, BARREL.radius, BARREL.height, 8, 1).translate(
            0,
            BARREL.height / 2,
            0,
          )
        : new SphereGeometry(0.5, 6, 4)
            .scale(SACK.length, SACK.height, SACK.width)
            .translate(0, SACK.height / 2, 0);
  const flat = made.toNonIndexed();
  made.dispose();
  // A mound's foot is not a circle: its base ring pulled in and out, the same at every display.
  if (shape === 'mound') {
    const position = flat.attributes.position!;
    for (let k = 0; k < position.count; k++) {
      if (position.getY(k) > 1e-3) continue;
      const turn = Math.atan2(position.getZ(k), position.getX(k));
      const pull = 1 + 0.12 * Math.sin(turn * 3 + seed * 1.7);
      position.setXYZ(k, position.getX(k) * pull, 0, position.getZ(k) * pull);
    }
  }
  flat.computeVertexNormals();
  const shade = new Float32Array(flat.attributes.position!.count * 3);
  for (let face = 0; face * 3 < flat.attributes.position!.count; face++) {
    const lift = SHADES[(face + seed) % SHADES.length]!;
    // A barrel's lid reads darker than its staves: its cut is the top of a drum.
    const lid = shape === 'barrels' && Math.abs(flat.attributes.normal!.getY(face * 3)) > 0.9;
    shade.fill(lid ? 0.72 : lift, face * 9, face * 9 + 9);
  }
  flat.setAttribute('color', new Float32BufferAttribute(shade, 3));
  return flat;
}

const geometries = new Map<string, BufferGeometry | null>();
const placement = new Matrix4();
const turned = new Matrix4();

/** **A heap's geometry**, one per shape and stack, shared by every site: one draw call each. */
export function heapGeometry(shape: HeapShape, stack: number): BufferGeometry | null {
  const key = `${shape} ${stack}`;
  if (!geometries.has(key)) {
    const parts = heapPieces(shape, stack).map(([x, y, z, yaw, size], k) =>
      pieceGeometry(shape, k).applyMatrix4(
        placement
          .makeScale(size, size, size)
          .premultiply(turned.makeRotationY(yaw))
          .setPosition(x, y, z),
      ),
    );
    geometries.set(key, parts.length === 0 ? null : mergeGeometries(parts));
    for (const part of parts) part.dispose();
  }
  return geometries.get(key)!;
}

const inks = new Map<ResourceKey, MeshStandardMaterial>();

/** Its resource's ink, the faces shaded by their vertex colours. */
function inkOf(resource: ResourceKey): MeshStandardMaterial {
  let ink = inks.get(resource);
  if (ink === undefined) {
    ink = new MeshStandardMaterial({
      name: `tas_${resource}`,
      color: new Color(RESOURCE_INKS[resource]),
      vertexColors: true,
      roughness: 0.95,
      flatShading: true,
    });
    inks.set(resource, ink);
  }
  return ink;
}

/** **The heap of a resource at a stack**, a mesh placed by its site (`matrixAutoUpdate` off),
 *  `null` at 0: an empty yard draws nothing. */
export function heapMeshOf(resource: ResourceKey, stack: number): Mesh | null {
  const geometry = heapGeometry(HEAP_SHAPES[resource], stack);
  if (geometry === null) return null;
  const mesh = new Mesh(geometry, inkOf(resource));
  mesh.name = 'tas';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
