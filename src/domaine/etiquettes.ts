import type { LonLat } from './geo';
import type { ArcAffiche, Pile, RoleUnite, TypeMouvement, VueJoueur } from './vue-joueur';
import { LIBELLE_TYPE } from './vue-joueur';

/**
 * Ce que la carte sait planter au sol. Une union discriminée plutôt qu'un marqueur à champs
 * optionnels : un avant-poste n'a pas d'effectif de pile, un chantier n'a pas de garnison, et
 * l'étiquette ne peut donc pas afficher le champ d'un autre genre par distraction.
 */
export type MarqueurCarte =
  | {
      readonly genre: 'avantPoste';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly paysHote: string;
      readonly specialisation: 'extraction' | 'relais' | 'ecoute';
      readonly niveau: number;
      readonly garnison: number;
      readonly encre: string;
    }
  | {
      readonly genre: 'pile';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly pile: Pile;
      readonly encre: string;
    }
  | {
      readonly genre: 'chantier';
      readonly id: string;
      readonly lonLat: LonLat;
      readonly paysHote: string;
      readonly nom: string;
      readonly acheveA: number;
      /** Aucun ordre ne prend la suite : une fois achevé, le chantier tourne à vide. */
      readonly sansOrdre: boolean;
      readonly encre: string;
    };

export const LIBELLE_SPECIALISATION: Readonly<
  Record<Extract<MarqueurCarte, { genre: 'avantPoste' }>['specialisation'], string>
> = {
  extraction: 'extraction',
  relais: 'relais logistique',
  ecoute: 'station d’écoute',
};

/**
 * Le visage du socle. Provisoire : il suivra un jour le point de départ du trajet plutôt que
 * le genre du marqueur, d'où un champ à part et non une lecture du type d'étiquette.
 *
 * Un seul picto d'avant-poste, quelle que soit la spécialisation : trois dessins pour une
 * distinction que l'étiquette écrit déjà en toutes lettres coûteraient un vocabulaire de plus
 * à apprendre, pour rien.
 */
export type PictoEtiquette = 'avant-poste' | 'pile' | 'chantier';

export type TypeEtiquette =
  | 'avant-poste'
  | 'pile'
  | 'chantier'
  | 'mouvement-mien'
  | 'mouvement-cap-sur-moi'
  | 'renseignement';

/**
 * Le rôle d'une ligne, pas sa forme : la maquette décide qu'une ligne de nature est en
 * capitales espacées et une ligne de chiffres en chasse tabulaire. Le domaine ne fabrique
 * jamais de texte de compte à rebours — il donne l'échéance, la couche d'affichage la
 * décompte une fois par seconde et rien ne se recalcule entre deux.
 */
export type LigneEtiquette =
  | { readonly role: 'nature' | 'chiffres' | 'effectif' | 'mention'; readonly texte: string }
  | { readonly role: 'compte'; readonly echeanceA: number; readonly prefixe: string };

/**
 * Une ancre mobile ne porte pas de position : la tête d'un mouvement se déplace sur son arc à
 * chaque image, et c'est la couche des arcs qui sait où elle en est. Poser ici un `lonLat`
 * figerait l'étiquette au point de départ.
 */
export type AncreEtiquette =
  | { readonly genre: 'sol'; readonly lonLat: LonLat }
  | { readonly genre: 'teteMouvement'; readonly arc: string };

export type EtiquetteCarte = {
  readonly id: string;
  readonly type: TypeEtiquette;
  readonly priorite: number;
  readonly ancre: AncreEtiquette;
  /** L'encre de la nation propriétaire ; `null` quand l'étiquette ne m'appartient pas. */
  readonly encre: string | null;
  /** Le picto planté au sol ; `null` pour une tête de mouvement, dont le sprite 3D fait office. */
  readonly picto: PictoEtiquette | null;
  readonly lignes: ReadonlyArray<LigneEtiquette>;
  /** Un mouvement adverse percé par le renseignement — la maquette le distingue par un état. */
  readonly identifie: boolean;
  /**
   * Le mouvement vient frapper, et on le sait. Faux tant que le renseignement n'a pas percé :
   * la marque d'alerte n'arme son triangle que sur une nature établie, jamais sur un soupçon.
   */
  readonly offensif: boolean;
  /** Un chantier achevé que rien ne suit — le cas d'oubli que le bord d'écran rattrape. */
  readonly sansOrdre: boolean;
  /** Le pays que le clic sélectionne ; `null` quand l'étiquette ne se clique pas. */
  readonly paysHote: string | null;
};

export const estCompte = (ligne: LigneEtiquette): ligne is Extract<LigneEtiquette, { role: 'compte' }> =>
  ligne.role === 'compte';

/**
 * L'ordre du dégradé au chevauchement. La fiche 11 le donne pour cinq types ; le
 * renseignement — un mouvement adverse qui ne vient pas sur moi — s'intercale sous le mien
 * et au-dessus du chantier : un contact ennemi se lit avant une durée de construction, mais
 * après ce que je pilote moi-même.
 */
const PRIORITE: Readonly<Record<TypeEtiquette, number>> = {
  'mouvement-cap-sur-moi': 5,
  'mouvement-mien': 4,
  renseignement: 3,
  chantier: 2,
  'avant-poste': 1,
  pile: 0,
};

/** Sous ce reste, l'étiquette passe à l'accent d'urgence de la maquette. */
export const URGENCE_MS = 5 * 60_000;

const ABREGE_ROLE: Readonly<Record<RoleUnite, string>> = {
  infanterie: 'INF',
  blinde: 'BLD',
  transportTerrestre: 'TPT',
  chasseur: 'CHS',
  bombardier: 'BMB',
  transportAerien: 'TPA',
  escorte: 'ESC',
  cargo: 'CGO',
  porteAvions: 'PAV',
};

/** Deux lignes, jamais de phrase : la composition s'abrège, le « · » remplace la conjonction. */
export function abregerPile(pile: Pile): string {
  return (Object.entries(pile) as ReadonlyArray<[RoleUnite, number]>)
    .filter(([, nombre]) => nombre > 0)
    .map(([role, nombre]) => `${nombre} ${ABREGE_ROLE[role]}`)
    .join(' · ');
}

export const effectifDe = (pile: Pile): number =>
  Object.values(pile).reduce((somme, nombre) => somme + nombre, 0);

export function construireEtiquettes(
  vue: VueJoueur,
  marqueurs: ReadonlyArray<MarqueurCarte>,
): ReadonlyArray<EtiquetteCarte> {
  return [
    ...marqueurs.map(etiquetteDeMarqueur),
    ...vue.arcs.map((arc) => etiquetteDArc(arc, vue.chargeeA)).filter(existe),
  ];
}

const existe = <T>(valeur: T | null): valeur is T => valeur !== null;

function etiquetteDeMarqueur(marqueur: MarqueurCarte): EtiquetteCarte {
  const commun = {
    id: marqueur.id,
    ancre: { genre: 'sol', lonLat: marqueur.lonLat },
    encre: marqueur.encre,
    identifie: false,
    offensif: false,
    sansOrdre: false,
  } as const;

  switch (marqueur.genre) {
    case 'avantPoste':
      return {
        ...commun,
        type: 'avant-poste',
        priorite: PRIORITE['avant-poste'],
        picto: 'avant-poste',
        paysHote: marqueur.paysHote,
        lignes: [
          { role: 'nature', texte: LIBELLE_SPECIALISATION[marqueur.specialisation] },
          { role: 'chiffres', texte: `NIV. ${marqueur.niveau} · GARN. ${marqueur.garnison}` },
        ],
      };
    case 'pile':
      return {
        ...commun,
        type: 'pile',
        priorite: PRIORITE.pile,
        picto: 'pile',
        paysHote: null,
        lignes: [
          { role: 'effectif', texte: String(effectifDe(marqueur.pile)) },
          { role: 'chiffres', texte: abregerPile(marqueur.pile) },
        ],
      };
    case 'chantier':
      return {
        ...commun,
        type: 'chantier',
        priorite: PRIORITE.chantier,
        picto: 'chantier',
        paysHote: marqueur.paysHote,
        sansOrdre: marqueur.sansOrdre,
        lignes: [
          { role: 'nature', texte: marqueur.nom },
          { role: 'compte', echeanceA: marqueur.acheveA, prefixe: 'chantier ' },
        ],
      };
  }
}

/**
 * La règle de renseignement tient dans cette fonction et nulle part ailleurs : un mouvement
 * adverse non identifié n'a structurellement ni type ni pile à laisser filer, et son horaire
 * sort préfixé d'un « ~ ». Une percée donne la nature et la composition — jamais la montre.
 * Un arc figé ou une simple maîtrise des mers ne portent aucune étiquette : ils n'ont rien à
 * dire qu'un cône anonyme ne dise déjà.
 */
function etiquetteDArc(arc: ArcAffiche, chargeeA: number): EtiquetteCarte | null {
  if (arc.etat === 'mien') {
    return {
      id: arc.id,
      type: 'mouvement-mien',
      priorite: PRIORITE['mouvement-mien'],
      ancre: { genre: 'teteMouvement', arc: arc.id },
      encre: null,
      picto: null,
      identifie: false,
      offensif: false,
      sansOrdre: false,
      paysHote: null,
      lignes: [{ role: 'compte', echeanceA: chargeeA + arc.minutesRestantes * 60_000, prefixe: '' }],
    };
  }
  if (arc.etat !== 'adverseDetecte') return null;

  const type = arc.capSurMoi ? 'mouvement-cap-sur-moi' : 'renseignement';
  const horaire: ReadonlyArray<LigneEtiquette> =
    arc.minutesRestantesEstimees === null
      ? []
      : [
          {
            role: 'compte',
            echeanceA: chargeeA + arc.minutesRestantesEstimees * 60_000,
            prefixe: '~',
          },
        ];
  const seconde: LigneEtiquette = arc.identification.perce
    ? {
        role: 'nature',
        texte: `${LIBELLE_TYPE[arc.identification.type]} · ${abregerPile(arc.identification.pile)}`,
      }
    : { role: 'mention', texte: 'estimé' };

  return {
    id: arc.id,
    type,
    priorite: PRIORITE[type],
    ancre: { genre: 'teteMouvement', arc: arc.id },
    encre: null,
    picto: null,
    identifie: arc.identification.perce,
    offensif: arc.identification.perce && TYPES_OFFENSIFS.includes(arc.identification.type),
    sansOrdre: false,
    paysHote: null,
    lignes: [...horaire, seconde],
  };
}

/** Frapper, c'est attaquer une nation ou raider un avant-poste ; le reste s'infiltre. */
const TYPES_OFFENSIFS: ReadonlyArray<TypeMouvement> = ['attaque', 'raid'];
