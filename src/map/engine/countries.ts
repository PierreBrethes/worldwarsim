import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ReplaceStencilOp,
} from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { Atlas, Detail } from '@/domain/atlas';
import { PALETTE } from './palette';
import { COUNTRY_THICKNESS, LAND_STENCIL, RECESSION, type WorldFrame } from './frame';
import { screenTrame } from './regions';
import {
  fillGeometry,
  fromGeometryData,
  geometryData,
  lineGeometry,
  type GeometryData,
  offTheSeam,
} from './atlas-geometry';
import { buildCoastalWash, washGeometry } from './coastal-wash';

/** A country's sheet, by its Natural Earth `adm0_a3`: what a selection, a target, a label
 *  designate it with. */
export type CountryMesh = Mesh<BufferGeometry, MeshStandardMaterial> & {
  userData: { adm0: string };
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
 * suspendues. Il porte sur tout le sol, sans liste à tenir : depuis qu'aucun aplat ne le couvre
 * (ADR 0033), c'est le contour qui distingue une région connue d'une région vierge.
 * Couleur déjà encodée en sRGB à ce point du programme, d'où un graphite écrit en clair.
 */
const PENCIL = `
  float tooth = fract(sin(dot(floor(trame), vec2(12.9898, 78.233))) * 43758.5453);
  float stroke = 1.0 - smoothstep(0.5, 1.3, mod(trame.x - trame.y, 7.0));
  float lead = 0.10 * stroke * (0.5 + 0.5 * tooth) + 0.05 * step(0.86, tooth);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.29, 0.28, 0.26), lead);`;

/** La côte sépare la terre de la mer (ADR 0034), hors de la coupe de l'antiméridien. */
export function coastLines(
  atlas: Atlas,
  detail: Detail,
  frame: WorldFrame,
): { points: Float32Array }[] {
  return atlas
    .borders((a, b) => !a !== !b, detail)
    .flatMap(({ points }) => offTheSeam(points, frame).map((run) => ({ points: run })));
}

/** Le plancher : de loin, la côte reste un trait gras et non le cheveu d'une ligne WebGL. */
export const COAST_FLOOR_PX = 0.75;
/** Sa largeur sur la feuille, quelque dix pour cent d'un fantassin : au rapproché elle grossit
 *  comme l'encre du prototype, gravée dans sa texture. */
const COAST_WIDTH = 0.015;

export const coastWidthPx = (unitsPerPixel: number): number =>
  Math.max(COAST_FLOOR_PX, COAST_WIDTH / unitsPerPixel);

const COAST_OPACITY = 0.92;

/**
 * **Le niveau « près » quand l'écran peut le lire** (ADR 0034) : « loin » garde 6 % des points,
 * un écart moyen d'un kilomètre ; avec 42° de champ sur 900 px, un pixel vaut 0,00085 u par unité
 * de distance, soit 2 km à 25. Le calcul ne voit pas les facettes : à 26, « loin » casse en angles
 * les Féroé, les Shetland et les fjords. « Près » prend donc la main dès 35. Deux seuils, pour
 * qu'un zoom arrêté entre les deux ne batte pas d'un niveau à l'autre. @a-mesurer
 */
const NEAR_UNDER = 35;
const FAR_OVER = 37;

export const levelAt = (current: Detail, distance: number): Detail =>
  current === 'near'
    ? distance > FAR_OVER
      ? 'far'
      : 'near'
    : distance < NEAR_UNDER
      ? 'near'
      : 'far';

/** One level of the atlas, as the sheet draws it: the land of each country, the ink between
 *  countries, the coast and its wash. */
export type SheetLevel = {
  readonly lands: ReadonlyMap<string, BufferGeometry>;
  readonly ink: BufferGeometry;
  readonly coast: LineSegmentsGeometry;
  readonly wash: BufferGeometry;
};

/** The same level as bare arrays, built off the main thread for the near level. */
export type SheetData = {
  readonly lands: ReadonlyArray<readonly [string, GeometryData]>;
  readonly ink: Float32Array;
  readonly coast: Float32Array;
  readonly wash: GeometryData;
};

export function sheetData(atlas: Atlas, detail: Detail, frame: WorldFrame): SheetData {
  const lands = [...atlas.shapes((region) => region.country, detail)].map(
    ([adm0, shapes]) =>
      [adm0, geometryData(fillGeometry(shapes, frame, COUNTRY_THICKNESS))] as const,
  );
  const height = COUNTRY_THICKNESS + BORDER_LIFT;
  const between = atlas.borders(
    (a, b) => a !== null && b !== null && a.country !== b.country,
    detail,
  );
  const land = [...atlas.shapes(() => 'land', detail).values()].flat();
  return {
    lands,
    ink: lineGeometry(between, frame, height),
    coast: lineGeometry(coastLines(atlas, detail, frame), frame, height),
    wash: geometryData(washGeometry(land, frame)),
  };
}

export function levelOf(data: SheetData): SheetLevel {
  const ink = new BufferGeometry();
  ink.setAttribute('position', new BufferAttribute(data.ink, 3));
  const coast = new LineSegmentsGeometry();
  coast.setPositions(data.coast);
  return {
    lands: new Map(data.lands.map(([adm0, land]) => [adm0, fromGeometryData(land)])),
    ink,
    coast,
    wash: fromGeometryData(data.wash),
  };
}

/**
 * **La côte est le trait le plus fort de la feuille, la frontière un trait d'encre** (POC
 * `table-etat-major`, 14/10/2026). The sheet is built on one level and switches to another with
 * `showLevel`: the meshes stay, only their geometry changes.
 */
export type CountrySheet = {
  readonly meshes: CountryMesh[];
  readonly borders: LineSegments<BufferGeometry, LineBasicMaterial>;
  readonly coast: LineSegments2;
  readonly wash: Mesh<BufferGeometry, MeshBasicMaterial>;
};

export function buildCountries(level: SheetLevel): CountrySheet {
  /**
   * **Une feuille, pas une dalle** (table d'état-major, 13/10/2026) : le pays est un aplat posé
   * sur la mer, sans paroi ni épaisseur — la côte est un trait d'encre, pas une falaise.
   */
  const meshes = [...level.lands].map(([adm0, geometry]) => {
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
    const mesh = new Mesh(geometry, material) as CountryMesh;
    mesh.userData = { adm0 };
    return mesh;
  });
  const borders = new LineSegments(
    level.ink,
    new LineBasicMaterial({ color: PALETTE.border, transparent: true, opacity: 0.62 }),
  );
  const coast = new LineSegments2(
    level.coast,
    new LineMaterial({
      color: PALETTE.border,
      linewidth: COAST_FLOOR_PX,
      transparent: true,
      opacity: COAST_OPACITY,
    }),
  );
  return { meshes, borders, coast, wash: buildCoastalWash(level.wash) };
}

/** Every level holds every country (ADR 0034: each region has a shape at both levels). */
export function showLevel(sheet: CountrySheet, level: SheetLevel): void {
  for (const mesh of sheet.meshes) mesh.geometry = level.lands.get(mesh.userData.adm0)!;
  sheet.borders.geometry = level.ink;
  sheet.coast.geometry = level.coast;
  sheet.wash.geometry = level.wash;
}
