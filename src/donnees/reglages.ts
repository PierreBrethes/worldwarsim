const CLE_ECHELLE = 'wws-echelle-hud';
export const ECHELLE_HUD_DEFAUT = 150;
export const ECHELLE_HUD_MIN = 100;
export const ECHELLE_HUD_MAX = 200;

export function lireEchelleHud(): number {
  const brut = localStorage.getItem(CLE_ECHELLE);
  if (brut === null) return ECHELLE_HUD_DEFAUT;
  const valeur = Number(brut);
  if (!Number.isFinite(valeur)) return ECHELLE_HUD_DEFAUT;
  return Math.max(ECHELLE_HUD_MIN, Math.min(ECHELLE_HUD_MAX, valeur));
}

export function appliquerEchelleHud(pourcent: number): void {
  document.documentElement.style.setProperty('--echelle-hud', String(pourcent / 100));
}

export function garderEchelleHud(pourcent: number): void {
  localStorage.setItem(CLE_ECHELLE, String(pourcent));
  appliquerEchelleHud(pourcent);
}
