import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Shape,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ProjectedCountry, World } from '@/domain/world';
import type { Curvature } from './curvature';
import { PALETTE } from './palette';
import { COUNTRY_THICKNESS, DRAFT, type WorldFrame } from './frame';

/**
 * Two keys because two vocabularies meet on the slab: `name` is what `world.json` inks by,
 * `adm0` is what everything outside the map designates a country with — a selection, a target,
 * a label. Picking answers with the second, colouring reads the first.
 */
export type CountryMesh = Mesh<BufferGeometry, MeshStandardMaterial> & {
  userData: { name: string; adm0: string };
};

/**
 * Strokes sit flush on the slab; it is the ground that recedes in depth to make room for
 * them. Lifting them would do up close, but in world view the buffer's precision exceeds a
 * tenth of a unit — no reasonable elevation would survive it.
 *
 * Recession in units only, never as a slope factor: in world view the board is seen almost
 * edge-on, and the slope term would push the land behind the sea there.
 */
const BORDER_LIFT = 0.004;
const GROUND_RECESSION = 2;

function extrudeRings(country: ProjectedCountry, frame: WorldFrame): BufferGeometry {
  const geometries = country.rings.map((ring) => {
    const shape = new Shape();
    ring.forEach(([px, py], index) => {
      const x = px - frame.centerX;
      const y = -(py - frame.centerY);
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    const geometry = new ExtrudeGeometry(shape, {
      depth: COUNTRY_THICKNESS + DRAFT,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -DRAFT, 0);
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
      curvature.register(extrudeRings(country, frame)),
      new MeshStandardMaterial({
        color: PALETTE.neutralLand,
        roughness: 0.97,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: GROUND_RECESSION,
      }),
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
