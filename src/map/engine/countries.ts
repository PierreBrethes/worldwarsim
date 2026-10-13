import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ProjectedCountry, World } from '@/domain/world';
import type { Curvature } from './curvature';
import { PALETTE } from './palette';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { screenTrame } from './regions';

/**
 * Two keys because two vocabularies meet on the sheet: `name` is what `world.json` inks by,
 * `adm0` is what everything outside the map designates a country with — a selection, a target,
 * a label. Picking answers with the second, colouring reads the first.
 */
export type CountryMesh = Mesh<BufferGeometry, MeshStandardMaterial> & {
  userData: { name: string; adm0: string };
};

/**
 * Strokes sit flush on the sheet; it is the ground that recedes in depth to make room for
 * them. Lifting them would do up close, but in world view the buffer's precision exceeds a
 * tenth of a unit — no reasonable elevation would survive it.
 *
 * Recession in units only, never as a slope factor: in world view the board is seen almost
 * edge-on, and the slope term would push the land behind the sea there.
 */
const BORDER_LIFT = 0.004;
const GROUND_RECESSION = 2;

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
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.29, 0.28, 0.26), lead);`;

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

function outlinesOf(country: ProjectedCountry, frame: WorldFrame): BufferGeometry {
  const points: number[] = [];
  for (const ring of country.rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      points.push(
        a[0] - frame.centerX,
        COUNTRY_THICKNESS + BORDER_LIFT,
        a[1] - frame.centerY,
        b[0] - frame.centerX,
        COUNTRY_THICKNESS + BORDER_LIFT,
        b[1] - frame.centerY,
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  return geometry;
}

export function buildCountries(
  world: World,
  frame: WorldFrame,
  curvature: Curvature,
): { meshes: CountryMesh[]; borders: LineSegments<BufferGeometry, LineBasicMaterial> } {
  const meshes: CountryMesh[] = [];
  const outlines: BufferGeometry[] = [];

  for (const country of world.countries) {
    const mesh = new Mesh(
      curvature.register(flatRings(country, frame)),
      screenTrame(
        new MeshStandardMaterial({
          color: PALETTE.neutralLand,
          roughness: 0.97,
          metalness: 0,
          polygonOffset: true,
          polygonOffsetFactor: 0,
          polygonOffsetUnits: GROUND_RECESSION,
        }),
        PENCIL,
      ),
    ) as CountryMesh;
    mesh.userData = { name: country.name, adm0: country.adm0 };
    meshes.push(mesh);
    outlines.push(outlinesOf(country, frame));
  }

  const borders = new LineSegments(
    curvature.register(mergeGeometries(outlines, false)!),
    new LineBasicMaterial({ color: PALETTE.border, transparent: true, opacity: 0.62 }),
  );

  return { meshes, borders };
}
