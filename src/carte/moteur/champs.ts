import type { Monde } from '@/domaine/monde';

/**
 * Bruit de valeur déterministe : le même point rend toujours la même valeur, sans table ni
 * graine à transporter. Partagé entre la mer (marbrure) et les régions (relief) — deux
 * rendus qui doivent rester stables d'un chargement à l'autre.
 */
export function bruitDeValeur(x: number, y: number): number {
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

/**
 * Rastérise les pays sur la boîte de la sphère : 1 = terre, 0 = mer. C'est la source des
 * deux champs de distance — profondeur pour la mer, éloignement de la côte pour les régions.
 */
export function masqueDeTerre(monde: Monde, largeur: number, hauteur: number): Uint8Array {
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

  const image = contexte.getImageData(0, 0, largeur, hauteur).data;
  const masque = new Uint8Array(largeur * hauteur);
  for (let i = 0; i < masque.length; i++) masque[i] = image[i * 4]! > 127 ? 1 : 0;
  return masque;
}

/**
 * Distance de chanfrein en deux passes : approximation du champ de distance euclidien,
 * exacte à ~4 % près, en O(pixels). Rend pour chaque cellule sa distance (en pixels) à la
 * source la plus proche.
 */
export function champDeDistance(
  largeur: number,
  hauteur: number,
  estSource: (index: number) => boolean,
): Float32Array {
  const INFINI = 1e9;
  const distance = new Float32Array(largeur * hauteur);
  for (let i = 0; i < distance.length; i++) distance[i] = estSource(i) ? 0 : INFINI;

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
