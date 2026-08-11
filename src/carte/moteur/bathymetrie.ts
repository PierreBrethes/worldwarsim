import { CanvasTexture, Color, SRGBColorSpace } from 'three';
import type { Monde } from '@/domaine/monde';
import { PALETTE } from './palette';

const LARGEUR_TEXTURE = 2400;
const PAS_TRAME = 4.6;
const ADOUCISSEMENT = 1.15;
const TON_MIN = 0.1;
const TON_MAX = 0.46;
const OPACITE_POINT = 0.72;
const INTENSITE_ISOBATHE = 0.15;
const ATTENUATION_ISOBATHE_AU_LARGE = 0.45;

function bruitDeValeur(x: number, y: number): number {
  const hache = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const bas = hache(xi, yi) + (hache(xi + 1, yi) - hache(xi, yi)) * u;
  const haut = hache(xi, yi + 1) + (hache(xi + 1, yi + 1) - hache(xi, yi + 1)) * u;
  return bas + (haut - bas) * v;
}

function champDeDistanceALaTerre(monde: Monde, largeur: number, hauteur: number): Float32Array {
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const contexte = canvas.getContext('2d', { willReadFrequently: true })!;
  const echelleX = largeur / (monde.sphere.maxX - monde.sphere.minX);
  const echelleY = hauteur / (monde.sphere.maxY - monde.sphere.minY);

  contexte.fillStyle = '#000';
  contexte.fillRect(0, 0, largeur, hauteur);
  contexte.fillStyle = '#fff';
  contexte.beginPath();
  for (const pays of monde.pays) {
    for (const anneau of pays.anneaux) {
      anneau.forEach(([px, py], index) => {
        const x = (px - monde.sphere.minX) * echelleX;
        const y = (py - monde.sphere.minY) * echelleY;
        if (index === 0) contexte.moveTo(x, y);
        else contexte.lineTo(x, y);
      });
      contexte.closePath();
    }
  }
  contexte.fill();

  const masque = contexte.getImageData(0, 0, largeur, hauteur).data;
  const INFINI = 1e9;
  const distance = new Float32Array(largeur * hauteur);
  for (let i = 0; i < distance.length; i++) distance[i] = masque[i * 4]! > 127 ? 0 : INFINI;

  const lire = (x: number, y: number) =>
    x < 0 || y < 0 || x >= largeur || y >= hauteur ? INFINI : distance[y * largeur + x]!;

  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = y * largeur + x;
      if (distance[i] === 0) continue;
      distance[i] = Math.min(
        distance[i]!,
        lire(x - 1, y) + 1, lire(x, y - 1) + 1,
        lire(x - 1, y - 1) + 1.414, lire(x + 1, y - 1) + 1.414,
      );
    }
  }
  for (let y = hauteur - 1; y >= 0; y--) {
    for (let x = largeur - 1; x >= 0; x--) {
      const i = y * largeur + x;
      if (distance[i] === 0) continue;
      distance[i] = Math.min(
        distance[i]!,
        lire(x + 1, y) + 1, lire(x, y + 1) + 1,
        lire(x + 1, y + 1) + 1.414, lire(x - 1, y + 1) + 1.414,
      );
    }
  }
  return distance;
}

/**
 * La profondeur est rendue par la densité d'une trame de points inclinée à 45°,
 * comme une similigravure de presse — pas par un dégradé lissé.
 */
export function creerTextureDeMer(monde: Monde, anisotropie: number): CanvasTexture {
  const largeur = LARGEUR_TEXTURE;
  const hauteur = Math.round(
    (largeur * (monde.sphere.maxY - monde.sphere.minY)) / (monde.sphere.maxX - monde.sphere.minX),
  );
  const distance = champDeDistanceALaTerre(monde, largeur, hauteur);

  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const contexte = canvas.getContext('2d')!;
  const image = contexte.createImageData(largeur, hauteur);

  const facteurEchelle = largeur / 1400;
  const distanceMax = largeur * 0.055;
  const portéeOmbreCote = distanceMax * 0.13;
  const espacementIsobathes = distanceMax * 0.24;
  const demiLargeurIsobathe = 1.5 * facteurEchelle;
  const echelleMarbrure = 90 * facteurEchelle;

  const papier = new Color(PALETTE.papier);
  const mer = new Color(PALETTE.mer);
  const encre = new Color(PALETTE.encreMer);
  const cote = new Color(PALETTE.ombreCote);
  const couleur = new Color();
  const racineDeDeux = Math.SQRT1_2;

  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const i = y * largeur + x;
      const decalage = i * 4;
      const d = distance[i]!;
      image.data[decalage + 3] = 255;

      couleur.copy(d > 0 ? mer : papier);
      const marbrure = bruitDeValeur(x / echelleMarbrure, y / echelleMarbrure) - 0.5;
      const fibre = bruitDeValeur(x * 7.3, y * 3.1) - 0.5;
      couleur.offsetHSL(0, 0, marbrure * 0.055 + fibre * 0.075);

      if (d > 0) {
        const profondeur = Math.min(1, d / distanceMax);
        const ton = TON_MIN + TON_MAX * (profondeur * profondeur * (3 - 2 * profondeur));
        const trameX = (x + y) * racineDeDeux;
        const trameY = (y - x) * racineDeDeux;
        const centreX = Math.round(trameX / PAS_TRAME) * PAS_TRAME;
        const centreY = Math.round(trameY / PAS_TRAME) * PAS_TRAME;
        const auCentre = Math.hypot(trameX - centreX, trameY - centreY);
        const rayon = PAS_TRAME * 0.46 * Math.sqrt(ton);
        const couverture =
          1 - Math.min(1, Math.max(0, (auCentre - rayon + ADOUCISSEMENT * 0.5) / ADOUCISSEMENT));
        if (couverture > 0) couleur.lerp(encre, couverture * OPACITE_POINT);

        const ombreCote = 1 - Math.min(1, d / portéeOmbreCote);
        if (ombreCote > 0) couleur.lerp(cote, ombreCote * ombreCote * 0.5);

        let ecartIsobathe = d % espacementIsobathes;
        if (ecartIsobathe > espacementIsobathes * 0.5) ecartIsobathe -= espacementIsobathes;
        const trait = Math.max(0, 1 - Math.abs(ecartIsobathe) / demiLargeurIsobathe);
        if (trait > 0) {
          const attenuation = 1 - ATTENUATION_ISOBATHE_AU_LARGE * profondeur;
          couleur.lerp(encre, trait * trait * INTENSITE_ISOBATHE * attenuation);
        }
      }

      image.data[decalage] = couleur.r * 255;
      image.data[decalage + 1] = couleur.g * 255;
      image.data[decalage + 2] = couleur.b * 255;
    }
  }

  contexte.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropie;
  return texture;
}
