import {
  BufferGeometry,
  Float32BufferAttribute,
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
import { fillGeometry, lineGeometry } from './atlas-geometry';
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

/** Within a hundredth of a unit of the sheet's edge, a point lies on the cut: the cut's own points
 *  sit within four thousandths, the nearest true shore (Fiji, Tuvalu) twenty. */
const SEAM_TOLERANCE = 0.01;

/**
 * **La côte sépare la terre de la mer** (ADR 0034), sauf là où la Tchoukotka et les Fidji sont
 * coupées à l'antiméridien : la coupe n'a la mer d'aucun côté, seulement le bord de la feuille, et
 * l'encre la plus grasse le soulignerait. Une coupe prolonge parfois la vraie côte dans le même
 * arc : c'est le segment qu'on retire, pas l'arc.
 */
export function coastLines(
  atlas: Atlas,
  detail: Detail,
  frame: WorldFrame,
): { points: Float32Array }[] {
  const onSeam = (x: number, y: number) => {
    const { westX, eastX } = frame.edgeAtLatitude(frame.lonLatAt(x, y)[1]);
    return Math.min(Math.abs(x - westX), Math.abs(x - eastX)) < SEAM_TOLERANCE;
  };
  const lines: { points: Float32Array }[] = [];
  for (const { points } of atlas.borders((a, b) => !a !== !b, detail)) {
    let start = 0;
    for (let i = 2; i <= points.length; i += 2) {
      const cut =
        i === points.length ||
        (onSeam(points[i - 2]!, points[i - 1]!) && onSeam(points[i]!, points[i + 1]!));
      if (!cut) continue;
      if (i - start >= 4) lines.push({ points: points.subarray(start, i) });
      start = i;
    }
  }
  return lines;
}

/** Le plancher : de loin, la côte reste un trait gras et non le cheveu d'une ligne WebGL. */
export const COAST_FLOOR_PX = 0.75;
/** Sa largeur sur la feuille, quelque dix pour cent d'un fantassin : au rapproché elle grossit
 *  comme l'encre du prototype, gravée dans sa texture. */
const COAST_WIDTH = 0.015;

export const coastWidthPx = (unitsPerPixel: number): number =>
  Math.max(COAST_FLOOR_PX, COAST_WIDTH / unitsPerPixel);

const COAST_OPACITY = 0.92;

/** One level of the atlas, as the sheet draws it: the land of each country, the ink between
 *  countries, the coast and its wash. */
export type SheetLevel = {
  readonly lands: ReadonlyMap<string, BufferGeometry>;
  readonly ink: BufferGeometry;
  readonly coast: LineSegmentsGeometry;
  readonly wash: BufferGeometry;
};

export function sheetLevel(atlas: Atlas, detail: Detail, frame: WorldFrame): SheetLevel {
  const lands = new Map<string, BufferGeometry>();
  for (const [adm0, shapes] of atlas.shapes((region) => region.country, detail))
    lands.set(adm0, fillGeometry(shapes, frame, COUNTRY_THICKNESS));
  const height = COUNTRY_THICKNESS + BORDER_LIFT;
  const between = atlas.borders(
    (a, b) => a !== null && b !== null && a.country !== b.country,
    detail,
  );
  const ink = new BufferGeometry();
  ink.setAttribute('position', new Float32BufferAttribute(lineGeometry(between, frame, height), 3));
  const coast = new LineSegmentsGeometry();
  coast.setPositions(lineGeometry(coastLines(atlas, detail, frame), frame, height));
  const land = [...atlas.shapes(() => 'land', detail).values()].flat();
  return { lands, ink, coast, wash: washGeometry(land, frame) };
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
