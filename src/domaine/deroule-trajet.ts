import { COUT_PAR_MILIEU, COUT_TRANSFERT, type EtapeTrajet, type Milieu, type TrajetCalcule } from './trajets';

/**
 * Le temps d'un trajet, et rien d'autre. `TrajetCalcule` donne une géométrie et un coût
 * global ; le fil et l'échelle segmentée ont besoin de la découpe : combien de temps sur
 * chaque étape, combien au quai. Ce module reste pur — la géométrie, elle, est projetée par
 * le moteur, qui seul connaît le repère.
 */
export type TronconDeroule =
  | {
      readonly genre: 'etape';
      readonly milieu: Milieu;
      readonly indexEtape: number;
      readonly part: number;
    }
  | {
      readonly genre: 'quai';
      /** Le quai précède l'étape `indexEtape` ; on embarque quand celle-ci est en mer. */
      readonly embarquement: boolean;
      readonly indexEtape: number;
      readonly part: number;
    };

/**
 * Où se trouve le jalon à l'instant `t`. Union discriminée : au quai il n'a structurellement
 * pas de fraction locale, donc rien qui puisse le faire glisser pendant qu'il attend.
 */
export type PositionTemporelle =
  | { readonly genre: 'etape'; readonly indexEtape: number; readonly local: number }
  | { readonly genre: 'quai'; readonly indexEtape: number };

/** L'aérien ne pondère pas : sa distance *est* son coût, comme le calcule `trajetAerien`. */
export const coutDEtape = (etape: EtapeTrajet): number =>
  etape.milieu === 'air' ? etape.distanceUnites : etape.distanceUnites * COUT_PAR_MILIEU[etape.milieu];

export const coutDeroule = (trajet: TrajetCalcule): number =>
  trajet.etapes.reduce((somme, etape) => somme + coutDEtape(etape), 0) +
  Math.max(0, trajet.etapes.length - 1) * COUT_TRANSFERT;

/**
 * Les parts somment à 1 par construction : elles sont normalisées sur le coût recalculé et
 * non sur `coutUnites`, sinon un écart d'arrondi laisserait le jalon à un cheveu de l'arrivée.
 */
export function deroulerTrajet(trajet: TrajetCalcule): ReadonlyArray<TronconDeroule> {
  const total = coutDeroule(trajet);
  if (total <= 0) return [];

  const troncons: TronconDeroule[] = [];
  trajet.etapes.forEach((etape, index) => {
    if (index > 0) {
      troncons.push({
        genre: 'quai',
        embarquement: etape.milieu === 'mer',
        indexEtape: index,
        part: COUT_TRANSFERT / total,
      });
    }
    troncons.push({
      genre: 'etape',
      milieu: etape.milieu,
      indexEtape: index,
      part: coutDEtape(etape) / total,
    });
  });
  return troncons;
}

/**
 * Où poser le jalon sur le fil. Au quai il se range au bout de l'étape qu'il vient de finir :
 * c'est ce qui le rend immobile pendant le transfert, sans qu'aucune boucle ait à s'en
 * souvenir d'une image à l'autre.
 */
export const viseeDuJalon = (
  position: PositionTemporelle,
): { readonly indexEtape: number; readonly local: number } =>
  position.genre === 'quai'
    ? { indexEtape: position.indexEtape - 1, local: 1 }
    : { indexEtape: position.indexEtape, local: position.local };

export function positionTemporelle(
  deroule: ReadonlyArray<TronconDeroule>,
  t: number,
): PositionTemporelle {
  const borne = Math.min(1, Math.max(0, t));
  // Les parts s'additionnent en flottant : à l'arrivée le cumul retombe à un cheveu de 1 et
  // le jalon s'arrêterait juste avant sa destination. Le dernier pas se pose donc à la main.
  const dernier = deroule[deroule.length - 1];
  if (borne >= 1 && dernier !== undefined) {
    return dernier.genre === 'quai'
      ? { genre: 'quai', indexEtape: dernier.indexEtape }
      : { genre: 'etape', indexEtape: dernier.indexEtape, local: 1 };
  }
  let debut = 0;
  for (const troncon of deroule) {
    const fin = debut + troncon.part;
    if (borne < fin || troncon === deroule[deroule.length - 1]) {
      if (troncon.genre === 'quai') return { genre: 'quai', indexEtape: troncon.indexEtape };
      const local = troncon.part > 0 ? (borne - debut) / troncon.part : 1;
      return {
        genre: 'etape',
        indexEtape: troncon.indexEtape,
        local: Math.min(1, Math.max(0, local)),
      };
    }
    debut = fin;
  }
  return { genre: 'etape', indexEtape: 0, local: 0 };
}
