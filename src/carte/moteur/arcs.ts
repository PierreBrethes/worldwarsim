import {
  BufferGeometry,
  Group,
  Line,
  LineBasicMaterial,
  QuadraticBezierCurve3,
  Quaternion,
  Vector3,
  type Camera,
  type Raycaster,
} from 'three';
import { enHeuresMinutes } from '@/domaine/duree';
import type { LonLat } from '@/domaine/geo';
import type { ArcAffiche } from '@/domaine/vue-joueur';
import { minutesCourantes } from '@/domaine/vue-joueur';
import { spriteDeMouvement } from '@/emblemes/unites/manifeste';
import { EtiquetteTexte } from './billboard';
import { COULEURS_ARC } from './palette';
import { EPAISSEUR_PAYS, type RepereMonde } from './repere';
import { TeteMouvement } from './tete-mouvement';

const SEGMENTS = 64;
const HAUTEUR_ARC = EPAISSEUR_PAYS + 0.5;
/** Parts de la distance caméra : la tête et son compte à rebours gardent leur cote à l'écran. */
const PART_ETIQUETTE = 0.022;
const PART_TETE_LIBRE = 0.04;

type Troncon = { courbe: QuadraticBezierCurve3; part: number };

/**
 * Le monde est un cylindre : la longitude s'enroule, pas la latitude. Un trajet dont
 * l'écart de longitude dépasse 180° sort d'un côté de la bordure et rentre de
 * l'autre — la Nouvelle-Zélande vers l'Amérique passe par le Pacifique.
 */
function tronconner(depuis: LonLat, vers: LonLat, repere: RepereMonde): Troncon[] {
  const ecart = vers[0] - depuis[0];
  if (Math.abs(ecart) <= 180) {
    return [{ courbe: courbeEntre(projeter(depuis, repere), projeter(vers, repere)), part: 1 }];
  }

  const versLEst = ecart < -180;
  const ecartDeroule = versLEst ? ecart + 360 : ecart - 360;
  const longitudeBordure = versLEst ? 180 : -180;
  const fraction = (longitudeBordure - depuis[0]) / ecartDeroule;
  const latitudeTraversee = depuis[1] + fraction * (vers[1] - depuis[1]);
  const bord = repere.bordALatitude(latitudeTraversee);

  const sortie = repere.versMonde(versLEst ? bord.xEst : bord.xOuest, bord.y, HAUTEUR_ARC);
  const entree = repere.versMonde(versLEst ? bord.xOuest : bord.xEst, bord.y, HAUTEUR_ARC);
  const premier = courbeEntre(projeter(depuis, repere), sortie);
  const second = courbeEntre(entree, projeter(vers, repere));
  const longueurs = [premier.getLength(), second.getLength()];
  const total = longueurs[0]! + longueurs[1]! || 1;
  return [
    { courbe: premier, part: longueurs[0]! / total },
    { courbe: second, part: longueurs[1]! / total },
  ];
}

const projeter = (lonLat: LonLat, repere: RepereMonde): Vector3 =>
  repere.projeterLonLat(lonLat, HAUTEUR_ARC);

function courbeEntre(depart: Vector3, arrivee: Vector3): QuadraticBezierCurve3 {
  const elevation = Math.min(depart.distanceTo(arrivee) * 0.38, 150);
  const milieu = depart.clone().lerp(arrivee, 0.5);
  milieu.y += elevation;
  return new QuadraticBezierCurve3(depart, milieu, arrivee);
}

type LigneArc = Line<BufferGeometry, LineBasicMaterial>;

type RenduArc = {
  arc: ArcAffiche;
  troncons: Troncon[];
  traces: LigneArc[];
  progression: LigneArc[];
  tete: TeteMouvement;
  etiquette: EtiquetteTexte | null;
  opaciteTrace: number;
  opaciteProgression: number;
};

/**
 * L'accent est une affaire d'intensité, jamais de couleur : la couleur d'un arc dit à qui il
 * appartient, la changer au survol dirait autre chose. L'arc désigné monte, les autres
 * s'effacent — c'est l'écart qui se lit, pas la valeur absolue.
 */
const ACCENT_DESIGNE = 2.4;
const ACCENT_AUTRES = 0.35;
/** Rayon de saisie d'un arc au pointeur, en unités de plateau : un trait fait un pixel. */
export const SEUIL_SURVOL_ARC = 4;

export class CoucheArcs {
  readonly groupe = new Group();
  private readonly tangente = new Vector3();
  private readonly pointTete = new Vector3();
  private readonly pointEtiquette = new Vector3();
  private readonly positionCamera = new Vector3();
  private readonly orientationCamera = new Quaternion();
  private nationJoueur: string | null = null;
  private chargeeA = Date.now();
  private detaille = false;
  private rendus: RenduArc[] = [];
  private cibles: LigneArc[] = [];
  private accentue: string | null = null;

  constructor(private readonly repere: RepereMonde) {}

  definirNationJoueur(nation: string | null): void {
    if (nation === this.nationJoueur) return;
    this.nationJoueur = nation;
    this.reconstruire();
  }

  afficher(arcs: ReadonlyArray<ArcAffiche>, chargeeA?: number): void {
    if (chargeeA !== undefined) this.chargeeA = chargeeA;
    this.vider();
    for (const arc of arcs) {
      const troncons = tronconner(arc.depuis, arc.vers, this.repere);
      const couleurs = COULEURS_ARC[arc.etat];
      const perime = arc.etat === 'dernierePositionConnue';

      const opaciteTrace = perime ? 0.3 : 0.22;
      const opaciteProgression = perime ? 0.45 : 1;

      const traces = troncons.map(({ courbe }) => {
        const ligne: LigneArc = new Line(
          new BufferGeometry().setFromPoints(courbe.getPoints(SEGMENTS)),
          new LineBasicMaterial({ color: couleurs.trace, transparent: true, opacity: opaciteTrace }),
        );
        ligne.userData.arc = arc.id;
        this.groupe.add(ligne);
        this.cibles.push(ligne);
        return ligne;
      });

      const progression = troncons.map(({ courbe }) => {
        const ligne: LigneArc = new Line(
          new BufferGeometry().setFromPoints(courbe.getPoints(SEGMENTS)),
          new LineBasicMaterial({
            color: couleurs.progression,
            transparent: true,
            opacity: opaciteProgression,
          }),
        );
        ligne.geometry.setDrawRange(0, 0);
        this.groupe.add(ligne);
        return ligne;
      });

      const tete = new TeteMouvement(spriteDeMouvement(arc, this.nationJoueur), couleurs.progression);
      tete.visible = !perime;
      this.groupe.add(tete.objet);

      // Seul un arc `mien` porte son compte à rebours : l'horaire exact d'un mouvement
      // adverse est précisément ce que la fiche 4.2 interdit d'afficher sur la carte.
      const etiquette = arc.etat === 'mien' ? new EtiquetteTexte(1) : null;
      if (etiquette) this.groupe.add(etiquette.objet);

      this.rendus.push({
        arc,
        troncons,
        traces,
        progression,
        tete,
        etiquette,
        opaciteTrace,
        opaciteProgression,
      });
    }
    this.appliquerAccent();
    this.animer();
  }

  /**
   * Le survol vient de la frise ou du pointeur, mais l'accent ne remonte jamais à React :
   * un identifiant entre, des opacités changent, la boucle continue à soixante images.
   */
  accentuer(id: string | null): void {
    if (id === this.accentue) return;
    this.accentue = id;
    this.appliquerAccent();
  }

  /** L'identifiant du mouvement sous le pointeur, pour que la frise surligne sa fiche. */
  survoler(rayon: Raycaster): string | null {
    const impact = rayon.intersectObjects(this.cibles, false)[0];
    return (impact?.object.userData.arc as string | undefined) ?? null;
  }

  animer(camera?: Camera, detaille?: boolean): void {
    if (camera) {
      this.positionCamera.copy(camera.position);
      this.orientationCamera.copy(camera.quaternion);
    }
    if (detaille !== undefined) this.detaille = detaille;
    const maintenant = Date.now();
    for (const rendu of this.rendus) {
      const avancement = Math.min(1, Math.max(0, rendu.arc.avancement));
      const seuil = rendu.troncons[0]!.part;
      const index = rendu.troncons.length > 1 && avancement > seuil ? 1 : 0;
      const local =
        rendu.troncons.length === 1
          ? avancement
          : index === 0
            ? avancement / seuil
            : (avancement - seuil) / (1 - seuil);

      rendu.progression[0]!.geometry.setDrawRange(
        0,
        index === 0 ? Math.max(2, Math.floor(SEGMENTS * local) + 1) : SEGMENTS + 1,
      );
      rendu.progression[1]?.geometry.setDrawRange(
        0,
        index === 1 ? Math.max(2, Math.floor(SEGMENTS * local) + 1) : 0,
      );

      const courbe = rendu.troncons[index]!.courbe;
      courbe.getPointAt(Math.min(1, Math.max(0, local)), this.pointTete);
      courbe.getPointAt(Math.min(1, Math.max(0, local) + 0.01), this.tangente);
      rendu.tete.placer(this.pointTete, this.tangente);
      rendu.tete.orienter(this.positionCamera);

      if (rendu.etiquette && rendu.arc.etat === 'mien') {
        rendu.etiquette.visible = this.detaille;
        if (this.detaille) {
          const elevation = this.pointTete.distanceTo(this.positionCamera) * PART_TETE_LIBRE;
          this.pointEtiquette.copy(this.pointTete).setY(this.pointTete.y + elevation);
          rendu.etiquette.definirTexte(
            enHeuresMinutes(minutesCourantes(rendu.arc.minutesRestantes, this.chargeeA, maintenant)),
          );
          rendu.etiquette.placer(this.pointEtiquette);
          rendu.etiquette.orienter(
            this.orientationCamera,
            this.pointEtiquette.distanceTo(this.positionCamera) * PART_ETIQUETTE,
          );
        }
      }
    }
  }

  reconstruire(): void {
    const arcs = this.rendus.map((rendu) => rendu.arc);
    this.afficher(arcs);
  }

  private appliquerAccent(): void {
    for (const rendu of this.rendus) {
      const facteur =
        this.accentue === null ? 1 : rendu.arc.id === this.accentue ? ACCENT_DESIGNE : ACCENT_AUTRES;
      for (const ligne of rendu.traces) {
        ligne.material.opacity = Math.min(1, rendu.opaciteTrace * facteur);
      }
      for (const ligne of rendu.progression) {
        ligne.material.opacity = Math.min(1, rendu.opaciteProgression * facteur);
      }
    }
  }

  private vider(): void {
    for (const rendu of this.rendus) {
      for (const ligne of [...rendu.traces, ...rendu.progression]) {
        this.groupe.remove(ligne);
        ligne.geometry.dispose();
      }
      rendu.tete.detruire();
      rendu.etiquette?.detruire();
    }
    this.rendus = [];
    this.cibles = [];
  }
}
