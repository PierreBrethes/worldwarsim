/** Les courbes des storyboards (`storyboard-caserne/commun/scene.js:71-86`), à la lettre. */

const clamp01 = (k: number): number => Math.min(1, Math.max(0, k));

/** 0 → 1 entre `from` et `to` ; un intervalle vide est un saut. */
export const span = (t: number, from: number, to: number): number =>
  to <= from ? (t >= from ? 1 : 0) : clamp01((t - from) / (to - from));

export const ease = {
  out3: (k: number): number => 1 - (1 - k) ** 3,
  in2: (k: number): number => k * k,
  inOut: (k: number): number => k * k * (3 - 2 * k),
  /** Un pas constant, freiné sur les derniers 20 % : l'homme fait halte. */
  march: (k: number): number => (k < 0.8 ? k : 0.8 + (k - 0.8) - (k - 0.8) ** 2 / 0.4) / 0.9,
  /** Un véhicule : accélère sur 25 %, roule, freine sur 25 %. */
  drive: (k: number): number =>
    (k < 0.25
      ? (k * k) / 0.5
      : k < 0.75
        ? 0.125 + (k - 0.25)
        : 0.625 + (k - 0.75) - (k - 0.75) ** 2 / 0.5) / 0.75,
  /** Le canon, sans moteur : départ et arrêt plus lents, en sinus. */
  push: (k: number): number => (1 - Math.cos(Math.PI * k)) / 2,
};
