import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DonneesRegions, RegionAffichee } from '@/domaine/monde';
import type { Courbure } from './courbure';
import { PALETTE } from './palette';
import { EPAISSEUR_PAYS, type RepereMonde } from './repere';

export const DISTANCE_REGIONS_PLEINES = 30;
export const DISTANCE_REGIONS_ABSENTES = 65;
/**
 * Nettement sous l'opacité des frontières de pays (0.62 au repos, renforcées au zoom) :
 * WebGL trace tout à un pixel, la hiérarchie entre pays et région passe donc par l'encre,
 * pas par l'épaisseur.
 */
const OPACITE_PLEINE = 0.3;

type RegionPreparee = {
  readonly region: RegionAffichee;
  readonly boite: readonly [minX: number, minY: number, maxX: number, maxY: number];
  readonly aire: number;
};

/**
 * Les frontières admin-1 (régions, états, départements) de `regions.json` — uniquement les
 * tronçons intérieurs, les côtes et frontières de pays étant déjà tracées. La couche n'existe
 * qu'en vue rapprochée : au large elle fond avant de devenir du bruit. Une fois visible, elle
 * répond au survol — point dans région, la plus petite d'abord (une enclave gagne sur son
 * enveloppe).
 */
export class CoucheRegions {
  readonly lignes: LineSegments;
  readonly surbrillance: Mesh;
  private readonly materiauLignes: LineBasicMaterial;
  private readonly materiauSurbrillance: MeshBasicMaterial;
  private preparees: RegionPreparee[] = [];
  private regionSurvolee: RegionAffichee | null = null;
  private part = 0;

  constructor(
    private readonly repere: RepereMonde,
    private readonly courbure: Courbure,
  ) {
    this.materiauLignes = new LineBasicMaterial({
      color: PALETTE.frontiere,
      transparent: true,
      opacity: 0,
    });
    this.lignes = new LineSegments(new BufferGeometry(), this.materiauLignes);
    this.lignes.visible = false;

    this.materiauSurbrillance = new MeshBasicMaterial({
      color: PALETTE.papier,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    this.surbrillance = new Mesh(new BufferGeometry(), this.materiauSurbrillance);
    this.surbrillance.visible = false;
  }

  afficher(donnees: DonneesRegions): void {
    const points: number[] = [];
    for (const ligne of donnees.lignes) {
      for (let i = 0; i < ligne.length - 1; i++) {
        const [ax, ay] = ligne[i]!;
        const [bx, by] = ligne[i + 1]!;
        points.push(
          ax - this.repere.centreX, EPAISSEUR_PAYS + 0.02, ay - this.repere.centreY,
          bx - this.repere.centreX, EPAISSEUR_PAYS + 0.02, by - this.repere.centreY,
        );
      }
    }
    this.lignes.geometry.dispose();
    const geometrie = new BufferGeometry();
    geometrie.setAttribute('position', new Float32BufferAttribute(points, 3));
    this.lignes.geometry = this.courbure.enregistrer(geometrie);

    this.preparees = donnees.regions.map((region) => {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let aire = 0;
      for (const anneau of region.anneaux) {
        for (let i = 0; i < anneau.length; i++) {
          const [x, y] = anneau[i]!;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          const [xSuivant, ySuivant] = anneau[(i + 1) % anneau.length]!;
          aire += x * ySuivant - xSuivant * y;
        }
      }
      return { region, boite: [minX, minY, maxX, maxY], aire: Math.abs(aire / 2) };
    });
  }

  get estActive(): boolean {
    return this.part > 0.01 && this.preparees.length > 0;
  }

  /** Le point est en coordonnées projetées (celles de `monde.json`), pas en coordonnées monde. */
  survoler(projeteX: number, projeteY: number): string | null {
    let retenue: RegionPreparee | null = null;
    for (const candidate of this.preparees) {
      const [minX, minY, maxX, maxY] = candidate.boite;
      if (projeteX < minX || projeteX > maxX || projeteY < minY || projeteY > maxY) continue;
      if (retenue !== null && candidate.aire >= retenue.aire) continue;
      if (contient(candidate.region, projeteX, projeteY)) retenue = candidate;
    }
    this.changerSurbrillance(retenue?.region ?? null);
    return retenue?.region.nom ?? null;
  }

  effacerSurvol(): void {
    this.changerSurbrillance(null);
  }

  /** Fondu piloté par la distance caméra→cible ; invisible, la couche ne coûte rien. */
  animer(distanceCamera: number): void {
    this.part = Math.min(
      1,
      Math.max(
        0,
        (DISTANCE_REGIONS_ABSENTES - distanceCamera) /
          (DISTANCE_REGIONS_ABSENTES - DISTANCE_REGIONS_PLEINES),
      ),
    );
    this.materiauLignes.opacity = this.part * OPACITE_PLEINE;
    this.lignes.visible = this.part > 0.01;
    if (!this.estActive) this.changerSurbrillance(null);
    else this.surbrillance.visible = this.regionSurvolee !== null;
  }

  detruire(): void {
    this.lignes.geometry.dispose();
    this.surbrillance.geometry.dispose();
    this.materiauLignes.dispose();
    this.materiauSurbrillance.dispose();
  }

  private changerSurbrillance(region: RegionAffichee | null): void {
    if (region === this.regionSurvolee) return;
    this.regionSurvolee = region;
    this.surbrillance.geometry.dispose();
    if (region === null) {
      this.surbrillance.geometry = new BufferGeometry();
      this.surbrillance.visible = false;
      return;
    }

    const geometries = region.anneaux.map((anneau) => {
      const forme = new Shape();
      anneau.forEach(([x, y], index) => {
        const px = x - this.repere.centreX;
        const py = -(y - this.repere.centreY);
        if (index === 0) forme.moveTo(px, py);
        else forme.lineTo(px, py);
      });
      return new ShapeGeometry(forme);
    });
    const geometrie = geometries.length > 1 ? mergeGeometries(geometries, false)! : geometries[0]!;
    geometrie.rotateX(-Math.PI / 2);

    const positions = geometrie.attributes.position!;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(
        i,
        EPAISSEUR_PAYS + 0.015 + this.repere.chute(positions.getX(i), positions.getZ(i)),
      );
    }
    positions.needsUpdate = true;

    this.surbrillance.geometry = geometrie;
    this.surbrillance.visible = true;
  }
}

function contient(region: RegionAffichee, x: number, y: number): boolean {
  let interieur = false;
  for (const anneau of region.anneaux) {
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      const [xi, yi] = anneau[i]!;
      const [xj, yj] = anneau[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        interieur = !interieur;
      }
    }
  }
  return interieur;
}
