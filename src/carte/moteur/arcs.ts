import {
  BufferGeometry,
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  QuadraticBezierCurve3,
  Vector3,
} from 'three';
import type { LonLat } from '@/domaine/geo';
import type { ArcAffiche } from '@/domaine/vue-joueur';
import { COULEURS_ARC } from './palette';
import { EPAISSEUR_PAYS, type RepereMonde } from './repere';

const SEGMENTS = 64;
const HAUTEUR_ARC = EPAISSEUR_PAYS + 0.5;

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

function projeter(lonLat: LonLat, repere: RepereMonde): Vector3 {
  const x = repere.centreX + (lonLat[0] / 180) * (repere.bordALatitude(lonLat[1]).xEst - repere.centreX);
  return repere.versMonde(x, repere.bordALatitude(lonLat[1]).y, HAUTEUR_ARC);
}

function courbeEntre(depart: Vector3, arrivee: Vector3): QuadraticBezierCurve3 {
  const elevation = Math.min(depart.distanceTo(arrivee) * 0.38, 150);
  const milieu = depart.clone().lerp(arrivee, 0.5);
  milieu.y += elevation;
  return new QuadraticBezierCurve3(depart, milieu, arrivee);
}

export class CoucheArcs {
  readonly groupe = new Group();
  private readonly tangente = new Vector3();
  private rendus: Array<{ arc: ArcAffiche; troncons: Troncon[]; traces: Line[]; progression: Line[]; tete: Mesh }> = [];

  constructor(private readonly repere: RepereMonde) {}

  afficher(arcs: ReadonlyArray<ArcAffiche>): void {
    this.vider();
    for (const arc of arcs) {
      const troncons = tronconner(arc.depuis, arc.vers, this.repere);
      const couleurs = COULEURS_ARC[arc.etat];
      const perime = arc.etat === 'dernierePositionConnue';

      const traces = troncons.map(({ courbe }) => {
        const ligne = new Line(
          new BufferGeometry().setFromPoints(courbe.getPoints(SEGMENTS)),
          new LineBasicMaterial({ color: couleurs.trace, transparent: true, opacity: perime ? 0.3 : 0.22 }),
        );
        this.groupe.add(ligne);
        return ligne;
      });

      const progression = troncons.map(({ courbe }) => {
        const ligne = new Line(
          new BufferGeometry().setFromPoints(courbe.getPoints(SEGMENTS)),
          new LineBasicMaterial({ color: couleurs.progression, transparent: true, opacity: perime ? 0.45 : 1 }),
        );
        ligne.geometry.setDrawRange(0, 0);
        this.groupe.add(ligne);
        return ligne;
      });

      const tete = new Mesh(
        new ConeGeometry(2.6, 8, 6),
        new MeshStandardMaterial({ color: couleurs.progression, roughness: 0.9 }),
      );
      tete.visible = !perime;
      this.groupe.add(tete);

      this.rendus.push({ arc, troncons, traces, progression, tete });
    }
    this.animer();
  }

  animer(): void {
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
      courbe.getPointAt(Math.min(1, Math.max(0, local)), rendu.tete.position);
      courbe.getPointAt(Math.min(1, Math.max(0, local) + 0.01), this.tangente);
      rendu.tete.lookAt(this.tangente);
      rendu.tete.rotateX(Math.PI / 2);
    }
  }

  reconstruire(): void {
    const arcs = this.rendus.map((rendu) => rendu.arc);
    this.afficher(arcs);
  }

  private vider(): void {
    for (const rendu of this.rendus) {
      for (const ligne of [...rendu.traces, ...rendu.progression]) {
        this.groupe.remove(ligne);
        ligne.geometry.dispose();
      }
      this.groupe.remove(rendu.tete);
      rendu.tete.geometry.dispose();
    }
    this.rendus = [];
  }
}
