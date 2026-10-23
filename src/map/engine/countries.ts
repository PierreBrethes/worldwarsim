import {
  BufferAttribute,
  BufferGeometry,
  LineDashedMaterial,
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
import { TRAME_SCALE } from './regions';
import {
  fillGeometry,
  fromGeometryData,
  geometryData,
  lineGeometry,
  type GeometryData,
  offTheSeam,
  segmentDistances,
} from './atlas-geometry';
import { buildCoastalWash, washGeometry } from './coastal-wash';
import { inkDownAtNight, type NightUniforms } from './night-here';

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
 * **Le grain du papier** (#240), celui de la feuille des maquettes (`drawGrainAndNight`) : un
 * bruit fin, plus clair ou plus sombre au hasard de 0 à 6 % de la couleur éclairée
 * (multiplicatif : de nuit, sur un sol sombre, il reste sous le trait d'une région, comme dans la
 * maquette où il passe avant le voile de nuit). Sans trait oblique : depuis l'ADR 0033 le sol
 * n'est plus distingué par sa trame, c'est le contour qui sépare une région connue d'une région
 * vierge (les hachures qui ont un sens restent à l'écran, `hatch`).
 *
 * **Collé à la carte** (#248) : fixe à l'écran, il faisait glisser la carte sous une vitre sale.
 * Le hasard se tire donc par case du plateau, et la case garde une taille d'écran à peu près
 * constante : deux échelles d'un facteur 2, de 0,7 à 2,8 pixels CSS (`GRAIN_PX`) : une case
 * plus fine se remélange à chaque glissé de moins d'un pixel, une plus grosse se voit en pavés.
 * Elles se fondent selon les pixels que couvre le fragment (`dFdx` : la pente et le pincement
 * sans uniforme ni image de plus). Le hasard d'une échelle ne dépend que de son rang absolu :
 * quand l'une passe le relais à la suivante, rien ne saute. Les cases bouclent tous les 1024 de
 * chaque côté, invisible, pour garder le hachage précis en virgule flottante. @a-mesurer
 *
 * **Au loin, sous la pente**, le sol s'écrase dans la profondeur et pas en travers : une case
 * taillée sur l'axe écrasé s'étalait en pavé plat. La case se taille donc sur l'axe le moins
 * écrasé (l'aire du pixel sur le plateau, divisée par sa plus grande longueur : la caméra tourne,
 * l'axe n'est pas celui du plateau), et le grain s'éteint quand l'écrasement passe de
 * `GRAIN_FLAT_FROM` à `GRAIN_FLAT_GONE`, avant de fourmiller : le loin rasant n'a plus de grain,
 * comme une brume. @a-mesurer
 */
const GRAIN_OPACITY = 0.06;
const GRAIN_PX = 0.7;
const GRAIN_FLAT_FROM = 2.5;
const GRAIN_FLAT_GONE = 5.0;
const GRAIN_HEAD = `
varying vec2 vGrain;
float grainAt(float scale) {
  vec2 cell = mod(floor(vGrain / exp2(scale)), 1024.0) + scale * vec2(17.0, 31.0);
  vec3 p3 = fract(cell.xyx * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z) * 2.0 - 1.0;
}
uniform float trameScale;
void main() {`;
const GRAIN_BODY = `
  vec2 gx = dFdx(vGrain);
  vec2 gy = dFdy(vGrain);
  float major = max(length(gx), length(gy));
  float minor = abs(gx.x * gy.y - gx.y * gy.x) / max(major, 1e-6);
  float span = max(minor, 1e-6) * trameScale * ${GRAIN_PX.toFixed(1)};
  float scale = floor(log2(span)) + 1.0;
  float share = fract(log2(span));
  float speck = mix(grainAt(scale), grainAt(scale + 1.0), share) / length(vec2(1.0 - share, share));
  float upright = 1.0 - smoothstep(${GRAIN_FLAT_FROM.toFixed(1)}, ${GRAIN_FLAT_GONE.toFixed(1)}, major / max(minor, 1e-6));
  gl_FragColor.rgb *= 1.0 + speck * ${GRAIN_OPACITY.toFixed(3)} * upright;`;

function paperGrain(material: MeshStandardMaterial): MeshStandardMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.trameScale = TRAME_SCALE;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vGrain;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGrain = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', GRAIN_HEAD)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>${GRAIN_BODY}`);
  };
  material.customProgramCacheKey = () => 'paper-grain';
  return material;
}

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
/** The country border's sepia (`PALETTE.frontier`) far out (`REST`) and up close (`MAX`), dotted
 *  as the mockups' sheet draws it (`gisements/commun/table.js`), over a region's solid stroke
 *  (`regions.ts`) and under the coast's near-black. Always darker than a region's, at any
 *  distance (#236); clearly lighter than the coast's ink it used to share (#248). @a-mesurer */
export const COUNTRY_BORDER_REST = 0.45;
export const COUNTRY_BORDER_MAX = 0.6;
/** The dots: 3 px inked for 2.5 px blank, the mockups' `setLineDash([3, 2.5])`, in screen pixels so
 *  the rhythm holds at any zoom. @a-mesurer */
export const COUNTRY_DASH_PX = 3;
export const COUNTRY_GAP_PX = 2.5;

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
  ink.setAttribute('lineDistance', new BufferAttribute(segmentDistances(data.ink), 1));
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
  readonly borders: LineSegments<BufferGeometry, LineDashedMaterial>;
  readonly coast: LineSegments2;
  readonly wash: Mesh<BufferGeometry, MeshBasicMaterial>;
};

export function buildCountries(level: SheetLevel, night: NightUniforms): CountrySheet {
  /**
   * **Une feuille, pas une dalle** (table d'état-major, 13/10/2026) : le pays est un aplat posé
   * sur la mer, sans paroi ni épaisseur — la côte est un trait d'encre, pas une falaise.
   */
  const meshes = [...level.lands].map(([adm0, geometry]) => {
    const material = paperGrain(
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
    );
    const mesh = new Mesh(geometry, material) as CountryMesh;
    mesh.userData = { adm0 };
    return mesh;
  });
  const borders = new LineSegments(
    level.ink,
    inkDownAtNight(
      new LineDashedMaterial({
        color: PALETTE.frontier,
        transparent: true,
        opacity: COUNTRY_BORDER_REST,
      }),
      night,
    ),
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
