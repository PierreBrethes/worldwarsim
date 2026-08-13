import { Vector3, type PerspectiveCamera } from 'three';
import type { AncreEtiquette } from '@/domaine/etiquettes';
import { EPAISSEUR_PAYS, type RepereMonde } from './repere';

/**
 * Au-delà, une étiquette retombe au glyphe seul. Un seuil unique et nommé : c'est le seul
 * réglage du niveau de détail, et il se règle sans lire le reste du fichier.
 */
export const DISTANCE_ETIQUETTE_DEPLOYEE = 110;

/**
 * L'ancre est posée sur la croûte, pas au-dessus : l'appel doit partir du sol qu'il désigne.
 * Le cheveu qui reste évite que le test d'horizon ne s'occulte lui-même au ras de la courbure.
 */
const ELEVATION_ANCRE = EPAISSEUR_PAYS + 0.01;

/**
 * La courbure ne cache pas beaucoup de plateau, mais elle en cache : six points suffisent à
 * savoir si le segment œil → ancre passe sous la croûte, et le test s'évapore quand le
 * plateau est plat, ce qui est le réglage par défaut.
 */
const ECHANTILLONS_HORIZON = 6;

export type NiveauDetail = 'glyphe' | 'deployee';

/**
 * Les projections sont réécrites en place à chaque image plutôt que reconstruites : cette
 * boucle tourne à soixante images par seconde et n'a le droit de rien allouer.
 */
export type ProjectionEtiquette = {
  id: string;
  visible: boolean;
  x: number;
  y: number;
  lod: NiveauDetail;
};

export type AncreNommee = { readonly id: string; readonly ancre: AncreEtiquette };

/**
 * Le registre d'ancres du moteur. Il ne connaît ni DOM ni React : il dit où chaque étiquette
 * tombe à l'écran, si elle y tombe, et à quel niveau de détail. L'interface fait le reste.
 */
export class CoucheEtiquettes {
  private readonly fixes = new Map<string, Vector3>();
  private readonly projections: ProjectionEtiquette[] = [];
  private readonly point = new Vector3();
  private readonly normalise = new Vector3();
  private ancres: ReadonlyArray<AncreNommee> = [];

  constructor(private readonly repere: RepereMonde) {}

  definirAncres(ancres: ReadonlyArray<AncreNommee>): void {
    this.ancres = ancres;
    this.fixes.clear();
    this.projections.length = 0;
    for (const { id, ancre } of ancres) {
      if (ancre.genre === 'sol') {
        this.fixes.set(id, this.repere.projeterLonLat(ancre.lonLat, ELEVATION_ANCRE));
      }
      this.projections.push({ id, visible: false, x: 0, y: 0, lod: 'glyphe' });
    }
  }

  /** La courbure a changé : le sol s'est déplacé sous les ancres fixes, il faut les reposer. */
  reconstruire(): void {
    this.definirAncres(this.ancres);
  }

  projeter(
    camera: PerspectiveCamera,
    largeur: number,
    hauteur: number,
    positionsMobiles: ReadonlyMap<string, Vector3>,
  ): ReadonlyArray<ProjectionEtiquette> {
    for (const projection of this.projections) {
      const position = this.fixes.get(projection.id) ?? positionsMobiles.get(projection.id);
      if (position === undefined) {
        projection.visible = false;
        continue;
      }

      const distance = position.distanceTo(camera.position);
      this.normalise.copy(position).project(camera);
      const dansLeChamp =
        this.normalise.z < 1 &&
        Math.abs(this.normalise.x) < 1.08 &&
        Math.abs(this.normalise.y) < 1.08;

      projection.visible = dansLeChamp && !this.occultee(position, camera.position);
      projection.x = (this.normalise.x * 0.5 + 0.5) * largeur;
      projection.y = (-this.normalise.y * 0.5 + 0.5) * hauteur;
      projection.lod = distance < DISTANCE_ETIQUETTE_DEPLOYEE ? 'deployee' : 'glyphe';
    }
    return this.projections;
  }

  /** Le plateau se bombe : une ancre passée derrière l'horizon ne se rattrape pas au bord. */
  private occultee(position: Vector3, oeil: Vector3): boolean {
    if (this.repere.courbure === 0) return false;
    for (let pas = 1; pas < ECHANTILLONS_HORIZON; pas++) {
      const part = pas / ECHANTILLONS_HORIZON;
      this.point.copy(oeil).lerp(position, part);
      if (this.repere.chute(this.point.x, this.point.z) + EPAISSEUR_PAYS > this.point.y) return true;
    }
    return false;
  }
}
