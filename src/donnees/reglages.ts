import { BASCULES_DEFAUT, CATEGORIES, type BasculesIndicateurs } from '@/domaine/indicateurs';

const CLE_ECHELLE = 'wws-echelle-hud';
// Doit rester d'accord avec `--echelle-hud` de `tokens.css` : le token est l'échelle du
// premier rendu, celle-ci celle qu'on réapplique une fois le réglage relu.
export const ECHELLE_HUD_DEFAUT = 120;
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

const CLE_FRISE_REPLIEE = 'wws-frise-repliee';

/** Une frise repliée le reste : c'est un choix d'encombrement du bureau, pas un état d'écran. */
export const lireFriseRepliee = (): boolean =>
  localStorage.getItem(CLE_FRISE_REPLIEE) === 'repliee';

export const garderFriseRepliee = (repliee: boolean): void => {
  localStorage.setItem(CLE_FRISE_REPLIEE, repliee ? 'repliee' : 'deployee');
};

const CLE_INDICATEURS = 'wws-indicateurs-bord';

/**
 * Les bascules du bord d'écran se relisent catégorie par catégorie plutôt qu'en bloc : une
 * catégorie ajoutée plus tard doit prendre son défaut, pas ressusciter un objet périmé.
 */
export function lireBasculesIndicateurs(): BasculesIndicateurs {
  const gardees = lireObjet(CLE_INDICATEURS);
  return Object.fromEntries(
    CATEGORIES.map(({ cle }) => [
      cle,
      typeof gardees[cle] === 'boolean' ? gardees[cle] : BASCULES_DEFAUT[cle],
    ]),
  ) as BasculesIndicateurs;
}

export function garderBasculesIndicateurs(bascules: BasculesIndicateurs): void {
  localStorage.setItem(CLE_INDICATEURS, JSON.stringify(bascules));
}

const CLE_DISPOSITION = 'wws-disposition-modales';

export type GeometrieModale = {
  decalage: { x: number; y: number };
  taille: { largeur: number; hauteur: number } | null;
};

const GEOMETRIE_NEUVE: GeometrieModale = { decalage: { x: 0, y: 0 }, taille: null };

/**
 * Une fenêtre rangée sur un grand écran ne doit pas devenir introuvable sur un petit : la
 * géométrie relue est ramenée dans le cadre courant, mesuré en pixels de mise en page puisque
 * c'est l'unité dans laquelle la modale s'écrit.
 */
export function lireGeometrieModale(nom: string): GeometrieModale {
  const geometrie = lireDisposition()[nom];
  if (!geometrie) return GEOMETRIE_NEUVE;
  const echelle = lireEchelleHud() / 100;
  const largeurVue = window.innerWidth / echelle;
  const hauteurVue = window.innerHeight / echelle;
  return {
    decalage: {
      x: borner(geometrie.decalage.x, -largeurVue / 2, largeurVue / 2),
      y: borner(geometrie.decalage.y, -hauteurVue / 2, hauteurVue / 2),
    },
    taille: geometrie.taille && {
      largeur: Math.min(geometrie.taille.largeur, largeurVue),
      hauteur: Math.min(geometrie.taille.hauteur, hauteurVue),
    },
  };
}

export function garderGeometrieModale(nom: string, geometrie: GeometrieModale): void {
  localStorage.setItem(CLE_DISPOSITION, JSON.stringify({ ...lireDisposition(), [nom]: geometrie }));
}

const lireDisposition = (): Record<string, GeometrieModale | undefined> =>
  lireObjet(CLE_DISPOSITION) as Record<string, GeometrieModale | undefined>;

function lireObjet(cle: string): Record<string, unknown> {
  const brut = localStorage.getItem(cle);
  if (brut === null) return {};
  try {
    const analyse: unknown = JSON.parse(brut);
    if (typeof analyse !== 'object' || analyse === null) return {};
    return analyse as Record<string, unknown>;
  } catch {
    return {};
  }
}

function borner(valeur: number, mini: number, maxi: number): number {
  return Math.max(mini, Math.min(maxi, valeur));
}
