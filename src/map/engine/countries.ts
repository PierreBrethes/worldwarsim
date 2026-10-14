import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  ReplaceStencilOp,
  Shape,
  ShapeGeometry,
} from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { OutlineSample, ProjectedCountry, World } from '@/domain/world';
import { PALETTE } from './palette';
import { COUNTRY_THICKNESS, LAND_STENCIL, RECESSION, type WorldFrame } from './frame';
import { screenTrame } from './regions';

/**
 * Two keys because two vocabularies meet on the sheet: `name` is what `world.json` inks by,
 * `adm0` is what everything outside the map designates a country with — a selection, a target,
 * a label. Picking answers with the second, colouring reads the first.
 */
export type CountryMesh = Mesh<BufferGeometry, MeshStandardMaterial> & {
  userData: { name: string; adm0: string; pencil: { value: number } };
};

/**
 * Strokes sit flush on the sheet; it is the ground that recedes in depth to make room for
 * them. Lifting them would do up close, but in world view the buffer's precision exceeds a
 * tenth of a unit — no reasonable elevation would survive it.
 */
const BORDER_LIFT = 0.004;

/**
 * **Ce qu'on n'a jamais relevé est au crayon** (`table-etat-major.md`, ADR 0020 §5) : un grain de
 * graphite et un trait oblique à peine posé, en pixels d'écran comme la hachure des zones
 * suspendues. Il porte sur tout le sol et c'est l'encre des régions connues qui le couvre : la
 * région vierge est simplement celle où rien n'est venu par-dessus, sans liste à tenir.
 * Couleur déjà encodée en sRGB à ce point du programme, d'où un graphite écrit en clair.
 */
const PENCIL = `
  float tooth = fract(sin(dot(floor(trame), vec2(12.9898, 78.233))) * 43758.5453);
  float stroke = 1.0 - smoothstep(0.5, 1.3, mod(trame.x - trame.y, 7.0));
  float lead = 0.10 * stroke * (0.5 + 0.5 * tooth) + 0.05 * step(0.86, tooth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.29, 0.28, 0.26), lead * pencil);`;

/**
 * **Une feuille, pas une dalle** (table d'état-major, 13/10/2026) : le pays est un aplat posé sur
 * la mer, sans paroi ni épaisseur — la côte est un trait d'encre, pas une falaise. Les dix-huit
 * centièmes qui le séparent de la mer ne sont là que pour le tampon de profondeur.
 */
function flatRings(country: ProjectedCountry, frame: WorldFrame): BufferGeometry {
  const geometries = country.rings.map((ring) => {
    const shape = new Shape();
    ring.forEach(([px, py], index) => {
      const x = px - frame.centerX;
      const y = -(py - frame.centerY);
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    const geometry = new ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, COUNTRY_THICKNESS, 0);
    return geometry;
  });
  return geometries.length > 1 ? mergeGeometries(geometries, false)! : geometries[0]!;
}

type Point = readonly [number, number];
type Edge = readonly [Point, Point];

/**
 * **La côte est le trait le plus fort de la feuille, la frontière un trait d'encre** (POC
 * `table-etat-major`, 14/10/2026). Natural Earth trace deux fois une frontière terrestre, une
 * fois par pays, sur les mêmes sommets : une arête vue deux fois est une frontière, une arête
 * vue une fois borde la mer.
 */
export function splitOutlines(
  countries: ReadonlyArray<ReadonlyArray<ReadonlyArray<Point>>>,
  sheet: ReadonlyArray<OutlineSample> = [],
): {
  coast: Edge[];
  borders: Edge[];
} {
  const seen = new Map<string, { edge: Edge; count: number }>();
  for (const rings of countries)
    for (const ring of rings)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        const [low, high] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
        const key = `${low[0]},${low[1]},${high[0]},${high[1]}`;
        const known = seen.get(key);
        if (known) known.count++;
        else seen.set(key, { edge: [low, high], count: 1 });
      }
  const coast: Edge[] = [];
  const borders: Edge[] = [];
  for (const { edge, count } of seen.values()) {
    if (count > 1) borders.push(edge);
    else if (!edge.every((point) => onSheetEdge(point, sheet))) coast.push(edge);
  }
  return { coast, borders };
}

/** Au-delà de deux décimales du `world.json`, sans toucher la vraie côte la plus proche du bord. */
const SHEET_EDGE_TOLERANCE = 0.15;

/**
 * La Tchoukotka et les Fidji sont coupées à l'antiméridien : l'arête de coupe, vue une fois,
 * passerait pour une côte et soulignerait le bord de la feuille de l'encre la plus grasse.
 */
function onSheetEdge([x, y]: Point, sheet: ReadonlyArray<OutlineSample>): boolean {
  for (let i = 1; i < sheet.length; i++) {
    const [, westA, eastA, yA] = sheet[i - 1]!;
    const [, westB, eastB, yB] = sheet[i]!;
    if ((y - yA) * (y - yB) > 0) continue;
    const share = yA === yB ? 0 : (y - yA) / (yB - yA);
    const west = westA + (westB - westA) * share;
    const east = eastA + (eastB - eastA) * share;
    return Math.abs(x - west) < SHEET_EDGE_TOLERANCE || Math.abs(x - east) < SHEET_EDGE_TOLERANCE;
  }
  return false;
}

/** Le plancher : de loin, la côte reste un trait gras et non le cheveu d'une ligne WebGL. */
export const COAST_FLOOR_PX = 1.5;
/** Sa largeur sur la feuille, quelque vingt pour cent d'un fantassin : au rapproché elle grossit
 *  comme l'encre du prototype, gravée dans sa texture. */
const COAST_WIDTH = 0.03;

export const coastWidthPx = (unitsPerPixel: number): number =>
  Math.max(COAST_FLOOR_PX, COAST_WIDTH / unitsPerPixel);

const COAST_OPACITY = 0.92;

function strokePositions(edges: ReadonlyArray<Edge>, frame: WorldFrame): number[] {
  const height = COUNTRY_THICKNESS + BORDER_LIFT;
  return edges.flatMap(([a, b]) => [
    a[0] - frame.centerX,
    height,
    a[1] - frame.centerY,
    b[0] - frame.centerX,
    height,
    b[1] - frame.centerY,
  ]);
}

export function buildCountries(
  world: World,
  frame: WorldFrame,
): {
  meshes: CountryMesh[];
  borders: LineSegments<BufferGeometry, LineBasicMaterial>;
  coast: LineSegments2;
} {
  const meshes: CountryMesh[] = [];

  for (const country of world.countries) {
    const material = screenTrame(
      new MeshStandardMaterial({
        color: PALETTE.neutralLand,
        roughness: 0.97,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: RECESSION.land,
        stencilWrite: true,
        stencilRef: LAND_STENCIL,
        stencilZPass: ReplaceStencilOp,
      }),
      PENCIL,
    );
    /** The pencil's share: a sheet painted whole is ink laid over it, as a region fill was. */
    const pencil = { value: 1 };
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      shader.uniforms.pencil = pencil;
      shader.fragmentShader = `uniform float pencil;\n${shader.fragmentShader}`;
    };
    const mesh = new Mesh(flatRings(country, frame), material) as CountryMesh;
    mesh.userData = { name: country.name, adm0: country.adm0, pencil };
    meshes.push(mesh);
  }

  const { coast: shore, borders: frontiers } = splitOutlines(
    world.countries.map((country) => country.rings),
    world.outline,
  );
  const bordersGeometry = new BufferGeometry();
  bordersGeometry.setAttribute(
    'position',
    new Float32BufferAttribute(strokePositions(frontiers, frame), 3),
  );
  const borders = new LineSegments(
    bordersGeometry,
    new LineBasicMaterial({ color: PALETTE.border, transparent: true, opacity: 0.62 }),
  );
  const coastGeometry = new LineSegmentsGeometry();
  coastGeometry.setPositions(strokePositions(shore, frame));
  const coast = new LineSegments2(
    coastGeometry,
    new LineMaterial({
      color: PALETTE.border,
      linewidth: COAST_FLOOR_PX,
      transparent: true,
      opacity: COAST_OPACITY,
    }),
  );

  return { meshes, borders, coast };
}
