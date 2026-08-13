import type { MarqueurCarte } from '@/domaine/etiquettes';
import type { LonLat } from '@/domaine/geo';
import { ENCRE_PAR_NATION, PAYS_DE_NATION, POUVOIR_PAR_NATION } from '@/domaine/nations';
import { minutesDepuisMinuit, sortieDePlage } from '@/domaine/plage-repos';
import type { Pile, VueJoueur } from '@/domaine/vue-joueur';

/**
 * Mettre à `false` et supprimer ce fichier : rien d'autre à défaire. Les deux couches de
 * marqueurs et la frise des mouvements se nourrissent d'une `VueJoueur` ordinaire — le
 * factice n'est qu'un état de départ, jamais un chemin de rendu à part.
 */
export const ETAT_FACTICE = true;

const NATION = 'Royaume-Uni';

/**
 * Positions posées à la main : `monde.json` donne bien un point représentatif par pays, mais
 * pas la mer (la Manche) ni la région d'un chantier. Le vrai serveur devra livrer la position
 * de chaque avant-poste et de chaque chantier, pas un nom de pays à re-géocoder au client.
 */
const POSITIONS = {
  domicile: [-2.2, 53.4],
  norvege: [8.5, 61.4],
  portugal: [-8.2, 39.6],
  chantier: [-1.5, 51.4],
  italie: [12.5, 42.5],
  islande: [-19.0, 64.9],
  danemark: [9.5, 56.0],
  grece: [22.0, 39.3],
  egypte: [30.0, 26.8],
  manche: [0.4, 50.3],
  merDuNord: [3.6, 55.8],
  atlantiqueNord: [-12.0, 57.0],
  merDIrlande: [-4.5, 54.5],
  baltique: [17.0, 56.0],
  golfeDeFinlande: [24.0, 59.4],
} as const satisfies Record<string, LonLat>;

const PILE_DOMICILE: Pile = { infanterie: 24, blinde: 6 };

/** Les durées sont fixées ici, jamais simulées : elles n'existent que pour juger le rendu. */
const MOUVEMENTS = {
  italie: { totalMinutes: 90, resteMinutes: 35 },
  danemark: { totalMinutes: 70, resteMinutes: 52 },
  islande: { totalMinutes: 130, resteMinutes: 65 },
  grece: { totalMinutes: 180, resteMinutes: 134 },
  egypte: { totalMinutes: 240, resteMinutes: 228 },
  capManche: { totalMinutes: 62, resteMinutes: 20 },
  capIdentifie: { totalMinutes: 105, resteMinutes: 47 },
  renseignementBaltique: { totalMinutes: 152, resteMinutes: 100 },
} as const;

/**
 * Le cas « arrivée en plage de repos » doit se voir à n'importe quelle heure de la journée :
 * la plage de la cible est donc calée sur l'arrivée du mouvement grec plutôt que tirée d'une
 * nation. Seule la mise en scène est arbitraire — `sortieDePlage` est bien la fonction que le
 * serveur appellera le jour où il tranchera lui-même.
 */
const ATTENTE_GRECQUE = { avantArriveeMinutes: 30, dureeMinutes: 240 } as const;

function attenteFrontiereGrecque(chargeeA: number): { readonly resolutionDansMinutes: number } {
  const arriveeA = chargeeA + MOUVEMENTS.grece.resteMinutes * 60_000;
  const debutMinutes =
    (minutesDepuisMinuit(arriveeA) - ATTENTE_GRECQUE.avantArriveeMinutes + 1440) % 1440;
  const resolutionA = sortieDePlage(arriveeA, {
    debutMinutes,
    finMinutes: (debutMinutes + ATTENTE_GRECQUE.dureeMinutes) % 1440,
  });
  return { resolutionDansMinutes: ((resolutionA ?? arriveeA) - chargeeA) / 60_000 };
}

export function appliquerEtatFactice(vue: VueJoueur): VueJoueur {
  const encre = ENCRE_PAR_NATION[NATION];
  const chezMoi = { origineNom: PAYS_DE_NATION[NATION], origineLibelle: NATION };
  return {
    ...vue,
    moi: {
      ...vue.moi,
      nation: NATION,
      encre,
      pouvoir: POUVOIR_PAR_NATION[NATION],
      positionDomicile: POSITIONS.domicile,
      armeePresente: PILE_DOMICILE,
      armeeEnTransit: { infanterie: 12, blinde: 4, transportTerrestre: 3 },
      chantier: { nom: 'Centre logistique', resteMinutes: 23 },
      slots: { total: vue.moi.slots.total, utilises: 2 },
      avantPostes: [
        {
          id: 'ap-norvege',
          paysHote: 'Norway',
          lonLat: POSITIONS.norvege,
          specialisation: 'extraction',
          garnison: 40,
          aMoi: true,
        },
        {
          id: 'ap-portugal',
          paysHote: 'Portugal',
          lonLat: POSITIONS.portugal,
          specialisation: 'relais',
          garnison: 15,
          aMoi: true,
        },
      ],
    },
    arcs: [
      {
        etat: 'mien',
        id: 'mv-italie',
        depuis: POSITIONS.domicile,
        vers: POSITIONS.italie,
        ...chezMoi,
        destinationNom: 'Italy',
        destinationLibelle: 'Italie',
        type: 'attaque',
        pile: { infanterie: 24, blinde: 6 },
        minutesRestantes: MOUVEMENTS.italie.resteMinutes,
        attenteFrontiere: null,
        avancement: avancementDe(MOUVEMENTS.italie),
      },
      {
        etat: 'mien',
        id: 'mv-danemark',
        depuis: POSITIONS.domicile,
        vers: POSITIONS.danemark,
        ...chezMoi,
        destinationNom: 'Denmark',
        destinationLibelle: 'Danemark',
        type: 'raid',
        pile: { infanterie: 8, blinde: 2 },
        minutesRestantes: MOUVEMENTS.danemark.resteMinutes,
        attenteFrontiere: null,
        avancement: avancementDe(MOUVEMENTS.danemark),
      },
      {
        etat: 'mien',
        id: 'mv-islande',
        depuis: POSITIONS.domicile,
        vers: POSITIONS.islande,
        ...chezMoi,
        destinationNom: 'Iceland',
        destinationLibelle: 'Islande',
        type: 'avantPoste',
        pile: { infanterie: 12, transportTerrestre: 3 },
        minutesRestantes: MOUVEMENTS.islande.resteMinutes,
        attenteFrontiere: null,
        avancement: avancementDe(MOUVEMENTS.islande),
      },
      {
        etat: 'mien',
        id: 'mv-grece',
        depuis: POSITIONS.domicile,
        vers: POSITIONS.grece,
        ...chezMoi,
        destinationNom: 'Greece',
        destinationLibelle: 'Grèce',
        type: 'attaque',
        pile: { infanterie: 16, blinde: 4 },
        minutesRestantes: MOUVEMENTS.grece.resteMinutes,
        attenteFrontiere: attenteFrontiereGrecque(vue.chargeeA),
        avancement: avancementDe(MOUVEMENTS.grece),
      },
      {
        etat: 'mien',
        id: 'mv-egypte',
        depuis: POSITIONS.domicile,
        vers: POSITIONS.egypte,
        ...chezMoi,
        destinationNom: 'Egypt',
        destinationLibelle: 'Égypte',
        type: 'agent',
        pile: { transportAerien: 1 },
        minutesRestantes: MOUVEMENTS.egypte.resteMinutes,
        attenteFrontiere: null,
        avancement: avancementDe(MOUVEMENTS.egypte),
      },
      // Ni type ni pile : l'union discriminée fait que le rendu ne peut structurellement pas
      // les afficher, même si le factice voulait les donner (fiche 4.2).
      {
        etat: 'adverseDetecte',
        id: 'mv-cap-manche',
        depuis: POSITIONS.merDuNord,
        vers: POSITIONS.manche,
        nationSuspectee: null,
        capDegres: 214,
        capSurMoi: true,
        identification: { perce: false },
        minutesRestantesEstimees: MOUVEMENTS.capManche.resteMinutes,
        avancement: avancementDe(MOUVEMENTS.capManche),
      },
      // Le seul mouvement adverse que le renseignement a percé : type et composition
      // apparaissent, l'horaire reste estimé — une percée ne rend pas la montre de l'autre.
      {
        etat: 'adverseDetecte',
        id: 'mv-cap-identifie',
        depuis: POSITIONS.atlantiqueNord,
        vers: POSITIONS.merDIrlande,
        nationSuspectee: 'Allemagne',
        capDegres: 118,
        capSurMoi: true,
        identification: { perce: true, type: 'attaque', pile: { blinde: 30 } },
        minutesRestantesEstimees: MOUVEMENTS.capIdentifie.resteMinutes,
        avancement: avancementDe(MOUVEMENTS.capIdentifie),
      },
      {
        etat: 'adverseDetecte',
        id: 'mv-renseignement-baltique',
        depuis: POSITIONS.baltique,
        vers: POSITIONS.golfeDeFinlande,
        nationSuspectee: null,
        capDegres: 87,
        capSurMoi: false,
        identification: { perce: false },
        minutesRestantesEstimees: MOUVEMENTS.renseignementBaltique.resteMinutes,
        avancement: avancementDe(MOUVEMENTS.renseignementBaltique),
      },
    ],
    couverture: { visibles: 3, total: 8 },
  };
}

/**
 * Les marqueurs de plateau ne se déduisent pas encore de `VueJoueur` : le niveau d'un
 * avant-poste et la position d'un chantier n'y figurent pas. Ils sont donc composés ici, à
 * côté du reste du factice, pour que la dette se voie d'un seul endroit.
 */
export function marqueursFactices(vue: VueJoueur): ReadonlyArray<MarqueurCarte> {
  const encre = vue.moi.encre;
  const niveauParAvantPoste: Readonly<Record<string, number>> = { 'ap-norvege': 2, 'ap-portugal': 1 };

  const avantPostes = vue.moi.avantPostes.map<MarqueurCarte>((avantPoste) => ({
    genre: 'avantPoste',
    id: avantPoste.id,
    lonLat: avantPoste.lonLat,
    paysHote: avantPoste.paysHote,
    specialisation: avantPoste.specialisation,
    niveau: niveauParAvantPoste[avantPoste.id] ?? 1,
    garnison: avantPoste.garnison,
    encre,
  }));

  const pile: MarqueurCarte = {
    genre: 'pile',
    id: 'pile-domicile',
    lonLat: vue.moi.positionDomicile,
    pile: PILE_DOMICILE,
    encre,
  };

  const chantier: ReadonlyArray<MarqueurCarte> = vue.moi.chantier
    ? [
        {
          genre: 'chantier',
          id: 'chantier',
          lonLat: POSITIONS.chantier,
          paysHote: PAYS_DE_NATION[NATION],
          nom: vue.moi.chantier.nom,
          acheveA: vue.chargeeA + vue.moi.chantier.resteMinutes * 60_000,
          encre,
        },
      ]
    : [];

  return [...avantPostes, pile, ...chantier];
}

const avancementDe = (mouvement: { totalMinutes: number; resteMinutes: number }): number =>
  1 - mouvement.resteMinutes / mouvement.totalMinutes;
