import { URGENCE_MS, estCompte, type EtiquetteCarte, type TypeEtiquette } from './etiquettes';

/**
 * Une entité hors champ ne disparaît pas : elle se range au bord de l'écran. Les six
 * catégories sont exactement les six types d'étiquette — un indicateur n'invente rien, il
 * rabat au bord ce que la carte montrait au sol, avec le même picto et la même priorité.
 */
export type CategorieIndicateur =
  | 'avant-postes'
  | 'chantiers'
  | 'forces'
  | 'mes-mouvements'
  | 'cap-sur-moi'
  | 'renseignement';

export const CATEGORIE_DE_TYPE: Readonly<Record<TypeEtiquette, CategorieIndicateur>> = {
  'avant-poste': 'avant-postes',
  chantier: 'chantiers',
  pile: 'forces',
  'mouvement-mien': 'mes-mouvements',
  'mouvement-cap-sur-moi': 'cap-sur-moi',
  renseignement: 'renseignement',
};

export type BasculesIndicateurs = Readonly<Record<CategorieIndicateur, boolean>>;

/**
 * Le bord d'écran s'ouvre sur une seule catégorie : ce qui vient sur moi. Tout allumer par
 * défaut ferait de la bordure un second tableau de bord, et le rouge n'y voudrait plus rien
 * dire — c'est le seul défaut qui garde à l'alerte sa valeur d'alerte.
 */
export const BASCULES_DEFAUT: BasculesIndicateurs = {
  'avant-postes': false,
  chantiers: false,
  forces: false,
  'mes-mouvements': false,
  'cap-sur-moi': true,
  renseignement: false,
};

export const CATEGORIES: ReadonlyArray<{
  readonly cle: CategorieIndicateur;
  readonly libelle: string;
}> = [
  { cle: 'avant-postes', libelle: 'avant-postes' },
  { cle: 'chantiers', libelle: 'chantiers' },
  { cle: 'forces', libelle: 'forces' },
  { cle: 'mes-mouvements', libelle: 'mes mouvements' },
  { cle: 'cap-sur-moi', libelle: 'cap sur moi' },
  { cle: 'renseignement', libelle: 'renseignement' },
];

export const estCategorie = (valeur: unknown): valeur is CategorieIndicateur =>
  CATEGORIES.some((categorie) => categorie.cle === valeur);

/**
 * La marge intérieure : l'indicateur se pose dans l'écran, jamais à cheval sur son arête. La
 * pastille étant centrée sur le point clampé, la demi-pastille s'ajoute aux quatorze pixels de
 * la maquette — sans quoi la moitié du glyphe sortirait par le bas de la carte.
 */
const DEMI_PASTILLE = 15;
export const MARGE_BORD = 14 + DEMI_PASTILLE;

/** En deçà, deux indicateurs de même catégorie ne se lisent plus séparément : ils fusionnent. */
export const SEUIL_AGREGAT = 48;

export type PointBord = { readonly x: number; readonly y: number; readonly cap: number };

/**
 * Le point d'écran d'une ancre hors champ, ramené sur le rectangle intérieur. Le cap n'est pas
 * celui du bord atteint mais celui de la direction réelle : c'est la seule information que le
 * rabattement détruirait, et elle se calcule ici même si plus rien ne la dessine.
 */
export function clamperAuBord(
  x: number,
  y: number,
  largeur: number,
  hauteur: number,
  marge: number = MARGE_BORD,
): PointBord {
  const centreX = largeur / 2;
  const centreY = hauteur / 2;
  const demiLargeur = Math.max(1, centreX - marge);
  const demiHauteur = Math.max(1, centreY - marge);
  const ecartX = x - centreX;
  // Une ancre pile au centre et pourtant hors champ n'existe pas géométriquement, mais un
  // écran d'un pixel de haut, si : le repli vers le bas évite une division par zéro.
  const ecartY = ecartX === 0 && y === centreY ? 1 : y - centreY;

  const facteur = Math.min(
    ecartX === 0 ? Infinity : demiLargeur / Math.abs(ecartX),
    ecartY === 0 ? Infinity : demiHauteur / Math.abs(ecartY),
  );

  return {
    x: centreX + ecartX * facteur,
    y: centreY + ecartY * facteur,
    cap: Math.atan2(ecartY, ecartX),
  };
}

export type IndicateurBrut = {
  readonly id: string;
  readonly categorie: CategorieIndicateur;
  readonly priorite: number;
  readonly x: number;
  readonly y: number;
};

export type GroupeIndicateur = {
  readonly id: string;
  readonly categorie: CategorieIndicateur;
  readonly priorite: number;
  readonly membres: ReadonlyArray<string>;
};

/**
 * L'agrégation par noyau, catégorie par catégorie : le plus prioritaire ouvre le groupe, les
 * suivants s'y rangent s'ils tombent dans son rayon. Un seul passage, aucune moyenne mobile —
 * le résultat ne dépend donc que des positions, et il est identique d'un calcul à l'autre tant
 * que la caméra n'a pas bougé. C'est ce qui autorise à ne le refaire qu'au repos.
 */
export function regrouper(
  indicateurs: ReadonlyArray<IndicateurBrut>,
  seuil: number = SEUIL_AGREGAT,
): ReadonlyArray<GroupeIndicateur> {
  const noyaux: Array<{ noyau: IndicateurBrut; membres: string[] }> = [];

  for (const indicateur of [...indicateurs].sort((premier, second) => second.priorite - premier.priorite)) {
    const proche = noyaux.find(
      ({ noyau }) =>
        noyau.categorie === indicateur.categorie &&
        Math.hypot(noyau.x - indicateur.x, noyau.y - indicateur.y) < seuil,
    );
    if (proche) proche.membres.push(indicateur.id);
    else noyaux.push({ noyau: indicateur, membres: [indicateur.id] });
  }

  return noyaux.map(({ noyau, membres }) => ({
    id: `${noyau.categorie}:${noyau.id}`,
    categorie: noyau.categorie,
    priorite: noyau.priorite,
    membres,
  }));
}

/**
 * Les trois intensités de la marque d'alerte, et rien d'autre sur la carte n'en porte.
 *
 * `menace` couvre le cap non identifié, et depuis le retrait de l'ergot elle ne se voit plus :
 * le glyphe reste neutre, faute de quoi on affirmerait une nature qu'on ne connaît pas — et le
 * leurre, qui n'existe que pour être pris pour autre chose, perdrait sa raison d'être. C'est
 * une marque qui se calcule sans rien dessiner ; le jour où on lui rend un signe, il tient ici.
 */
export type MarqueAlerte = 'aucune' | 'menace' | 'offensive' | 'imminente';

const INTENSITE: Readonly<Record<MarqueAlerte, number>> = {
  aucune: 0,
  menace: 1,
  offensive: 2,
  imminente: 3,
};

export function marqueDe(etiquette: EtiquetteCarte, maintenant: number): MarqueAlerte {
  if (etiquette.type !== 'mouvement-cap-sur-moi') return 'aucune';
  if (!etiquette.identifie || !etiquette.offensif) return 'menace';
  const echeance = echeanceDe(etiquette);
  return echeance !== null && echeance - maintenant < URGENCE_MS ? 'imminente' : 'offensive';
}

/** Un agrégat porte la plus forte des marques qu'il recouvre : une menace ne se dilue pas. */
export const marqueLaPlusForte = (marques: ReadonlyArray<MarqueAlerte>): MarqueAlerte =>
  marques.reduce<MarqueAlerte>(
    (forte, marque) => (INTENSITE[marque] > INTENSITE[forte] ? marque : forte),
    'aucune',
  );

/**
 * Le chantier achevé que rien ne suit. C'est l'oubli qu'on veut rattraper — une usine qui
 * tourne à vide pendant qu'on regarde ailleurs — d'où l'accent d'attention au bord.
 */
export const chantierOublie = (etiquette: EtiquetteCarte, maintenant: number): boolean =>
  etiquette.sansOrdre && (echeanceDe(etiquette) ?? Infinity) <= maintenant;

function echeanceDe(etiquette: EtiquetteCarte): number | null {
  const compte = etiquette.lignes.find(estCompte);
  return compte?.echeanceA ?? null;
}
