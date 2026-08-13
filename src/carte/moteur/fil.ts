import { Group, QuadraticBezierCurve3, Vector3, type InterleavedBufferAttribute } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { LonLat } from '@/domaine/geo';
import type { Milieu, TrajetCalcule } from '@/domaine/trajets';
import { PALETTE } from './palette';
import { EPAISSEUR_PAYS, type RepereMonde } from './repere';

/**
 * Le fil tendu. **Deux hauteurs, pas trois** : terre et mer partagent la surface, juste
 * au-dessus de la croûte. Poser le fil maritime au niveau de l'eau créait une marche à
 * chaque côte — le trajet multimodal plongeait et remontait deux fois pour ne rien dire de
 * plus. La mer se distingue par son dessin seul : liseré de sillage pâle et jalon coque.
 * Seul l'aérien décolle.
 */
const ALTITUDE_SURFACE = EPAISSEUR_PAYS + 0.06;

/** La flèche de l'arc aérien : une part de la corde, bornée aux deux bouts. */
export const PART_FLECHE_AIR = 0.18;
export const FLECHE_AIR_MIN = 4;
export const FLECHE_AIR_MAX = 24;

/**
 * Sans le plancher, un saut de cent kilomètres se dessine à plat et ne se distingue plus d'un
 * fil terrestre ; sans le plafond, un Londres–Tokyo sort du cadre et son ombre part se perdre.
 */
export const flecheAerienne = (corde: number): number =>
  Math.min(FLECHE_AIR_MAX, Math.max(FLECHE_AIR_MIN, corde * PART_FLECHE_AIR));

const SEGMENTS_AIR = 48;

/**
 * Le pointillé du restant, en pixels. Tiret court et régulier, plus serré que le trait
 * plein n'est épais : c'est ce qui le fait lire comme une intention, pas comme une route.
 * `dashScale = 1 / uniteParPixel` rend ces deux nombres directement lisibles en pixels.
 */
const TIRET_PX = 2;
const VIDE_PX = 5;

/**
 * Épaisseurs en pixels — constantes à l'écran, quel que soit le zoom : c'est tout l'intérêt
 * des fat lines sur le trait d'un pixel qu'elles remplacent.
 */
const EPAISSEUR_SILLAGE = 1;
const EPAISSEUR_OMBRE = 1;
const EPAISSEUR_ATTACHE = 1;
const EPAISSEUR_MARQUE = 1.4;

/**
 * Marques et accessoires en pixels eux aussi : le plateau se parcourt du globe entier au
 * département, et une taille fixe dans le monde ne peut être juste qu'à une seule distance.
 */
const DEMI_LOSANGE_PX = 4.5;
const RAYON_QUAI_PX = 8;
const DEMI_CARRE_QUAI_PX = 3.6;
const DEMI_TIRET_COTE_PX = 12;
const DEMI_CROIX_PX = 6;
const RAYON_DEPART_PX = 4;

/**
 * L'écart du liseré de sillage, en pixels. Il ne peut pas se régler par une échelle d'objet —
 * la perpendiculaire tourne le long de la route — donc ses sommets se réécrivent, mais
 * seulement quand le zoom a bougé d'un cran franc : au rapproché, un écart cuit en unités de
 * plateau envoyait le liseré à vingt pixels du fil, et parfois sur la terre ferme.
 */
const ECART_SILLAGE_PX = 3;
const CRAN_DE_ZOOM = 0.08;

/**
 * Sol, eau, ciel — et l'ordre ne dépend jamais du point de vue. Un fil maritime passe sous
 * les vols et par-dessus le fil terrestre, quelle que soit l'orbite. Les traits renoncent donc
 * au tampon de profondeur : c'est le seul moyen d'avoir un ordre *constant* aux croisements,
 * là où la profondeur donnerait celui de la caméra du moment.
 */
const RANG_RENDU: Readonly<Record<Milieu, number>> = { terre: 10, mer: 11, air: 12 };

export type EtapeFil = {
  readonly milieu: Milieu;
  /** La courbe suivie, découpée aux passages de l'antiméridien. */
  readonly brins: ReadonlyArray<BrinFil>;
  readonly longueur: number;
};

/** Un morceau continu de fil : le monde s'enroule, un trait ne peut pas traverser la bordure. */
type BrinFil = { readonly sommets: ReadonlyArray<Vector3>; readonly longueurs: ReadonlyArray<number> };

export type Quai = { readonly position: Vector3; readonly embarquement: boolean };

export type CouleursFil = { readonly trace: string; readonly progression: string };
export type EpaisseursFil = { readonly parcouru: number; readonly restant: number };

export type Fil = {
  readonly objet: Group;
  readonly etapes: ReadonlyArray<EtapeFil>;
  readonly quais: ReadonlyArray<Quai>;
  /** Les traits parcourus ; leur `instanceCount` est la seule chose qui bouge par image. */
  readonly progression: ReadonlyArray<{ ligne: Line2; segments: number }>;
  readonly traces: ReadonlyArray<Line2>;
  /** Le fil vertical qui rattache un jalon aérien à son ombre ; `null` hors du ciel. */
  readonly attache: Line2 | null;
  /** Marques et pointillés gardent leur maille à l'écran : une seule mesure, posée par image. */
  reglerEchelle(uniteParPixel: number): void;
  /** Une fat line se dessine en pixels : sans la taille du canevas, elle ne sait pas les faire. */
  reglerResolution(largeur: number, hauteur: number): void;
  regler(facteurAccent: number): void;
  detruire(): void;
};

/**
 * Construit le fil une fois pour toutes. Rien ici ne se rejoue à l'image : la boucle du
 * moteur ne fait qu'avancer un `instanceCount` et déplacer le jalon.
 */
export function construireFil(
  trajet: TrajetCalcule,
  repere: RepereMonde,
  couleurs: CouleursFil,
  epaisseurs: EpaisseursFil,
  opacites: { readonly trace: number; readonly progression: number },
): Fil {
  const objet = new Group();
  const etapes = decouperEnEtapes(trajet, repere);
  const materiaux: LineMaterial[] = [];

  const matiere = (options: {
    couleur: string;
    epaisseur: number;
    opacite: number;
    pointille?: boolean;
  }): LineMaterial => {
    const materiau = new LineMaterial({
      color: options.couleur,
      linewidth: options.epaisseur,
      transparent: true,
      opacity: options.opacite,
      depthTest: false,
      dashed: options.pointille === true,
      dashSize: TIRET_PX,
      gapSize: VIDE_PX,
    });
    materiaux.push(materiau);
    return materiau;
  };

  const matiereRestant = matiere({
    couleur: couleurs.trace,
    epaisseur: epaisseurs.restant,
    opacite: opacites.trace,
    pointille: true,
  });
  const matiereParcouru = matiere({
    couleur: couleurs.progression,
    epaisseur: epaisseurs.parcouru,
    opacite: opacites.progression,
  });
  // Le sillage est du papier, pas de l'encre de nation : c'est une eau remuée, pas une route.
  const matiereSillage = matiere({
    couleur: PALETTE.papier,
    epaisseur: EPAISSEUR_SILLAGE,
    opacite: opacites.trace * 0.8,
  });
  const matiereOmbre = matiere({
    couleur: couleurs.trace,
    epaisseur: EPAISSEUR_OMBRE,
    opacite: opacites.trace * 0.9,
    pointille: true,
  });
  const matiereMarque = matiere({
    couleur: couleurs.progression,
    epaisseur: EPAISSEUR_MARQUE,
    opacite: opacites.progression,
  });
  const matiereRelais = matiere({
    couleur: couleurs.trace,
    epaisseur: EPAISSEUR_MARQUE,
    opacite: Math.min(1, opacites.trace * 1.8),
  });

  const traces: Line2[] = [];
  const progression: Array<{ ligne: Line2; segments: number }> = [];
  const accessoires: Group[] = [];
  const sillages: Array<{ ligne: Line2; sommets: ReadonlyArray<Vector3>; normales: ReadonlyArray<Vector3> }> = [];

  for (const etape of etapes) {
    const rang = RANG_RENDU[etape.milieu];
    for (const brin of etape.brins) {
      const restant = filDe(brin.sommets, matiereRestant, rang);
      const parcouru = filDe(brin.sommets, matiereParcouru, rang);
      parcouru.geometry.instanceCount = 0;
      objet.add(restant, parcouru);
      traces.push(restant);
      progression.push({ ligne: parcouru, segments: brin.sommets.length - 1 });

      if (etape.milieu === 'mer') {
        const normales = normalesDe(brin.sommets);
        const ligne = filDe(brin.sommets, matiereSillage, rang);
        objet.add(ligne);
        sillages.push({ ligne, sommets: brin.sommets, normales });
      }
      // L'itinéraire survolé : sans lui, un arc haut se lit comme un trait posé à mi-chemin
      // entre deux pays. C'est un tracé au sol, pas une ombre portée — le plateau n'en a pas.
      if (etape.milieu === 'air') {
        objet.add(filDe(brin.sommets.map((point) => auSol(point, repere)), matiereOmbre, RANG_RENDU.terre));
      }
    }

    if (etape.milieu === 'terre') {
      for (const noeud of noeudsDeGrille(etape)) {
        accessoires.push(poser(noeud, losange(matiereRelais, rang)));
      }
    }
  }

  const quais = quaisDe(trajet, etapes);
  for (const quai of quais) {
    accessoires.push(poser(quai.position, marqueDeQuai(quai.embarquement, matiereMarque)));
  }

  const depart = etapes[0]?.brins[0]?.sommets[0];
  const arrivee = etapes.at(-1)?.brins.at(-1)?.sommets.at(-1);
  if (depart) accessoires.push(poser(depart, cercleDeDepart(matiereMarque)));
  if (arrivee) accessoires.push(poser(arrivee, croixDArrivee(matiereMarque)));

  for (const accessoire of accessoires) objet.add(accessoire);

  const attache = etapes.some((etape) => etape.milieu === 'air')
    ? filDe([new Vector3(), new Vector3()], matiere({
        couleur: couleurs.trace,
        epaisseur: EPAISSEUR_ATTACHE,
        opacite: Math.min(1, opacites.trace * 1.4),
      }), RANG_RENDU.air)
    : null;
  if (attache) objet.add(attache);

  const opacitesBase = materiaux.map((materiau) => materiau.opacity);
  let echelleSillage = 0;

  return {
    objet,
    etapes,
    quais,
    progression,
    traces,
    attache,
    reglerEchelle(uniteParPixel) {
      for (const accessoire of accessoires) accessoire.scale.setScalar(uniteParPixel);
      if (Math.abs(uniteParPixel - echelleSillage) > echelleSillage * CRAN_DE_ZOOM) {
        echelleSillage = uniteParPixel;
        const ecart = ECART_SILLAGE_PX * uniteParPixel;
        for (const sillage of sillages) {
          reecrireFil(
            sillage.ligne,
            sillage.sommets.map((sommet, i) =>
              sommet.clone().addScaledVector(sillage.normales[i]!, ecart),
            ),
          );
        }
      }
      // `dashScale` divise la distance monde : à 1/uniteParPixel, tiret et vide se comptent
      // directement en pixels, et la maille du pointillé ne bouge plus au zoom.
      const echelle = uniteParPixel > 0 ? 1 / uniteParPixel : 1;
      for (const materiau of materiaux) {
        if (materiau.dashed) materiau.dashScale = echelle;
      }
    },
    reglerResolution(largeur, hauteur) {
      for (const materiau of materiaux) materiau.resolution.set(largeur, hauteur);
    },
    regler(facteurAccent) {
      materiaux.forEach((materiau, rang) => {
        materiau.opacity = Math.min(1, opacitesBase[rang]! * facteurAccent);
      });
    },
    detruire() {
      objet.removeFromParent();
      objet.traverse((noeud) => {
        const ligne = noeud as Partial<Line2>;
        if (ligne.geometry) ligne.geometry.dispose();
      });
      for (const materiau of materiaux) materiau.dispose();
    },
  };
}

/** Le point du fil à `local` sur l'étape `index` — le jalon n'a besoin de rien d'autre. */
export function pointSurEtape(etape: EtapeFil, local: number, sortie: Vector3): void {
  const vise = Math.min(1, Math.max(0, local)) * etape.longueur;
  let parcouru = 0;
  for (const brin of etape.brins) {
    for (let i = 0; i < brin.longueurs.length; i++) {
      const longueur = brin.longueurs[i]!;
      if (parcouru + longueur >= vise || (brin === etape.brins[etape.brins.length - 1] && i === brin.longueurs.length - 1)) {
        const part = longueur > 0 ? (vise - parcouru) / longueur : 0;
        sortie.copy(brin.sommets[i]!).lerp(brin.sommets[i + 1]!, Math.min(1, Math.max(0, part)));
        return;
      }
      parcouru += longueur;
    }
  }
  const dernier = etape.brins[etape.brins.length - 1];
  if (dernier) sortie.copy(dernier.sommets[dernier.sommets.length - 1]!);
}

/** Le sol sous un point du fil : c'est là que passe l'itinéraire survolé. */
export const projeterAuSol = (point: Vector3, repere: RepereMonde, sortie: Vector3): void => {
  sortie.set(point.x, ALTITUDE_SURFACE + repere.chute(point.x, point.z), point.z);
};

const auSol = (point: Vector3, repere: RepereMonde): Vector3 =>
  new Vector3(point.x, ALTITUDE_SURFACE + repere.chute(point.x, point.z), point.z);

/* ----------------------------- découpe du fil ---------------------------- */

/**
 * Les étapes sont données en distance projetée, la polyligne en lon/lat : la découpe se fait
 * sur les longueurs mesurées dans le repère, pas sur les nœuds. `simplifier()` a pu retirer
 * le nœud de côte s'il était aligné — se fier aux index perdrait le quai.
 */
function decouperEnEtapes(trajet: TrajetCalcule, repere: RepereMonde): ReadonlyArray<EtapeFil> {
  if (trajet.etapes.length === 1 && trajet.etapes[0]!.milieu === 'air') {
    return [etapeAerienne(trajet, repere)];
  }

  const points = trajet.points;
  if (points.length < 2) return [];

  const longueurs = points.slice(0, -1).map((point, i) => distanceProjetee(point, points[i + 1]!, repere));
  const total = longueurs.reduce((somme, longueur) => somme + longueur, 0);
  const totalEtapes = trajet.etapes.reduce((somme, etape) => somme + etape.distanceUnites, 0) || 1;

  const etapes: EtapeFil[] = [];
  let curseur = 0;
  let restant = 0;
  let debut: LonLat = points[0]!;

  for (let e = 0; e < trajet.etapes.length; e++) {
    const etape = trajet.etapes[e]!;
    const derniere = e === trajet.etapes.length - 1;
    restant += (etape.distanceUnites / totalEtapes) * total;
    const sommets: LonLat[] = [debut];

    while (curseur < longueurs.length) {
      const longueur = longueurs[curseur]!;
      if (!derniere && longueur > 0 && restant < longueur) {
        const coupe = interpoler(debut, points[curseur + 1]!, restant / longueur);
        sommets.push(coupe);
        debut = coupe;
        longueurs[curseur] = longueur - restant;
        restant = 0;
        break;
      }
      restant -= longueur;
      curseur++;
      debut = points[curseur]!;
      sommets.push(debut);
    }

    etapes.push(assemblerEtape(etape.milieu, sommets, repere));
  }
  return etapes;
}

function etapeAerienne(trajet: TrajetCalcule, repere: RepereMonde): EtapeFil {
  const depart = repere.projeterLonLat(trajet.points[0]!, ALTITUDE_SURFACE);
  const arrivee = repere.projeterLonLat(trajet.points[trajet.points.length - 1]!, ALTITUDE_SURFACE);
  const fleche = flecheAerienne(depart.distanceTo(arrivee));
  const milieu = depart.clone().lerp(arrivee, 0.5);
  // Une Bézier quadratique culmine à mi-chemin de son point de contrôle : pour que l'apex
  // soit bien la flèche demandée, le contrôle monte du double.
  milieu.y += fleche * 2;
  const sommets = new QuadraticBezierCurve3(depart, milieu, arrivee).getPoints(SEGMENTS_AIR);
  return { milieu: 'air', brins: [brinDe(sommets)], longueur: longueurDe(sommets) };
}

function assemblerEtape(milieu: Milieu, sommets: ReadonlyArray<LonLat>, repere: RepereMonde): EtapeFil {
  const brins: BrinFil[] = [];
  let courant: Vector3[] = [];

  for (let i = 0; i < sommets.length; i++) {
    const point = sommets[i]!;
    if (i > 0 && Math.abs(point[0] - sommets[i - 1]![0]) > 180) {
      const { sortie, entree } = bordsTraverses(sommets[i - 1]!, point, repere);
      courant.push(sortie);
      if (courant.length > 1) brins.push(brinDe(courant));
      courant = [entree];
    }
    courant.push(repere.projeterLonLat(point, ALTITUDE_SURFACE));
  }
  if (courant.length > 1) brins.push(brinDe(courant));

  return { milieu, brins, longueur: brins.reduce((somme, brin) => somme + longueurDe(brin.sommets), 0) };
}

function bordsTraverses(
  depuis: LonLat,
  vers: LonLat,
  repere: RepereMonde,
): { sortie: Vector3; entree: Vector3 } {
  const versLEst = vers[0] - depuis[0] < -180;
  const ecart = versLEst ? vers[0] - depuis[0] + 360 : vers[0] - depuis[0] - 360;
  const longitudeBordure = versLEst ? 180 : -180;
  const fraction = ecart === 0 ? 0 : (longitudeBordure - depuis[0]) / ecart;
  const bord = repere.bordALatitude(depuis[1] + fraction * (vers[1] - depuis[1]));
  return {
    sortie: repere.versMonde(versLEst ? bord.xEst : bord.xOuest, bord.y, ALTITUDE_SURFACE),
    entree: repere.versMonde(versLEst ? bord.xOuest : bord.xEst, bord.y, ALTITUDE_SURFACE),
  };
}

const brinDe = (sommets: ReadonlyArray<Vector3>): BrinFil => ({
  sommets,
  longueurs: sommets.slice(0, -1).map((sommet, i) => sommet.distanceTo(sommets[i + 1]!)),
});

const longueurDe = (sommets: ReadonlyArray<Vector3>): number =>
  sommets.slice(0, -1).reduce((somme, sommet, i) => somme + sommet.distanceTo(sommets[i + 1]!), 0);

const interpoler = (a: LonLat, b: LonLat, part: number): LonLat => [
  a[0] + (b[0] - a[0]) * part,
  a[1] + (b[1] - a[1]) * part,
];

function distanceProjetee(a: LonLat, b: LonLat, repere: RepereMonde): number {
  const depuis = repere.projeterLonLat(a, 0);
  const vers = repere.projeterLonLat(b, 0);
  return Math.hypot(vers.x - depuis.x, vers.z - depuis.z);
}

/* --------------------------------- traits -------------------------------- */

function filDe(sommets: ReadonlyArray<Vector3>, materiau: LineMaterial, rang: number): Line2 {
  const geometrie = new LineGeometry();
  geometrie.setPositions(sommets.flatMap((sommet) => [sommet.x, sommet.y, sommet.z]));
  const ligne = new Line2(geometrie, materiau);
  // Le pointillé se mesure sur la distance parcourue le long du trait, pas sur les sommets.
  ligne.computeLineDistances();
  ligne.renderOrder = rang;
  return ligne;
}

/** Le sillage longe la coque : une perpendiculaire dans le plan de la carte, jamais en hauteur. */
function normalesDe(sommets: ReadonlyArray<Vector3>): ReadonlyArray<Vector3> {
  return sommets.map((sommet, i) => {
    const voisin = sommets[i + 1] ?? sommets[i - 1] ?? sommet;
    const signe = sommets[i + 1] ? 1 : -1;
    const dx = (voisin.x - sommet.x) * signe;
    const dz = (voisin.z - sommet.z) * signe;
    const norme = Math.hypot(dx, dz) || 1;
    return new Vector3(-dz / norme, 0, dx / norme);
  });
}

/**
 * Réécrit les sommets d'un fil dans le tampon entrelacé qu'il possède déjà. `setPositions`
 * en allouerait un neuf à chaque appel — acceptable au chargement, pas dans une boucle.
 */
function reecrireFil(ligne: Line2, sommets: ReadonlyArray<Vector3>): void {
  const debut = ligne.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute;
  const tampon = debut.data;
  for (let i = 0; i + 1 < sommets.length; i++) {
    const a = sommets[i]!;
    const b = sommets[i + 1]!;
    tampon.array.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
  }
  tampon.needsUpdate = true;
}

/** Deux sommets réécrits par image — la seule chose que la boucle a le droit de toucher. */
export const tendreAttache = (attache: Line2, haut: Vector3, bas: Vector3): void =>
  reecrireFil(attache, [haut, bas]);

/* ------------------------------- accessoires ------------------------------ */

/**
 * Les losanges tombent sur les nœuds de grille traversés : ce sont les seuls points où un
 * trajet terrestre peut être intercepté, et c'est à ce titre qu'ils se dessinent — pas comme
 * décor de trait.
 */
function noeudsDeGrille(etape: EtapeFil): ReadonlyArray<Vector3> {
  const noeuds: Vector3[] = [];
  for (const brin of etape.brins) {
    for (let i = 1; i < brin.sommets.length - 1; i++) noeuds.push(brin.sommets[i]!);
  }
  return noeuds;
}

function quaisDe(trajet: TrajetCalcule, etapes: ReadonlyArray<EtapeFil>): ReadonlyArray<Quai> {
  const quais: Quai[] = [];
  for (let i = 1; i < etapes.length; i++) {
    const premier = etapes[i]!.brins[0]?.sommets[0];
    if (premier === undefined) continue;
    quais.push({ position: premier.clone(), embarquement: trajet.etapes[i]!.milieu === 'mer' });
  }
  return quais;
}

/** Les accessoires sont tracés autour de l'origine puis posés : c'est ce qui les rend scalables. */
function poser(position: Vector3, accessoire: Group): Group {
  accessoire.position.copy(position);
  return accessoire;
}

function contour(sommets: ReadonlyArray<number>, materiau: LineMaterial, rang: number): LineSegments2 {
  const geometrie = new LineSegmentsGeometry();
  geometrie.setPositions(Array.from(sommets));
  const segments = new LineSegments2(geometrie, materiau);
  segments.renderOrder = rang;
  return segments;
}

/** Un polygone à plat dans le plan de la carte, fermé, en coordonnées locales. */
function polygone(coins: ReadonlyArray<readonly [number, number]>): number[] {
  const sommets: number[] = [];
  for (let i = 0; i < coins.length; i++) {
    const a = coins[i]!;
    const b = coins[(i + 1) % coins.length]!;
    sommets.push(a[0], 0, a[1], b[0], 0, b[1]);
  }
  return sommets;
}

function cercle(rayon: number, cotes = 20): number[] {
  const sommets: number[] = [];
  for (let i = 0; i < cotes; i++) {
    const a = (i / cotes) * Math.PI * 2;
    const b = ((i + 1) / cotes) * Math.PI * 2;
    sommets.push(
      Math.cos(a) * rayon, 0, Math.sin(a) * rayon,
      Math.cos(b) * rayon, 0, Math.sin(b) * rayon,
    );
  }
  return sommets;
}

const dans = (segments: LineSegments2): Group => {
  const groupe = new Group();
  groupe.add(segments);
  return groupe;
};

const losange = (materiau: LineMaterial, rang: number): Group =>
  dans(
    contour(
      polygone([
        [-DEMI_LOSANGE_PX, 0], [0, -DEMI_LOSANGE_PX], [DEMI_LOSANGE_PX, 0], [0, DEMI_LOSANGE_PX],
      ]),
      materiau,
      rang,
    ),
  );

const cercleDeDepart = (materiau: LineMaterial): Group =>
  dans(contour(cercle(RAYON_DEPART_PX, 14), materiau, RANG_RENDU.mer));

/**
 * La terminaison du fil : un × d'encre, incliné comme sur les planches. Une pointe de flèche
 * dirait « ça continue par là » ; le fil s'arrête, et son point d'arrivée est une croix de
 * relevé, pas un signe de direction — le cap se lit déjà au fil lui-même.
 */
const croixDArrivee = (materiau: LineMaterial): Group =>
  dans(
    contour(
      [
        -DEMI_CROIX_PX, 0, -DEMI_CROIX_PX, DEMI_CROIX_PX, 0, DEMI_CROIX_PX,
        DEMI_CROIX_PX, 0, -DEMI_CROIX_PX, -DEMI_CROIX_PX, 0, DEMI_CROIX_PX,
      ],
      materiau,
      RANG_RENDU.mer,
    ),
  );

/**
 * Un quai, dessiné comme sur la planche : le cercle, le carré plein quand on embarque et vide
 * quand on débarque, le tiret de la ligne de côte. À plat dans le plan de la carte — l'orbite
 * ne descend jamais assez pour qu'un symbole couché se referme.
 */
function marqueDeQuai(embarquement: boolean, materiau: LineMaterial): Group {
  const groupe = new Group();

  const anneau = cercle(RAYON_QUAI_PX);
  anneau.push(
    -DEMI_TIRET_COTE_PX, 0, -RAYON_QUAI_PX * 1.6,
    DEMI_TIRET_COTE_PX, 0, -RAYON_QUAI_PX * 1.6,
  );

  const c = DEMI_CARRE_QUAI_PX;
  const carre = polygone([[-c, -c], [c, -c], [c, c], [-c, c]]);
  // Le carré plein n'a pas de remplissage : à cette taille, deux diagonales le noircissent.
  if (embarquement) carre.push(-c, 0, -c, c, 0, c, c, 0, -c, -c, 0, c);

  groupe.add(contour(anneau, materiau, RANG_RENDU.mer));
  groupe.add(contour(carre, materiau, RANG_RENDU.mer));
  return groupe;
}
