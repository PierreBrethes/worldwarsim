import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  OctahedronGeometry,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import type { TypeRegion } from '@/domaine/monde';

/**
 * Lavis de survol par type — des encres sourdes, sous l'opacité du matériau de
 * surbrillance : la carte reste papier, la teinte n'est qu'une indication.
 */
export const TEINTES_TYPE: Record<TypeRegion, string> = {
  plaine: '#a8a352',
  forêt: '#48663a',
  jungle: '#2f7a4c',
  montagne: '#8a8072',
  désert: '#c99f56',
  toundra: '#9fbfc4',
};

const geometries: BufferGeometry[] = [];
const materiaux: Material[] = [];

function geometrie<G extends BufferGeometry>(g: G): G {
  geometries.push(g);
  return g;
}

function materiau(couleur: string): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: couleur });
  materiaux.push(m);
  return m;
}

/**
 * Chaque accessoire est bâti à hauteur unitaire, base posée en y = 0 : le moteur
 * n'a plus qu'à le poser au sol et à jouer l'échelle pour l'animation de pousse.
 */
const FABRIQUES: Record<TypeRegion, () => Group> = (() => {
  const tronc = materiau('#5d4630');
  const sapin = materiau('#3c5a30');
  const canopee = materiau('#2f7a3e');
  const roche = materiau('#7d7568');
  const neige = materiau('#ede8dc');
  const sable = materiau('#d3aa60');
  const glace = materiau('#c8dde0');
  const ble = materiau('#c2b45a');

  const coneSapin = geometrie(new ConeGeometry(0.3, 0.85, 6).translate(0, 0.575, 0));
  const troncCourt = geometrie(new CylinderGeometry(0.06, 0.08, 0.18, 5).translate(0, 0.09, 0));
  const troncLong = geometrie(new CylinderGeometry(0.05, 0.07, 0.55, 5).translate(0, 0.275, 0));
  const boule = geometrie(new SphereGeometry(0.34, 7, 5).scale(1, 0.72, 1).translate(0, 0.72, 0));
  const pyramide = geometrie(new ConeGeometry(0.55, 1, 4).translate(0, 0.5, 0));
  const calotte = geometrie(new ConeGeometry(0.21, 0.38, 4).translate(0, 0.81, 0));
  const dune = geometrie(new SphereGeometry(0.5, 8, 5).scale(1, 0.35, 0.6).translate(0, 0, 0));
  const eclat = geometrie(new OctahedronGeometry(0.32).scale(1, 1.5, 1).translate(0, 0.48, 0));
  const epi = geometrie(new ConeGeometry(0.09, 0.55, 5).translate(0, 0.275, 0));

  const groupe = (...meshes: Mesh[]): Group => {
    const g = new Group();
    for (const mesh of meshes) g.add(mesh);
    return g;
  };

  return {
    forêt: () => groupe(new Mesh(troncCourt, tronc), new Mesh(coneSapin, sapin)),
    jungle: () => groupe(new Mesh(troncLong, tronc), new Mesh(boule, canopee)),
    montagne: () => groupe(new Mesh(pyramide, roche), new Mesh(calotte, neige)),
    désert: () => groupe(new Mesh(dune, sable)),
    toundra: () => groupe(new Mesh(eclat, glace)),
    plaine: () => {
      const gauche = new Mesh(epi, ble);
      gauche.position.set(-0.12, 0, 0.05);
      const droite = new Mesh(epi, ble);
      droite.position.set(0.13, 0, -0.06);
      droite.scale.setScalar(0.8);
      return groupe(new Mesh(epi, ble), gauche, droite);
    },
  };
})();

export function creerAccessoire(type: TypeRegion): Group {
  return FABRIQUES[type]();
}

export function libererTerrain(): void {
  for (const g of geometries) g.dispose();
  for (const m of materiaux) m.dispose();
}
