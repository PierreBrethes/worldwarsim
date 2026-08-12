import { Color, DataTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { Monde } from '@/domaine/monde';
import { bruitDeValeur, champDeDistance, masqueDeTerre } from './champs';
import { PALETTE } from './palette';

const LARGEUR_TEXTURE = 2400;
const PAS_TRAME_MONDE = 0.767;
const ADOUCISSEMENT_MONDE = 0.192;
const TON_MIN = 0.1;
const TON_MAX = 0.46;
const OPACITE_POINT = 0.72;
const INTENSITE_ISOBATHE = 0.15;
const ATTENUATION_ISOBATHE_AU_LARGE = 0.45;

/**
 * La texture cuite ne porte que les basses fréquences — teinte, ombre de côte, isobathes,
 * marbrure — qui s'agrandissent proprement. Le ton de profondeur part dans le canal alpha
 * (zéro sur la terre) pour piloter la trame, dessinée par le shader en espace monde : c'est
 * elle qui deviendrait de la bouillie au zoom si elle était cuite en pixels.
 *
 * `DataTexture` et pas `CanvasTexture` : un canvas 2D prémultiplie l'alpha, et notre alpha
 * n'est pas une transparence mais une donnée — la prémultiplication écraserait les RVB des
 * eaux peu profondes.
 */
function creerTextureDeMer(monde: Monde, anisotropie: number): DataTexture {
  const largeur = LARGEUR_TEXTURE;
  const hauteur = Math.round(
    (largeur * (monde.sphere.maxY - monde.sphere.minY)) / (monde.sphere.maxX - monde.sphere.minX),
  );
  const masque = masqueDeTerre(monde, largeur, hauteur);
  const distance = champDeDistance(largeur, hauteur, (i) => masque[i] === 1);
  const image = new Uint8Array(largeur * hauteur * 4);

  const facteurEchelle = largeur / 1400;
  const distanceMax = largeur * 0.055;
  const espacementIsobathes = distanceMax * 0.24;
  const demiLargeurIsobathe = 1.5 * facteurEchelle;
  const echelleMarbrure = 90 * facteurEchelle;

  const mer = new Color(PALETTE.mer);
  const encre = new Color(PALETTE.encreMer);
  const couleur = new Color();

  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = y * largeur + x;
      const decalage = i * 4;
      const d = distance[i]!;

      // La terre est peinte couleur de mer : les mesh des pays la recouvrent, et chaque texel
      // « papier » qui dépassait de leur silhouette faisait un escalier sable sur la côte.
      couleur.copy(mer);
      const marbrure = bruitDeValeur(x / echelleMarbrure, y / echelleMarbrure) - 0.5;
      couleur.offsetHSL(0, 0, marbrure * 0.055);

      // Aucune ombre de côte : toute bande accrochée au rivage se pixelise au zoom. La mer
      // reste plate jusque sous la terre — la silhouette nette vient du mesh des pays.
      let ton = 0;
      if (d > 0) {
        const profondeur = Math.min(1, d / distanceMax);
        ton = TON_MIN + TON_MAX * (profondeur * profondeur * (3 - 2 * profondeur));

        let ecartIsobathe = d % espacementIsobathes;
        if (ecartIsobathe > espacementIsobathes * 0.5) ecartIsobathe -= espacementIsobathes;
        const trait = Math.max(0, 1 - Math.abs(ecartIsobathe) / demiLargeurIsobathe);
        if (trait > 0) {
          const attenuation = 1 - ATTENUATION_ISOBATHE_AU_LARGE * profondeur;
          couleur.lerp(encre, trait * trait * INTENSITE_ISOBATHE * attenuation);
        }
      }

      image[decalage] = couleur.r * 255;
      image[decalage + 1] = couleur.g * 255;
      image[decalage + 2] = couleur.b * 255;
      image[decalage + 3] = ton * 255;
    }
  }

  const texture = new DataTexture(image, largeur, hauteur);
  texture.flipY = true;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropie;
  texture.needsUpdate = true;
  return texture;
}

/**
 * La profondeur est rendue par la densité d'une trame de points inclinée à 45°, comme une
 * similigravure de presse — pas par un dégradé lissé. Elle est calculée au fragment, en
 * espace monde, pour rester nette du plan large au zoom le plus serré.
 */
export function creerMateriauDeMer(monde: Monde, anisotropie: number): MeshStandardMaterial {
  const materiau = new MeshStandardMaterial({
    map: creerTextureDeMer(monde, anisotropie),
    roughness: 0.98,
    metalness: 0,
  });

  materiau.onBeforeCompile = (shader) => {
    shader.uniforms.encreTrame = { value: new Color(PALETTE.encreMer) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPositionMonde;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvPositionMonde = (modelMatrix * vec4(position, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vPositionMonde;\nuniform vec3 encreTrame;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          float tonTrame = sampledDiffuseColor.a;
          if (tonTrame > 0.003) {
            vec2 incline = vec2(
              vPositionMonde.x + vPositionMonde.z,
              vPositionMonde.z - vPositionMonde.x
            ) * ${Math.SQRT1_2};
            vec2 auPoint = incline - (floor(incline / ${PAS_TRAME_MONDE} + 0.5)) * ${PAS_TRAME_MONDE};
            float rayon = ${PAS_TRAME_MONDE} * 0.46 * sqrt(tonTrame);

            // Anti-moiré : un point plus fin qu'un pixel ne peut pas être dessiné, on fond
            // alors vers sa couverture moyenne (πr²/pas²) — l'équivalent du mipmap qu'une
            // trame procédurale n'a pas.
            vec2 derive = fwidth(incline);
            float flou = max(derive.x, derive.y);
            float adoucissement = max(${ADOUCISSEMENT_MONDE}, flou);
            float couverture = 1.0 - clamp(
              (length(auPoint) - rayon + adoucissement * 0.5) / adoucissement,
              0.0,
              1.0
            );
            float couvertureMoyenne = 3.14159 * 0.2116 * tonTrame;
            couverture = mix(
              couverture,
              couvertureMoyenne,
              smoothstep(0.15, 0.5, flou / ${PAS_TRAME_MONDE})
            );
            diffuseColor.rgb = mix(diffuseColor.rgb, encreTrame, couverture * ${OPACITE_POINT});
          }
        }`,
      );
  };

  return materiau;
}
