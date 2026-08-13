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
import type { Monde, PaysProjete } from '@/domaine/monde';
import type { Courbure } from './courbure';
import { PALETTE } from './palette';
import { EPAISSEUR_PAYS, TIRANT_EAU, type RepereMonde } from './repere';

export type MeshPays = Mesh<BufferGeometry, MeshStandardMaterial> & {
  userData: { nom: string };
};

/**
 * Les traits se posent au ras de la dalle ; c'est le sol qui recule dans la profondeur pour
 * leur laisser la place. Les soulever suffirait de près, mais en vue monde la précision du
 * buffer dépasse le dixième d'unité — aucune élévation raisonnable n'y survivrait.
 *
 * Recul en unités seules, jamais en facteur de pente : en vue monde le plateau se voit
 * presque par la tranche, et le terme de pente y repousserait la terre derrière la mer.
 */
const POSE_FRONTIERE = 0.004;
const RECUL_SOL = 2;

function extruderAnneaux(pays: PaysProjete, repere: RepereMonde): BufferGeometry {
  const geometries = pays.anneaux.map((anneau) => {
    const forme = new Shape();
    anneau.forEach(([px, py], index) => {
      const x = px - repere.centreX;
      const y = -(py - repere.centreY);
      if (index === 0) forme.moveTo(x, y);
      else forme.lineTo(x, y);
    });
    const geometrie = new ExtrudeGeometry(forme, {
      depth: EPAISSEUR_PAYS + TIRANT_EAU,
      bevelEnabled: false,
    });
    geometrie.rotateX(-Math.PI / 2);
    geometrie.translate(0, -TIRANT_EAU, 0);
    return geometrie;
  });
  return geometries.length > 1 ? mergeGeometries(geometries, false)! : geometries[0]!;
}

function contoursDe(pays: PaysProjete, repere: RepereMonde): BufferGeometry {
  const points: number[] = [];
  for (const anneau of pays.anneaux) {
    for (let i = 0; i < anneau.length; i++) {
      const a = anneau[i]!;
      const b = anneau[(i + 1) % anneau.length]!;
      points.push(
        a[0] - repere.centreX, EPAISSEUR_PAYS + POSE_FRONTIERE, a[1] - repere.centreY,
        b[0] - repere.centreX, EPAISSEUR_PAYS + POSE_FRONTIERE, b[1] - repere.centreY,
      );
    }
  }
  const geometrie = new BufferGeometry();
  geometrie.setAttribute('position', new Float32BufferAttribute(points, 3));
  return geometrie;
}

export function construirePays(
  monde: Monde,
  repere: RepereMonde,
  courbure: Courbure,
): { meshes: MeshPays[]; frontieres: LineSegments<BufferGeometry, LineBasicMaterial> } {
  const meshes: MeshPays[] = [];
  const contours: BufferGeometry[] = [];

  for (const pays of monde.pays) {
    const mesh = new Mesh(
      courbure.enregistrer(extruderAnneaux(pays, repere)),
      new MeshStandardMaterial({
        color: PALETTE.terreNeutre,
        roughness: 0.97,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 0,
        polygonOffsetUnits: RECUL_SOL,
      }),
    ) as MeshPays;
    mesh.userData = { nom: pays.nom };
    meshes.push(mesh);
    contours.push(contoursDe(pays, repere));
  }

  const frontieres = new LineSegments(
    courbure.enregistrer(mergeGeometries(contours, false)!),
    new LineBasicMaterial({ color: PALETTE.frontiere, transparent: true, opacity: 0.62 }),
  );

  return { meshes, frontieres };
}
