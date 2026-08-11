import {
  BufferGeometry,
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
} from 'three';
import type { Monde } from '@/domaine/monde';
import type { Courbure } from './courbure';
import { creerTextureDeMer } from './bathymetrie';
import { PALETTE } from './palette';
import { HAUTEUR_SOCLE, NIVEAU_MER, type RepereMonde } from './repere';

const COLONNES_SURFACE = 96;

/**
 * La surface n'est pas un plan rectangulaire masqué optiquement : c'est une grille
 * construite SUR le contour de la sphère projetée. La silhouette est donc exacte,
 * et le socle comme la bordure s'y alignent au sommet près.
 */
function construireSurface(monde: Monde, repere: RepereMonde): BufferGeometry {
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const lignes = monde.contour.length;

  for (const [, xOuest, xEst, y] of monde.contour) {
    for (let colonne = 0; colonne <= COLONNES_SURFACE; colonne++) {
      const x = xOuest + (xEst - xOuest) * (colonne / COLONNES_SURFACE);
      positions.push(x - repere.centreX, NIVEAU_MER, y - repere.centreY);
      uv.push((x - monde.sphere.minX) / repere.largeur, 1 - (y - monde.sphere.minY) / repere.hauteur);
    }
  }
  for (let ligne = 0; ligne < lignes - 1; ligne++) {
    for (let colonne = 0; colonne < COLONNES_SURFACE; colonne++) {
      const a = ligne * (COLONNES_SURFACE + 1) + colonne;
      const b = a + 1;
      const c = a + COLONNES_SURFACE + 1;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  const geometrie = new BufferGeometry();
  geometrie.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometrie.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometrie.setIndex(indices);
  geometrie.computeVertexNormals();
  return geometrie;
}

function construireSocle(monde: Monde, repere: RepereMonde): BufferGeometry {
  const boucle: Array<[number, number]> = [];
  for (const [, , xEst, y] of monde.contour) boucle.push([xEst, y]);
  for (let i = monde.contour.length - 1; i >= 0; i--) {
    const echantillon = monde.contour[i]!;
    boucle.push([echantillon[1], echantillon[3]]);
  }

  const positions: number[] = [];
  const couleurs: number[] = [];
  const haut = new Color(PALETTE.socleHaut);
  const bas = new Color(PALETTE.socleBas);

  for (let i = 0; i < boucle.length; i++) {
    const [ax, ay] = boucle[i]!;
    const [bx, by] = boucle[(i + 1) % boucle.length]!;
    const x1 = ax - repere.centreX;
    const z1 = ay - repere.centreY;
    const x2 = bx - repere.centreX;
    const z2 = by - repere.centreY;
    positions.push(
      x1, NIVEAU_MER, z1, x2, NIVEAU_MER, z2, x1, -HAUTEUR_SOCLE, z1,
      x2, NIVEAU_MER, z2, x2, -HAUTEUR_SOCLE, z2, x1, -HAUTEUR_SOCLE, z1,
    );
    for (const couleur of [haut, haut, bas, haut, bas, bas]) {
      couleurs.push(couleur.r, couleur.g, couleur.b);
    }
  }

  const geometrie = new BufferGeometry();
  geometrie.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometrie.setAttribute('color', new Float32BufferAttribute(couleurs, 3));
  geometrie.computeVertexNormals();
  return geometrie;
}

/**
 * Natural Earth 1 est linéaire en longitude : x(lon, lat) = centre + (lon/180)·(bordEst(lat) − centre).
 * Les méridiens sont donc exacts sans reprojeter quoi que ce soit, et ceux à ±180°
 * tombent pile sur la bordure du monde.
 */
function construireGraticule(monde: Monde, repere: RepereMonde): BufferGeometry {
  const xPour = (longitude: number, index: number) =>
    (longitude / 180) * (monde.contour[index]![2] - repere.centreX);
  const points: number[] = [];

  for (let longitude = -180; longitude <= 180; longitude += 30) {
    for (let i = 0; i < monde.contour.length - 1; i++) {
      points.push(
        xPour(longitude, i), 0.3, monde.contour[i]![3] - repere.centreY,
        xPour(longitude, i + 1), 0.3, monde.contour[i + 1]![3] - repere.centreY,
      );
    }
  }
  for (const latitude of [-60, -30, 0, 30, 60]) {
    const index = latitude + 90;
    const z = monde.contour[index]![3] - repere.centreY;
    for (let longitude = -180; longitude < 180; longitude += 6) {
      points.push(xPour(longitude, index), 0.3, z, xPour(longitude + 6, index), 0.3, z);
    }
  }

  const geometrie = new BufferGeometry();
  geometrie.setAttribute('position', new Float32BufferAttribute(points, 3));
  return geometrie;
}

function construireBordure(monde: Monde, repere: RepereMonde): { bande: BufferGeometry; trait: BufferGeometry } {
  const RETRAIT = 0.982;
  const sommets: number[] = [];
  const traits: number[] = [];
  const ajouter = (x: number, y: number, facteur: number) =>
    sommets.push((x - repere.centreX) * facteur, 0.5, (y - repere.centreY) * facteur);

  for (const cote of [2, 1] as const) {
    for (let i = 0; i < monde.contour.length - 1; i++) {
      const a = monde.contour[i]!;
      const b = monde.contour[i + 1]!;
      ajouter(a[cote], a[3], 1); ajouter(b[cote], b[3], 1); ajouter(a[cote], a[3], RETRAIT);
      ajouter(b[cote], b[3], 1); ajouter(b[cote], b[3], RETRAIT); ajouter(a[cote], a[3], RETRAIT);
      traits.push(
        a[cote] - repere.centreX, 0.55, a[3] - repere.centreY,
        b[cote] - repere.centreX, 0.55, b[3] - repere.centreY,
      );
    }
  }

  const bande = new BufferGeometry();
  bande.setAttribute('position', new Float32BufferAttribute(sommets, 3));
  const trait = new BufferGeometry();
  trait.setAttribute('position', new Float32BufferAttribute(traits, 3));
  return { bande, trait };
}

export function construirePlateau(
  monde: Monde,
  repere: RepereMonde,
  courbure: Courbure,
  anisotropie: number,
): Object3D[] {
  const surface = new Mesh(
    courbure.enregistrer(construireSurface(monde, repere)),
    new MeshStandardMaterial({
      map: creerTextureDeMer(monde, anisotropie),
      roughness: 0.98,
      metalness: 0,
    }),
  );

  const socle = new Mesh(
    courbure.enregistrer(construireSocle(monde, repere)),
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: DoubleSide }),
  );

  const graticule = new LineSegments(
    courbure.enregistrer(construireGraticule(monde, repere)),
    new LineBasicMaterial({ color: PALETTE.graticule, transparent: true, opacity: 0.22 }),
  );

  const { bande, trait } = construireBordure(monde, repere);
  const bordure = new Mesh(
    courbure.enregistrer(bande),
    new MeshBasicMaterial({
      color: PALETTE.bordureMonde,
      transparent: true,
      opacity: 0.7,
      blending: NormalBlending,
      side: DoubleSide,
      depthWrite: false,
    }),
  );
  const contourNet = new LineSegments(
    courbure.enregistrer(trait),
    new LineBasicMaterial({ color: PALETTE.traitBordure, transparent: true, opacity: 0.85 }),
  );

  return [surface, socle, graticule, bordure, contourNet];
}
