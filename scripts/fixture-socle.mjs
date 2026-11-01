#!/usr/bin/env node
// **The barracks on its socle, for tests and the demo only** (ADR 0038, #365): today's
// `barracks.glb` raised by SOCLE_TOP onto a procedural wargame base, with the parts the engine
// reads — `socle`, `lisere` (its own white material), `cour`, `signe` (carrying `hampe` and
// `drapeau`, names and pivots kept), `fx_rang` and the empty accessory groups. Pierre's own
// GLBs replace it (#368); production never loads it.
//   node scripts/fixture-socle.mjs
// Shapes after WWS/prototypes/batiments-caractere/commun/bplus.js.
import { readFileSync, writeFileSync } from 'node:fs';
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
} from 'three';

const SOURCE = 'src/emblems/buildings/barracks.glb';
const TARGET = 'src/emblems/fixtures/barracks-socle.glb';
const SOCLE_TOP = 2.2;
const BEVEL = 0.8;
const RADIUS = 6;
/** x0, z0, x1, z1 in metres: 6 to 9 m round the building, 22 m in front of its door. */
const SOCLE = [-34, -15, 46, 33];
const C = {
  papier: '#ebe1c8',
  flanc: '#bfae8a',
  gravier: '#d9cdaf',
  place: '#cbbd9a',
  blanc: '#ece4d0',
  pierre: '#c0b292',
  chaud: '#b5523b',
  noir: '#24221e',
  laiton: '#b08a3c',
  toile: '#a99a6e',
  bois: '#8a6a3f',
  ocre: '#c9a14a',
  gravats: '#6b6457',
  suie: '#3b3631',
};

const bytes = readFileSync(SOURCE);
const jsonLength = bytes.readUInt32LE(12);
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
const chunks = [bytes.subarray(20 + jsonLength + 8)];
let binLength = gltf.buffers[0].byteLength;

function append(array, target) {
  const pad = (4 - (binLength % 4)) % 4;
  if (pad) chunks.push(Buffer.alloc(pad));
  binLength += pad;
  const data = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  gltf.bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: data.length, target });
  chunks.push(data);
  binLength += data.length;
  return gltf.bufferViews.length - 1;
}
function accessor(array, type) {
  const width = type === 'VEC3' ? 3 : 2;
  const min = [Infinity, Infinity, Infinity].slice(0, width);
  const max = [-Infinity, -Infinity, -Infinity].slice(0, width);
  for (let k = 0; k < array.length; k++) {
    min[k % width] = Math.min(min[k % width], array[k]);
    max[k % width] = Math.max(max[k % width], array[k]);
  }
  gltf.accessors.push({
    bufferView: append(array, 34962),
    componentType: 5126,
    count: array.length / width,
    type,
    min,
    max,
  });
  return gltf.accessors.length - 1;
}
function material(name, roughness) {
  gltf.materials.push({
    name,
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: roughness,
    },
  });
  return gltf.materials.length - 1;
}
/** The socle, its yard and its sign share one material, their colours in their vertices. */
const PAINT = material('socle', 1);
const LISERE = material('lisere', 0.7);

/** Pieces as [geometry, colour], one mesh for the lot, its colours in its vertices. */
function mesh(pieces, materialIndex = PAINT) {
  const positions = [];
  const normals = [];
  const colors = [];
  for (const [geometry, hex] of pieces) {
    const flat = geometry.index === null ? geometry : geometry.toNonIndexed();
    const color = new Color(hex);
    positions.push(...flat.attributes.position.array);
    normals.push(...flat.attributes.normal.array);
    for (let k = 0; k < flat.attributes.position.count; k++) colors.push(color.r, color.g, color.b);
  }
  const attributes = {
    POSITION: accessor(new Float32Array(positions), 'VEC3'),
    NORMAL: accessor(new Float32Array(normals), 'VEC3'),
  };
  if (materialIndex === PAINT) attributes.COLOR_0 = accessor(new Float32Array(colors), 'VEC3');
  gltf.meshes.push({ primitives: [{ attributes, mode: 4, material: materialIndex }] });
  return gltf.meshes.length - 1;
}
function node(name, more = {}) {
  gltf.nodes.push({ name, ...more });
  return gltf.nodes.length - 1;
}

const box = (w, h, d, x = 0, y = 0, z = 0) => new BoxGeometry(w, h, d).translate(x, y + h / 2, z);
function rounded([x0, z0, x1, z1], r) {
  const s = new Shape();
  s.moveTo(x0 + r, -z0);
  s.lineTo(x1 - r, -z0);
  s.quadraticCurveTo(x1, -z0, x1, -z0 - r);
  s.lineTo(x1, -z1 + r);
  s.quadraticCurveTo(x1, -z1, x1 - r, -z1);
  s.lineTo(x0 + r, -z1);
  s.quadraticCurveTo(x0, -z1, x0, -z1 + r);
  s.lineTo(x0, -z0 - r);
  s.quadraticCurveTo(x0, -z0, x0 + r, -z0);
  return s;
}
/** A flat strip of the yard, a few centimetres above the socle. */
const strip = (x0, z0, x1, z1, dy) =>
  new ShapeGeometry(rounded([x0, z0, x1, z1], 0.01), 1)
    .rotateX(-Math.PI / 2)
    .translate(0, SOCLE_TOP + dy, 0);

// The socle: a bevelled paper base, its top at SOCLE_TOP — the top paper, the flank darker.
const [x0, z0, x1, z1] = SOCLE;
const base = new ExtrudeGeometry(
  rounded([x0 + BEVEL * 2, z0 + BEVEL * 2, x1 - BEVEL * 2, z1 - BEVEL * 2], RADIUS),
  {
    depth: 0.6,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: BEVEL * 2,
    bevelSegments: 1,
    curveSegments: 4,
  },
)
  .rotateX(-Math.PI / 2)
  .translate(0, BEVEL, 0);
// ExtrudeGeometry is not indexed, its groups 0 the caps, 1 the sides.
const [caps, sides] = base.groups;
const part = ({ start, count }) => {
  const g = base.clone();
  for (const name of ['position', 'normal'])
    g.setAttribute(
      name,
      new BufferAttribute(base.attributes[name].array.slice(start * 3, (start + count) * 3), 3),
    );
  g.deleteAttribute('uv');
  g.clearGroups();
  return g;
};
const socleMesh = mesh([
  [part(caps), C.papier],
  [part(sides), C.flanc],
]);

// The liseré: a 3 m band round the top's edge, white, for the engine to ink.
const ring = rounded([x0 + 0.6, z0 + 0.6, x1 - 0.6, z1 - 0.6], RADIUS);
ring.holes.push(rounded([x0 + 3.6, z0 + 3.6, x1 - 3.6, z1 - 3.6], RADIUS - 2));
const lisereMesh = mesh(
  [[new ShapeGeometry(ring, 4).rotateX(-Math.PI / 2).translate(0, SOCLE_TOP + 0.06, 0), '#ffffff']],
  LISERE,
);

// The yard: gravel, the parade ground and its painted ranks.
const courMesh = mesh([
  [strip(-31, 12, 43, 30, 0.03), C.gravier],
  [strip(-29, 14, 5, 29.5, 0.04), C.place],
  ...[0, 1, 2, 3].map((i) => [strip(-27, 16 + i * 3.4, 3, 16.4 + i * 3.4, 0.07), C.blanc]),
]);

// The sign: the parade ground's 24 m mast on its plinth, two striped sentry boxes to keep it.
const guerite = (x) => [
  ...[0, 1, 2].map((band) => [box(2, 1.2, 2, x, band * 1.2, 0), band % 2 ? C.blanc : C.chaud]),
  [
    new ConeGeometry(Math.SQRT1_2 * 2.6, 1.4, 4).rotateY(Math.PI / 4).translate(x, 3.6 + 0.7, 0),
    C.noir,
  ],
];
const signeMesh = mesh([
  [box(3.2, 1.2, 3.2), C.pierre],
  [box(2, 1, 2, 0, 1.2, 0), C.pierre],
  [box(7, 0.25, 0.25, 0, 17, 0), C.blanc],
  [new SphereGeometry(0.6, 8, 4).translate(0, 26.6, 0), C.laiton],
  ...guerite(-3.6),
  ...guerite(3.6),
]);

// The building, raised onto the socle; its flag goes to the sign.
const sceneRoots = gltf.scenes[0].nodes;
const building = sceneRoots[0];
const buildingNode = gltf.nodes[building];
const byName = (name) => gltf.nodes.findIndex((n) => n.name === name);
const moved = ['hampe', 'drapeau', 'fx_tete_hampe'].map(byName);
buildingNode.children = buildingNode.children.filter((child) => !moved.includes(child));
buildingNode.name = 'batiment';
buildingNode.translation = [0, SOCLE_TOP, 0];
// The pole stood 12 m on the ground: twice that on its plinth, its flag and its head at its top.
const [hampe, drapeau, tete] = moved;
gltf.nodes[hampe].translation = [0, 2.2, 0];
gltf.nodes[hampe].scale = [1.4, 1.95, 1.4];
gltf.nodes[drapeau].translation = [0, 2.2 + 23, 0];
gltf.nodes[drapeau].scale = [1.6, 1.6, 1.6];
gltf.nodes[tete].translation = [0, 2.2 + 23.4, 0];
const signe = node('signe', { mesh: signeMesh, translation: [18, SOCLE_TOP, 22], children: moved });
// The rank: its first man, +z along the rank (here the board's +x), on the parade ground.
const rang = node('fx_rang', {
  translation: [-25, SOCLE_TOP, 17.4],
  rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
});
// The accessories, each a recognisable handful on the yard's free ground (x 6 to 41, z 12 to 30),
// none of them a piece of the game, each within 150 triangles: crates, a tent and barrels, a
// guard hut, the works' poles and planks, the ruins' rubble and fallen beams.
const barrel = (x, z) => new CylinderGeometry(1, 1, 2, 8).translate(x, 1, z);
const GROUPS = {
  niveau_1: [
    [box(3, 2, 3, 28, 0, 15), C.bois],
    [box(3, 2, 3, 31.4, 0, 15.4), C.bois],
    [box(3, 2, 3, 29.7, 2, 15.2), C.bois],
    [box(2.4, 1.6, 2.4, 34, 0, 16), C.bois],
  ],
  niveau_2: [
    [new ConeGeometry(Math.SQRT1_2 * 6, 4, 4).rotateY(Math.PI / 4).translate(8.5, 2, 24), C.toile],
    [barrel(13, 18), C.pierre],
    [barrel(15.4, 18.4), C.pierre],
    [barrel(13.6, 20.4), C.pierre],
  ],
  niveau_3: [
    [box(8, 4, 6, 33, 0, 25), C.blanc],
    [
      new ConeGeometry(Math.SQRT1_2 * 9, 3, 4).rotateY(Math.PI / 4).translate(33, 4 + 1.5, 25),
      C.chaud,
    ],
    [box(1.4, 2.4, 0.3, 33, 0, 28.1), C.noir],
  ],
  chantier: [
    ...[0, 1, 2, 3].map((k) => [box(0.5, 12, 0.5, 26 + (k % 2) * 8, 0, 14 + (k >> 1) * 8), C.ocre]),
    [box(8.5, 0.4, 0.8, 30, 4, 14), C.bois],
    [box(8.5, 0.4, 0.8, 30, 8, 14), C.bois],
    [box(8.5, 0.4, 0.8, 30, 8, 22), C.bois],
    [new ConeGeometry(2.4, 2, 10).translate(37, 1, 18), C.gravier],
  ],
  ruines: [
    ...Array.from({ length: 9 }, (_, k) => [
      box(
        2 + (k % 4),
        1 + (k % 3),
        2 + (k % 5) * 0.6,
        -22 + ((k * 37) % 100) * 0.6,
        0,
        -6 + ((k * 61) % 100) * 0.16,
      ),
      k % 3 ? C.gravats : C.suie,
    ]),
    [box(0.6, 0.6, 9, 12, 1, 0), C.suie],
    [box(7, 0.6, 0.6, 26, 0.6, 3), C.suie],
  ],
};
const groups = Object.entries(GROUPS).map(([name, pieces]) =>
  node(name, { mesh: mesh(pieces), translation: [0, SOCLE_TOP, 0] }),
);
const root = node('barracks', {
  children: [
    building,
    node('socle', { mesh: socleMesh }),
    node('lisere', { mesh: lisereMesh }),
    node('cour', { mesh: courMesh }),
    signe,
    rang,
    ...groups,
  ],
});
gltf.scenes[0].nodes = [root];

const pad = (data, fill) => Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4, fill)]);
const bin = pad(Buffer.concat(chunks), 0);
gltf.buffers[0].byteLength = bin.length;
const json = pad(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32LE(data.length, 0);
  head.writeUInt32LE(type, 4);
  return Buffer.concat([head, data]);
};
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
writeFileSync(TARGET, Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, bin)]));
console.log(`${TARGET}: ${Math.round((28 + json.length + bin.length) / 1024)} Ko`);
