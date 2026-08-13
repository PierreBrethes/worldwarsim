import { Color, DataTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { Monde } from '@/domaine/monde';
import { bruitDeValeur } from './champs';
import { PALETTE } from './palette';

const LARGEUR_TEXTURE = 2400;
const AMPLITUDE_MARBRURE = 0.055;

/**
 * La mer est d'une seule encre, du rivage au grand large : la texture ne porte plus que la
 * marbrure du papier. Tout ce qui se cuit en texels et suit la côte — ombre, teinte de
 * profondeur, isobathes — se pixelise au zoom ; le lavis géométrique borde les côtes à sa
 * place (voir `lavis.ts`).
 */
function creerTextureDeMer(monde: Monde, anisotropie: number): DataTexture {
  const largeur = LARGEUR_TEXTURE;
  const hauteur = Math.round(
    (largeur * (monde.sphere.maxY - monde.sphere.minY)) / (monde.sphere.maxX - monde.sphere.minX),
  );
  const image = new Uint8Array(largeur * hauteur * 4);
  const echelleMarbrure = (90 * largeur) / 1400;

  const mer = new Color(PALETTE.mer);
  const couleur = new Color();

  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const decalage = (y * largeur + x) * 4;

      // La terre est peinte couleur de mer : les mesh des pays la recouvrent, et chaque texel
      // « papier » qui dépassait de leur silhouette faisait un escalier sable sur la côte.
      couleur.copy(mer);
      const marbrure = bruitDeValeur(x / echelleMarbrure, y / echelleMarbrure) - 0.5;
      couleur.offsetHSL(0, 0, marbrure * AMPLITUDE_MARBRURE);

      image[decalage] = couleur.r * 255;
      image[decalage + 1] = couleur.g * 255;
      image[decalage + 2] = couleur.b * 255;
      image[decalage + 3] = 255;
    }
  }

  const texture = new DataTexture(image, largeur, hauteur);
  texture.flipY = true;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropie;
  texture.needsUpdate = true;
  return texture;
}

export function creerMateriauDeMer(monde: Monde, anisotropie: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map: creerTextureDeMer(monde, anisotropie),
    roughness: 0.98,
    metalness: 0,
  });
}
