import { Vector3 } from 'three';
import type { LonLat } from '@/domaine/geo';
import type { EchantillonContour, Monde } from '@/domaine/monde';

export const EPAISSEUR_PAYS = 0.96;
export const NIVEAU_MER = -0.25;
export const HAUTEUR_SOCLE = 7;
const RAYON_COURBURE = 900;

/**
 * Le repère du monde et la courbure de faux horizon. La courbure est appliquée aux
 * positions côté CPU, jamais dans un shader : sinon le raycasting continuerait de
 * viser une géométrie plate et le clic tomberait à côté sur les bords.
 */
export class RepereMonde {
  readonly centreX: number;
  readonly centreY: number;
  readonly largeur: number;
  readonly hauteur: number;
  private readonly contour: ReadonlyArray<EchantillonContour>;
  private intensiteCourbure = 0;

  constructor(monde: Monde) {
    this.centreX = (monde.sphere.minX + monde.sphere.maxX) / 2;
    this.centreY = (monde.sphere.minY + monde.sphere.maxY) / 2;
    this.largeur = monde.sphere.maxX - monde.sphere.minX;
    this.hauteur = monde.sphere.maxY - monde.sphere.minY;
    this.contour = monde.contour;
  }

  get courbure(): number {
    return this.intensiteCourbure;
  }

  set courbure(valeur: number) {
    this.intensiteCourbure = valeur;
  }

  chute(x: number, z: number): number {
    return (-this.intensiteCourbure * (x * x + z * z)) / (2 * RAYON_COURBURE);
  }

  versMonde(projeteX: number, projeteY: number, hauteur = EPAISSEUR_PAYS): Vector3 {
    const x = projeteX - this.centreX;
    const z = projeteY - this.centreY;
    return new Vector3(x, hauteur + this.chute(x, z), z);
  }

  /**
   * Le monde n'est pas une équirectangulaire : les bords se resserrent aux pôles, donc une
   * longitude ne se convertit qu'à la latitude où on la lit.
   */
  projeterLonLat(lonLat: LonLat, hauteur = EPAISSEUR_PAYS): Vector3 {
    const bord = this.bordALatitude(lonLat[1]);
    const x = this.centreX + (lonLat[0] / 180) * (bord.xEst - this.centreX);
    return this.versMonde(x, bord.y, hauteur);
  }

  bordALatitude(latitude: number): { xOuest: number; xEst: number; y: number } {
    const position = Math.min(179.999, Math.max(0, latitude + 90));
    const index = Math.floor(position);
    const fraction = position - index;
    const a = this.contour[index] ?? this.contour[0]!;
    const b = this.contour[index + 1] ?? a;
    return {
      xOuest: a[1] + (b[1] - a[1]) * fraction,
      xEst: a[2] + (b[2] - a[2]) * fraction,
      y: a[3] + (b[3] - a[3]) * fraction,
    };
  }
}
