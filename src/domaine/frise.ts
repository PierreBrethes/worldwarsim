import { enHeuresMinutes } from './duree';
import { roleRepresentatif } from './troupes';
import type { ArcAffiche, RoleUnite, TypeMouvement, VueJoueur } from './vue-joueur';
import { LIBELLE_TYPE, libellePile } from './vue-joueur';

/**
 * Les trois encres de la frise. Ce n'est pas l'état de l'arc : un arc `adverseDetecte` se
 * lit en critique s'il vient sur moi, en gris sourd s'il passe ailleurs — même donnée,
 * deux urgences. Le rendu choisit sa couleur ici, pas dans un `if` de composant.
 */
export type FamilleFiche = 'mien' | 'capSurMoi' | 'renseignement';

export type FiltreFrise = 'tous' | FamilleFiche | TypeMouvement;

/**
 * Un horaire de mouvement, ou l'aveu qu'on ne l'a pas. Sans cette union, une fiche sans
 * estimation retomberait sur un `0` d'arrivée et afficherait un compte à rebours inventé.
 */
export type Chronologie =
  | { readonly connue: false; readonly avancement: number }
  | {
      readonly connue: true;
      readonly departA: number;
      readonly arriveeA: number;
      readonly resolutionA: number;
    };

export type FicheMouvement = {
  readonly id: string;
  readonly famille: FamilleFiche;
  readonly origine: string;
  readonly destination: string;
  /** `null` tant que le renseignement n'a pas percé le mouvement — jamais deviné. */
  readonly type: TypeMouvement | null;
  readonly libelleType: string;
  readonly composition: string;
  readonly identifie: boolean;
  /** Un horaire adverse est toujours approché : la fiche le préfixe d'un `~`. */
  readonly estime: boolean;
  /** Le visage de la pile ; seul un mouvement `mien` en a un, le brouillard fait le reste. */
  readonly role: RoleUnite | null;
  readonly chronologie: Chronologie;
};

const COMPOSITION_INCONNUE = 'nature et composition non observées';

/** La dernière position connue est figée, la maîtrise des mers n'a ni origine ni cible. */
type ArcEnFrise = Extract<ArcAffiche, { etat: 'mien' | 'adverseDetecte' }>;

const estEnFrise = (arc: ArcAffiche): arc is ArcEnFrise =>
  arc.etat === 'mien' || arc.etat === 'adverseDetecte';

export function construireFrise(vue: VueJoueur): ReadonlyArray<FicheMouvement> {
  return vue.arcs
    .filter(estEnFrise)
    .map((arc) => ficheDArc(arc, vue.chargeeA))
    .slice()
    .sort((premiere, seconde) => instantDeTri(premiere) - instantDeTri(seconde));
}

function ficheDArc(arc: ArcEnFrise, chargeeA: number): FicheMouvement {
  if (arc.etat === 'mien') {
    return {
      id: arc.id,
      famille: 'mien',
      origine: arc.origineLibelle,
      destination: arc.destinationLibelle,
      type: arc.type,
      libelleType: LIBELLE_TYPE[arc.type],
      composition: libellePile(arc.pile),
      identifie: false,
      estime: false,
      role: roleRepresentatif(arc.pile),
      chronologie: chronologieMienne(arc, chargeeA),
    };
  }

  const perce = arc.identification.perce;
  return {
    id: arc.id,
    famille: arc.capSurMoi ? 'capSurMoi' : 'renseignement',
    origine: 'origine inconnue',
    destination: `cap ${String(Math.round(arc.capDegres)).padStart(3, '0')}°`,
    type: perce ? arc.identification.type : null,
    libelleType: perce ? LIBELLE_TYPE[arc.identification.type] : 'non identifié',
    composition: perce ? libellePile(arc.identification.pile) : COMPOSITION_INCONNUE,
    identifie: perce,
    estime: true,
    role: null,
    chronologie: chronologieDetectee(arc, chargeeA),
  };
}

/**
 * `VueJoueur` ne porte que le temps restant : la durée totale s'en déduit par l'avancement,
 * et le départ par soustraction. Le jour où le serveur enverra les deux instants, tout ceci
 * disparaît — c'est bien pour cela que le calcul tient dans une seule fonction.
 */
function chronologieMienne(
  arc: Extract<ArcAffiche, { etat: 'mien' }>,
  chargeeA: number,
): Chronologie {
  const reste = Math.max(0, arc.minutesRestantes);
  const total = arc.avancement >= 1 ? reste : reste / (1 - arc.avancement);
  const arriveeA = chargeeA + reste * 60_000;
  return {
    connue: true,
    departA: chargeeA - (total - reste) * 60_000,
    arriveeA,
    resolutionA:
      arc.attenteFrontiere === null
        ? arriveeA
        : chargeeA + arc.attenteFrontiere.resolutionDansMinutes * 60_000,
  };
}

function chronologieDetectee(
  arc: Extract<ArcAffiche, { etat: 'adverseDetecte' }>,
  chargeeA: number,
): Chronologie {
  if (arc.minutesRestantesEstimees === null) return { connue: false, avancement: arc.avancement };
  const reste = Math.max(0, arc.minutesRestantesEstimees);
  const total = arc.avancement >= 1 ? reste : reste / (1 - arc.avancement);
  const arriveeA = chargeeA + reste * 60_000;
  return { connue: true, departA: chargeeA - (total - reste) * 60_000, arriveeA, resolutionA: arriveeA };
}

/** Une fiche sans horaire ne peut pas s'intercaler : elle va en queue de frise. */
const instantDeTri = (fiche: FicheMouvement): number =>
  fiche.chronologie.connue ? fiche.chronologie.arriveeA : Number.POSITIVE_INFINITY;

export const estImmobilise = (chronologie: Chronologie): boolean =>
  chronologie.connue && chronologie.resolutionA > chronologie.arriveeA;

export function partParcourue(chronologie: Chronologie, maintenant: number): number {
  if (!chronologie.connue) return borner01(chronologie.avancement);
  const { departA, arriveeA } = chronologie;
  if (arriveeA <= departA) return 1;
  return borner01((maintenant - departA) / (arriveeA - departA));
}

/** Le rebours vise la résolution, pas l'arrivée : c'est l'instant où le mouvement compte. */
export const millisecondesAvantResolution = (
  chronologie: Chronologie,
  maintenant: number,
): number | null => (chronologie.connue ? Math.max(0, chronologie.resolutionA - maintenant) : null);

const borner01 = (valeur: number): number => Math.min(1, Math.max(0, valeur));

const LIBELLE_TYPE_PLURIEL: Readonly<Record<TypeMouvement, string>> = {
  attaque: 'attaques',
  raid: 'raids',
  avantPoste: 'avant-postes',
  agent: 'agents',
  leurre: 'leurres',
};

export type CompteurFrise = {
  readonly cle: FiltreFrise;
  readonly libelle: string;
  readonly nombre: number;
  /** Un cap sur moi porte l'accent critique dès qu'il y en a un, filtre actif ou non. */
  readonly alerte: boolean;
};

/**
 * Mes types sont déclinés parce qu'ils sont connus ; ceux d'en face ne le sont pas, et
 * c'est exactement ce que la rangée doit donner à voir : d'un côté un inventaire, de
 * l'autre deux tas.
 */
export function compteursFrise(
  fiches: ReadonlyArray<FicheMouvement>,
): ReadonlyArray<CompteurFrise> {
  const parFamille = (famille: FamilleFiche) =>
    fiches.filter((fiche) => fiche.famille === famille).length;
  const miennes = fiches.filter((fiche) => fiche.famille === 'mien');

  const types = (Object.keys(LIBELLE_TYPE_PLURIEL) as ReadonlyArray<TypeMouvement>)
    .map((type) => ({
      cle: type,
      libelle: LIBELLE_TYPE_PLURIEL[type],
      nombre: miennes.filter((fiche) => fiche.type === type).length,
      alerte: false,
    }))
    .filter((compteur) => compteur.nombre > 0);

  const capSurMoi = parFamille('capSurMoi');
  return [
    { cle: 'tous', libelle: 'tous', nombre: fiches.length, alerte: false },
    { cle: 'mien', libelle: 'les miens', nombre: miennes.length, alerte: false },
    ...types,
    { cle: 'capSurMoi', libelle: 'cap sur moi', nombre: capSurMoi, alerte: capSurMoi > 0 },
    {
      cle: 'renseignement',
      libelle: 'renseignement',
      nombre: parFamille('renseignement'),
      alerte: false,
    },
  ];
}

export function filtrerFrise(
  fiches: ReadonlyArray<FicheMouvement>,
  filtre: FiltreFrise,
): ReadonlyArray<FicheMouvement> {
  if (filtre === 'tous') return fiches;
  if (filtre === 'mien' || filtre === 'capSurMoi' || filtre === 'renseignement') {
    return fiches.filter((fiche) => fiche.famille === filtre);
  }
  return fiches.filter((fiche) => fiche.famille === 'mien' && fiche.type === filtre);
}

/** La ligne que la frise repliée laisse sur le bureau. */
export function resumeFrise(
  fiches: ReadonlyArray<FicheMouvement>,
  maintenant: number,
): string {
  if (!fiches.length) return 'aucun mouvement en vol';
  const morceaux = [`${fiches.length} en vol`];

  const prochaine = fiches.find((fiche) => fiche.chronologie.connue);
  if (prochaine) {
    const restant = millisecondesAvantResolution(prochaine.chronologie, maintenant) ?? 0;
    const marque = estImmobilise(prochaine.chronologie) ? '⏸ ' : '';
    morceaux.push(
      `proch. arrivée ${marque}${prochaine.estime ? '~' : ''}${enHeuresMinutes(restant / 60_000)}`,
    );
  }

  const capSurMoi = fiches.filter((fiche) => fiche.famille === 'capSurMoi').length;
  if (capSurMoi) morceaux.push(`${capSurMoi} cap sur moi`);
  return morceaux.join(' · ');
}
