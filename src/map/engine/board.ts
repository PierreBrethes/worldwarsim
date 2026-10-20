import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import type { World } from '@/domain/world';
import { seaMaterial, type SeaLayer } from './sea';
import { PALETTE } from './palette';
import { PLINTH_HEIGHT, SEA_LEVEL, type WorldFrame } from './frame';

const SURFACE_COLUMNS = 96;
/** Past the fog's far end from any eye the orbit allows. */
const TABLE_SIZE = 4000;
const PLANK_REPEAT = 60;

/**
 * The surface is not an optically masked rectangular plane: it is a grid built ON the
 * projected sphere's outline. The silhouette is therefore exact, and the plinth and the rim
 * align with it to the vertex.
 */
function buildSurface(world: World, frame: WorldFrame): BufferGeometry {
  const positions: number[] = [];
  const uv: number[] = [];
  const lonLat: number[] = [];
  const indices: number[] = [];
  const rows = world.outline.length;

  for (const [latitude, westX, eastX, y] of world.outline) {
    for (let column = 0; column <= SURFACE_COLUMNS; column++) {
      const x = westX + (eastX - westX) * (column / SURFACE_COLUMNS);
      positions.push(x - frame.centerX, SEA_LEVEL, y - frame.centerY);
      uv.push((x - world.sphere.minX) / frame.width, 1 - (y - world.sphere.minY) / frame.height);
      lonLat.push(-180 + (360 * column) / SURFACE_COLUMNS, latitude);
    }
  }
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < SURFACE_COLUMNS; column++) {
      const a = row * (SURFACE_COLUMNS + 1) + column;
      const b = a + 1;
      const c = a + SURFACE_COLUMNS + 1;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  // The sea engraves its graticule from these: Natural Earth is linear in longitude along a
  // row, so the interpolation is exact across, and a degree of latitude per row along.
  geometry.setAttribute('lonLat', new Float32BufferAttribute(lonLat, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildPlinth(world: World, frame: WorldFrame): BufferGeometry {
  const loop: Array<[number, number]> = [];
  for (const [, , eastX, y] of world.outline) loop.push([eastX, y]);
  for (let i = world.outline.length - 1; i >= 0; i--) {
    const sample = world.outline[i]!;
    loop.push([sample[1], sample[3]]);
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const top = new Color(PALETTE.plinthTop);
  const bottom = new Color(PALETTE.plinthBottom);

  for (let i = 0; i < loop.length; i++) {
    const [ax, ay] = loop[i]!;
    const [bx, by] = loop[(i + 1) % loop.length]!;
    const x1 = ax - frame.centerX;
    const z1 = ay - frame.centerY;
    const x2 = bx - frame.centerX;
    const z2 = by - frame.centerY;
    positions.push(
      x1,
      SEA_LEVEL,
      z1,
      x2,
      SEA_LEVEL,
      z2,
      x1,
      -PLINTH_HEIGHT,
      z1,
      x2,
      SEA_LEVEL,
      z2,
      x2,
      -PLINTH_HEIGHT,
      z2,
      x1,
      -PLINTH_HEIGHT,
      z1,
    );
    for (const color of [top, top, bottom, top, bottom, bottom]) {
      colors.push(color.r, color.g, color.b);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildRim(
  world: World,
  frame: WorldFrame,
): { band: BufferGeometry; stroke: BufferGeometry } {
  const INSET = 0.996;
  const vertices: number[] = [];
  const strokes: number[] = [];
  const push = (x: number, y: number, factor: number) =>
    vertices.push((x - frame.centerX) * factor, 0.5, (y - frame.centerY) * factor);

  for (const side of [2, 1] as const) {
    for (let i = 0; i < world.outline.length - 1; i++) {
      const a = world.outline[i]!;
      const b = world.outline[i + 1]!;
      push(a[side], a[3], 1);
      push(b[side], b[3], 1);
      push(a[side], a[3], INSET);
      push(b[side], b[3], 1);
      push(b[side], b[3], INSET);
      push(a[side], a[3], INSET);
      strokes.push(
        a[side] - frame.centerX,
        0.55,
        a[3] - frame.centerY,
        b[side] - frame.centerX,
        0.55,
        b[3] - frame.centerY,
      );
    }
  }

  const band = new BufferGeometry();
  band.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  const stroke = new BufferGeometry();
  stroke.setAttribute('position', new Float32BufferAttribute(strokes, 3));
  return { band, stroke };
}

/** Planks of the table's wood, drawn once: streaks of a darker ink along the grain, a seam
 *  between planks. Repeated every `PLANK_REPEAT` units over the table. */
function woodGrain(anisotropy: number): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  context.fillStyle = PALETTE.table;
  context.fillRect(0, 0, size, size);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let k = 0; k < 140; k++) {
    const y = random() * size;
    context.strokeStyle = `rgba(30, 18, 8, ${0.08 + random() * 0.18})`;
    context.lineWidth = 0.5 + random() * 1.5;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(
      size / 3,
      y + random() * 6 - 3,
      (2 * size) / 3,
      y + random() * 6 - 3,
      size,
      y,
    );
    context.stroke();
  }
  context.fillStyle = 'rgba(20, 12, 5, 0.55)';
  for (const y of [0, size / 2]) context.fillRect(0, y, size, 1.5);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(TABLE_SIZE / PLANK_REPEAT, TABLE_SIZE / PLANK_REPEAT);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * The sea comes back apart from the rest because it is the only piece of the board a pointer
 * needs to hit: a right click on open water still names a place, and the plinth and the rim
 * are decoration a ray must go straight through.
 */
export function buildBoard(
  world: World,
  frame: WorldFrame,
  anisotropy: number,
  swell: SeaLayer | null,
): { surface: Mesh; decor: Object3D[] } {
  const surface = new Mesh(
    buildSurface(world, frame),
    swell ? swell.swell(seaMaterial(world, anisotropy)) : seaMaterial(world, anisotropy),
  );

  const plinth = new Mesh(
    buildPlinth(world, frame),
    new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      side: DoubleSide,
    }),
  );

  const { band, stroke } = buildRim(world, frame);
  const rim = new Mesh(
    band,
    new MeshBasicMaterial({
      color: PALETTE.worldRim,
      transparent: true,
      opacity: 0.7,
      blending: NormalBlending,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  const sharpOutline = new LineSegments(
    stroke,
    new LineBasicMaterial({ color: PALETTE.rimStroke, transparent: true, opacity: 0.85 }),
  );

  /** **La table sous le plateau** (#187) : la caméra va où elle veut, et au-delà du bord on voit
   *  le bois sur lequel la carte est posée, qui s'en va dans le brouillard du bureau — plus une
   *  bande noire. */
  const table = new Mesh(
    new PlaneGeometry(TABLE_SIZE, TABLE_SIZE),
    new MeshStandardMaterial({ map: woodGrain(anisotropy), roughness: 0.85, metalness: 0 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -PLINTH_HEIGHT;
  table.receiveShadow = true;

  return { surface, decor: [table, plinth, rim, sharpOutline] };
}
