import type { LonLat } from './geo';
import type { Monde } from './monde';

/**
 * Calcul de trajets terrestre, naval, aérien ou combiné sur une grille dérivée du monde
 * projeté (ADR 0012). TS pur : le serveur appellera ce module à la création d'un mouvement —
 * si le client calculait ses propres routes, il choisirait aussi ses propres vitesses.
 *
 * Les coûts relatifs sont **arbitraires**, jamais simulés, comme ceux de
 * `convex/constantes.ts` : la simulation d'équilibrage les reprendra.
 */
export type ModeTrajet = 'terrestre' | 'naval' | 'aerien' | 'combine';
export type Milieu = 'terre' | 'mer' | 'air';

export type EtapeTrajet = { readonly milieu: Milieu; readonly distanceUnites: number };

export type TrajetCalcule = {
  readonly mode: ModeTrajet;
  /** Polyligne en lon/lat réels ; un segment dont l'écart de longitude dépasse 180° s'enroule. */
  readonly points: ReadonlyArray<LonLat>;
  /** En unités projetées (1 unité ≈ 111 km à l'équateur), transferts non compris. */
  readonly distanceUnites: number;
  /** En unités-équivalentes : distance pondérée par milieu + transferts. C'est le temps. */
  readonly coutUnites: number;
  readonly etapes: ReadonlyArray<EtapeTrajet>;
};

export const COUT_PAR_MILIEU: Readonly<Record<'terre' | 'mer', number>> = {
  terre: 1.6,
  mer: 1.0,
};
/** Embarquer ou débarquer coûte l'équivalent de 8 unités de mer — l'arbitrage colonne/convoi. */
export const COUT_TRANSFERT = 8;

const VIDE = 0;
const TERRE = 1;
const MER = 2;

/**
 * Les détroits et canaux plus fins que la grille, gravés comme couloirs de mer : sans eux le
 * raster soude Gibraltar, ferme la Manche et ignore Suez comme Panama — le tour de l'Afrique
 * redeviendrait obligatoire alors qu'en 1940 il est un choix de blocus, pas de géométrie.
 */
export const PORTES_MARITIMES: ReadonlyArray<{ nom: string; passage: ReadonlyArray<LonLat> }> = [
  { nom: 'Pas de Calais', passage: [[1.1, 50.6], [1.6, 51.0]] },
  { nom: 'Gibraltar', passage: [[-5.9, 35.9], [-5.2, 36.0]] },
  { nom: 'Øresund', passage: [[12.3, 56.1], [12.9, 55.5], [12.7, 55.0]] },
  { nom: 'Dardanelles et Bosphore', passage: [[26.0, 40.0], [26.7, 40.3], [27.6, 40.5], [28.9, 40.8], [29.2, 41.2], [29.3, 41.4]] },
  { nom: 'Canal de Suez', passage: [[32.3, 31.3], [32.35, 30.6], [32.55, 29.9]] },
  { nom: 'Canal de Panama', passage: [[-79.9, 9.4], [-79.6, 8.9]] },
  { nom: 'Ormuz', passage: [[56.2, 26.6], [56.6, 26.3]] },
  { nom: 'Malacca', passage: [[100.0, 6.2], [101.3, 4.4], [102.5, 3.0], [103.6, 1.5], [104.2, 1.2]] },
  { nom: 'Bab-el-Mandeb', passage: [[43.3, 12.7], [43.5, 12.4]] },
];

export type GrilleTrajets = {
  readonly largeur: number;
  readonly hauteur: number;
  readonly pas: number;
  readonly cellules: Uint8Array;
  /** Par ligne : [première cellule non vide, dernière], -1 si aucune — l'enroulement est-ouest. */
  readonly bords: Int32Array;
  readonly sphere: Monde['sphere'];
  readonly contour: Monde['contour'];
};

export function construireGrille(monde: Monde, pas = 0.25): GrilleTrajets {
  const largeur = Math.ceil((monde.sphere.maxX - monde.sphere.minX) / pas);
  const hauteur = Math.ceil((monde.sphere.maxY - monde.sphere.minY) / pas);
  const cellules = new Uint8Array(largeur * hauteur);

  const bordsParLigne = bordsDeSphere(monde, pas, hauteur);
  for (let ligne = 0; ligne < hauteur; ligne++) {
    const [ouest, est] = bordsParLigne[ligne]!;
    const debut = Math.max(0, Math.ceil((ouest - monde.sphere.minX) / pas - 0.5));
    const fin = Math.min(largeur - 1, Math.floor((est - monde.sphere.minX) / pas - 0.5));
    for (let colonne = debut; colonne <= fin; colonne++) {
      cellules[ligne * largeur + colonne] = MER;
    }
  }

  remplirTerre(monde, pas, largeur, hauteur, cellules);

  for (const porte of PORTES_MARITIMES) {
    graverPassage(porte.passage, monde, pas, largeur, hauteur, cellules);
  }

  const bords = new Int32Array(hauteur * 2).fill(-1);
  for (let ligne = 0; ligne < hauteur; ligne++) {
    for (let colonne = 0; colonne < largeur; colonne++) {
      const cellule = ligne * largeur + colonne;
      if (cellules[cellule] === VIDE) continue;
      if (bords[ligne * 2] === -1) bords[ligne * 2] = cellule;
      bords[ligne * 2 + 1] = cellule;
    }
  }

  return { largeur, hauteur, pas, cellules, bords, sphere: monde.sphere, contour: monde.contour };
}

export function calculerTrajet(
  grille: GrilleTrajets,
  depuis: LonLat,
  vers: LonLat,
  mode: ModeTrajet,
): TrajetCalcule | null {
  if (mode === 'aerien') return trajetAerien(grille, depuis, vers);

  const autorise = mode === 'terrestre' ? [TERRE] : mode === 'naval' ? [MER] : [TERRE, MER];
  const depart = plusProcheCellule(grille, projeterSurGrille(grille, depuis), autorise);
  const arrivee = plusProcheCellule(grille, projeterSurGrille(grille, vers), autorise);
  if (depart === null || arrivee === null) return null;

  const chemin = dijkstra(grille, depart, arrivee, autorise);
  if (chemin === null) return null;

  const points: LonLat[] = [];
  const etapes: EtapeTrajet[] = [];
  let distance = 0;
  let cout = 0;
  for (let i = 0; i < chemin.length; i++) {
    const cellule = chemin[i]!;
    points.push(deprojeterCellule(grille, cellule));
    if (i === 0) continue;
    const precedente = chemin[i - 1]!;
    const longueur = distanceEntreCellules(grille, precedente, cellule);
    const milieu: Milieu = grille.cellules[cellule] === MER ? 'mer' : 'terre';
    distance += longueur;
    cout += longueur * COUT_PAR_MILIEU[milieu === 'mer' ? 'mer' : 'terre'];
    const derniere = etapes[etapes.length - 1];
    if (derniere?.milieu === milieu) {
      etapes[etapes.length - 1] = { milieu, distanceUnites: derniere.distanceUnites + longueur };
    } else {
      etapes.push({ milieu, distanceUnites: longueur });
      if (etapes.length > 1) cout += COUT_TRANSFERT;
    }
  }

  return { mode, points: simplifier(points), distanceUnites: distance, coutUnites: cout, etapes };
}

/**
 * L'aérien ne connaît pas la grille : un trait direct, qui s'enroule par l'antiméridien
 * quand c'est plus court — la même règle que le rendu des arcs.
 */
function trajetAerien(grille: GrilleTrajets, depuis: LonLat, vers: LonLat): TrajetCalcule {
  const ecart = vers[0] - depuis[0];
  const enroule = Math.abs(ecart) > 180;
  let distance: number;
  if (!enroule) {
    distance = distanceProjetee(grille, depuis, vers);
  } else {
    const versLEst = ecart < -180;
    const ecartDeroule = versLEst ? ecart + 360 : ecart - 360;
    const longitudeBordure = versLEst ? 180 : -180;
    const fraction = (longitudeBordure - depuis[0]) / ecartDeroule;
    const latitudeTraversee = depuis[1] + fraction * (vers[1] - depuis[1]);
    distance =
      distanceProjetee(grille, depuis, [longitudeBordure, latitudeTraversee]) +
      distanceProjetee(grille, [-longitudeBordure, latitudeTraversee], vers);
  }
  return {
    mode: 'aerien',
    points: [depuis, vers],
    distanceUnites: distance,
    coutUnites: distance,
    etapes: [{ milieu: 'air', distanceUnites: distance }],
  };
}

/* ------------------------------ projection ------------------------------ */

function bordALatitude(contour: Monde['contour'], latitude: number): { xOuest: number; xEst: number; y: number } {
  const position = Math.min(contour.length - 1.001, Math.max(0, latitude + 90));
  const index = Math.floor(position);
  const fraction = position - index;
  const a = contour[index] ?? contour[0]!;
  const b = contour[index + 1] ?? a;
  return {
    xOuest: a[1] + (b[1] - a[1]) * fraction,
    xEst: a[2] + (b[2] - a[2]) * fraction,
    y: a[3] + (b[3] - a[3]) * fraction,
  };
}

function projeter(contour: Monde['contour'], sphere: Monde['sphere'], lonLat: LonLat): [number, number] {
  const centreX = (sphere.minX + sphere.maxX) / 2;
  const bord = bordALatitude(contour, lonLat[1]);
  return [centreX + (lonLat[0] / 180) * (bord.xEst - centreX), bord.y];
}

/** Latitude depuis un y projeté : le contour est monotone en y, une dichotomie suffit. */
function latitudeAY(contour: Monde['contour'], y: number): number {
  let bas = 0;
  let haut = contour.length - 1;
  while (haut - bas > 1) {
    const milieu = (bas + haut) >> 1;
    if (contour[milieu]![3] >= y) bas = milieu;
    else haut = milieu;
  }
  const a = contour[bas]!;
  const b = contour[haut]!;
  const fraction = a[3] === b[3] ? 0 : (a[3] - y) / (a[3] - b[3]);
  return a[0] + (b[0] - a[0]) * fraction;
}

function projeterSurGrille(grille: GrilleTrajets, lonLat: LonLat): number {
  const [x, y] = projeter(grille.contour, grille.sphere, lonLat);
  const colonne = Math.min(
    grille.largeur - 1,
    Math.max(0, Math.round((x - grille.sphere.minX) / grille.pas - 0.5)),
  );
  const ligne = Math.min(
    grille.hauteur - 1,
    Math.max(0, Math.round((y - grille.sphere.minY) / grille.pas - 0.5)),
  );
  return ligne * grille.largeur + colonne;
}

function deprojeterCellule(grille: GrilleTrajets, cellule: number): LonLat {
  const colonne = cellule % grille.largeur;
  const ligne = Math.floor(cellule / grille.largeur);
  const x = grille.sphere.minX + (colonne + 0.5) * grille.pas;
  const y = grille.sphere.minY + (ligne + 0.5) * grille.pas;
  const latitude = latitudeAY(grille.contour, y);
  const centreX = (grille.sphere.minX + grille.sphere.maxX) / 2;
  const demiLargeur = bordALatitude(grille.contour, latitude).xEst - centreX;
  const longitude = demiLargeur === 0 ? 0 : ((x - centreX) / demiLargeur) * 180;
  return [Math.max(-180, Math.min(180, longitude)), latitude];
}

function distanceProjetee(grille: GrilleTrajets, a: LonLat, b: LonLat): number {
  const [ax, ay] = projeter(grille.contour, grille.sphere, a);
  const [bx, by] = projeter(grille.contour, grille.sphere, b);
  return Math.hypot(bx - ax, by - ay);
}

/* ------------------------------ construction ----------------------------- */

function bordsDeSphere(monde: Monde, pas: number, hauteur: number): Array<[number, number]> {
  const bords: Array<[number, number]> = [];
  const parY = [...monde.contour].sort((a, b) => a[3] - b[3]);
  let index = 0;
  for (let ligne = 0; ligne < hauteur; ligne++) {
    const y = monde.sphere.minY + (ligne + 0.5) * pas;
    while (index < parY.length - 2 && parY[index + 1]![3] < y) index++;
    const a = parY[index]!;
    const b = parY[index + 1]!;
    const fraction = a[3] === b[3] ? 0 : Math.min(1, Math.max(0, (y - a[3]) / (b[3] - a[3])));
    bords.push([a[1] + (b[1] - a[1]) * fraction, a[2] + (b[2] - a[2]) * fraction]);
  }
  return bords;
}

/** Remplissage pair-impair par balayage : les pays sont disjoints, la parité globale suffit. */
function remplirTerre(
  monde: Monde,
  pas: number,
  largeur: number,
  hauteur: number,
  cellules: Uint8Array,
): void {
  const intersectionsParLigne: number[][] = Array.from({ length: hauteur }, () => []);
  for (const pays of monde.pays) {
    for (const anneau of pays.anneaux) {
      for (let i = 0; i < anneau.length; i++) {
        const [ax, ay] = anneau[i]!;
        const [bx, by] = anneau[(i + 1) % anneau.length]!;
        if (ay === by) continue;
        const ligneMin = Math.max(0, Math.ceil((Math.min(ay, by) - monde.sphere.minY) / pas - 0.5));
        const ligneMax = Math.min(
          hauteur - 1,
          Math.floor((Math.max(ay, by) - monde.sphere.minY) / pas - 0.5),
        );
        for (let ligne = ligneMin; ligne <= ligneMax; ligne++) {
          const y = monde.sphere.minY + (ligne + 0.5) * pas;
          if (y < Math.min(ay, by) || y >= Math.max(ay, by)) continue;
          intersectionsParLigne[ligne]!.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
      }
    }
  }
  for (let ligne = 0; ligne < hauteur; ligne++) {
    const xs = intersectionsParLigne[ligne]!.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const debut = Math.max(0, Math.ceil((xs[i]! - monde.sphere.minX) / pas - 0.5));
      const fin = Math.min(largeur - 1, Math.floor((xs[i + 1]! - monde.sphere.minX) / pas - 0.5));
      for (let colonne = debut; colonne <= fin; colonne++) {
        cellules[ligne * largeur + colonne] = TERRE;
      }
    }
  }
}

function graverPassage(
  passage: ReadonlyArray<LonLat>,
  monde: Monde,
  pas: number,
  largeur: number,
  hauteur: number,
  cellules: Uint8Array,
): void {
  for (let i = 0; i < passage.length - 1; i++) {
    const [ax, ay] = projeter(monde.contour, monde.sphere, passage[i]!);
    const [bx, by] = projeter(monde.contour, monde.sphere, passage[i + 1]!);
    const etapes = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (pas * 0.5)));
    for (let e = 0; e <= etapes; e++) {
      const x = ax + ((bx - ax) * e) / etapes;
      const y = ay + ((by - ay) * e) / etapes;
      const colonne = Math.round((x - monde.sphere.minX) / pas - 0.5);
      const ligne = Math.round((y - monde.sphere.minY) / pas - 0.5);
      for (let dl = -1; dl <= 1; dl++) {
        for (let dc = -1; dc <= 1; dc++) {
          const l = ligne + dl;
          const c = colonne + dc;
          if (l >= 0 && c >= 0 && l < hauteur && c < largeur) cellules[l * largeur + c] = MER;
        }
      }
    }
  }
}

/* -------------------------------- parcours ------------------------------- */

function plusProcheCellule(
  grille: GrilleTrajets,
  origine: number,
  autorise: ReadonlyArray<number>,
  rayonMax = 24,
): number | null {
  const colonne0 = origine % grille.largeur;
  const ligne0 = Math.floor(origine / grille.largeur);
  for (let rayon = 0; rayon <= rayonMax; rayon++) {
    let meilleure: number | null = null;
    let meilleureDistance = Number.POSITIVE_INFINITY;
    for (let dl = -rayon; dl <= rayon; dl++) {
      for (let dc = -rayon; dc <= rayon; dc++) {
        if (Math.max(Math.abs(dl), Math.abs(dc)) !== rayon) continue;
        const ligne = ligne0 + dl;
        const colonne = colonne0 + dc;
        if (ligne < 0 || colonne < 0 || ligne >= grille.hauteur || colonne >= grille.largeur) continue;
        const cellule = ligne * grille.largeur + colonne;
        if (!autorise.includes(grille.cellules[cellule]!)) continue;
        const distance = dl * dl + dc * dc;
        if (distance < meilleureDistance) {
          meilleureDistance = distance;
          meilleure = cellule;
        }
      }
    }
    if (meilleure !== null) return meilleure;
  }
  return null;
}

/**
 * L'enroulement est-ouest fait partie de l'adjacence : la première et la dernière cellule
 * valides d'une même ligne sont voisines — le Pacifique est une autoroute ici aussi, sinon
 * le graphe contredirait les arcs qui s'enroulent déjà à l'écran.
 */
function voisins(grille: GrilleTrajets, cellule: number, sortie: number[]): number {
  const colonne = cellule % grille.largeur;
  const ligne = Math.floor(cellule / grille.largeur);
  let nombre = 0;
  for (let dl = -1; dl <= 1; dl++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dl === 0 && dc === 0) continue;
      const l = ligne + dl;
      const c = colonne + dc;
      if (l < 0 || c < 0 || l >= grille.hauteur || c >= grille.largeur) continue;
      const candidate = l * grille.largeur + c;
      if (grille.cellules[candidate] !== VIDE) sortie[nombre++] = candidate;
    }
  }
  const premier = grille.bords[ligne * 2]!;
  const dernier = grille.bords[ligne * 2 + 1]!;
  if (premier !== dernier && (cellule === premier || cellule === dernier)) {
    sortie[nombre++] = cellule === premier ? dernier : premier;
  }
  return nombre;
}

function distanceEntreCellules(grille: GrilleTrajets, a: number, b: number): number {
  const ecartColonnes = Math.abs((a % grille.largeur) - (b % grille.largeur));
  const ecartLignes = Math.abs(Math.floor(a / grille.largeur) - Math.floor(b / grille.largeur));
  if (ecartColonnes > 1) return grille.pas;
  return Math.hypot(ecartColonnes, ecartLignes) * grille.pas;
}

function dijkstra(
  grille: GrilleTrajets,
  depart: number,
  arrivee: number,
  autorise: ReadonlyArray<number>,
): number[] | null {
  const couts = new Float64Array(grille.cellules.length).fill(Number.POSITIVE_INFINITY);
  const precedents = new Int32Array(grille.cellules.length).fill(-1);
  const tas = new TasBinaire();
  couts[depart] = 0;
  tas.inserer(depart, 0);
  const tampon = new Array<number>(9);

  while (tas.taille > 0) {
    const { cellule, cout } = tas.extraireMin();
    if (cout > couts[cellule]!) continue;
    if (cellule === arrivee) break;

    const nombre = voisins(grille, cellule, tampon);
    for (let i = 0; i < nombre; i++) {
      const voisine = tampon[i]!;
      const type = grille.cellules[voisine]!;
      if (!autorise.includes(type)) continue;
      const longueur = distanceEntreCellules(grille, cellule, voisine);
      const multiplicateur = type === MER ? COUT_PAR_MILIEU.mer : COUT_PAR_MILIEU.terre;
      const transfert = grille.cellules[cellule] !== type ? COUT_TRANSFERT : 0;
      const candidat = cout + longueur * multiplicateur + transfert;
      if (candidat < couts[voisine]!) {
        couts[voisine] = candidat;
        precedents[voisine] = cellule;
        tas.inserer(voisine, candidat);
      }
    }
  }

  if (!Number.isFinite(couts[arrivee]!)) return null;
  const chemin: number[] = [];
  for (let cellule = arrivee; cellule !== -1; cellule = precedents[cellule]!) chemin.push(cellule);
  return chemin.reverse();
}

class TasBinaire {
  private cellules: number[] = [];
  private couts: number[] = [];

  get taille(): number {
    return this.cellules.length;
  }

  inserer(cellule: number, cout: number): void {
    this.cellules.push(cellule);
    this.couts.push(cout);
    let index = this.cellules.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.couts[parent]! <= this.couts[index]!) break;
      this.echanger(index, parent);
      index = parent;
    }
  }

  extraireMin(): { cellule: number; cout: number } {
    const resultat = { cellule: this.cellules[0]!, cout: this.couts[0]! };
    const dernier = this.cellules.length - 1;
    this.echanger(0, dernier);
    this.cellules.pop();
    this.couts.pop();
    let index = 0;
    for (;;) {
      const gauche = index * 2 + 1;
      const droite = gauche + 1;
      let plusPetit = index;
      if (gauche < this.couts.length && this.couts[gauche]! < this.couts[plusPetit]!) plusPetit = gauche;
      if (droite < this.couts.length && this.couts[droite]! < this.couts[plusPetit]!) plusPetit = droite;
      if (plusPetit === index) break;
      this.echanger(index, plusPetit);
      index = plusPetit;
    }
    return resultat;
  }

  private echanger(a: number, b: number): void {
    [this.cellules[a], this.cellules[b]] = [this.cellules[b]!, this.cellules[a]!];
    [this.couts[a], this.couts[b]] = [this.couts[b]!, this.couts[a]!];
  }
}

/** Retire les points alignés : la polyligne garde les virages, pas l'escalier du raster. */
function simplifier(points: ReadonlyArray<LonLat>): ReadonlyArray<LonLat> {
  if (points.length <= 2) return points;
  const garde: LonLat[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const [ax, ay] = garde[garde.length - 1]!;
    const [bx, by] = points[i]!;
    const [cx, cy] = points[i + 1]!;
    const croix = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(croix) > 1e-6) garde.push(points[i]!);
  }
  garde.push(points[points.length - 1]!);
  return garde;
}
