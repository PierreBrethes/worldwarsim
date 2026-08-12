import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { typeDeRegion, type DonneesRegions, type RegionAffichee, type TypeRegion } from '@/domaine/monde';
import type { Courbure } from './courbure';
import { PALETTE } from './palette';
import { EPAISSEUR_PAYS, type RepereMonde } from './repere';
import { creerAccessoire, libererTerrain, TEINTES_TYPE } from './terrain';

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
  readonly accessoires = new Group();
  private readonly materiauLignes: LineBasicMaterial;
  private readonly materiauSurbrillance: MeshBasicMaterial;
  private preparees: RegionPreparee[] = [];
  private regionSurvolee: RegionAffichee | null = null;
  private naissance = 0;
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
    this.changerSurbrillance(retenue);
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
    this.pousserAccessoires();
  }

  detruire(): void {
    this.lignes.geometry.dispose();
    this.surbrillance.geometry.dispose();
    this.materiauLignes.dispose();
    this.materiauSurbrillance.dispose();
    libererTerrain();
  }

  private changerSurbrillance(preparee: RegionPreparee | null): void {
    const region = preparee?.region ?? null;
    if (region === this.regionSurvolee) return;
    this.regionSurvolee = region;
    this.surbrillance.geometry.dispose();
    this.accessoires.clear();
    if (preparee === null || region === null) {
      this.surbrillance.geometry = new BufferGeometry();
      this.surbrillance.visible = false;
      return;
    }

    const type = typeDeRegion(region.nom);
    this.materiauSurbrillance.color.set(TEINTES_TYPE[type]);
    this.semerAccessoires(preparee, type);

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

  /**
   * Sème les accessoires 3D du type — points intérieurs par rejet dans la boîte,
   * graine tirée du nom pour retrouver la même clairière à chaque survol. La taille
   * et le nombre suivent l'aire : une Oise se lit de près, une Amazonie de loin.
   */
  private semerAccessoires(preparee: RegionPreparee, type: TypeRegion): void {
    const [minX, minY, maxX, maxY] = preparee.boite;
    const alea = alealoire(graine(preparee.region.nom));
    const nombre = Math.min(24, Math.max(8, Math.round(Math.sqrt(preparee.aire) * 8)));
    const taille = Math.min(0.9, Math.max(0.28, 0.18 + Math.sqrt(preparee.aire) * 0.06));
    let poses = 0;
    let essais = 0;
    while (poses < nombre && essais < nombre * 80) {
      essais++;
      const x = minX + alea() * (maxX - minX);
      const y = minY + alea() * (maxY - minY);
      if (!contient(preparee.region, x, y)) continue;
      const accessoire = creerAccessoire(type);
      accessoire.position.copy(this.repere.versMonde(x, y, EPAISSEUR_PAYS + 0.01));
      accessoire.rotation.y = alea() * Math.PI * 2;
      accessoire.scale.setScalar(0.0001);
      accessoire.userData.taille = taille * (0.7 + alea() * 0.6);
      accessoire.userData.retard = poses * 35 + alea() * 50;
      this.accessoires.add(accessoire);
      poses++;
    }
    this.naissance = performance.now();
  }

  /** La pousse : échelle 0 → taille avec un léger dépassement, décalée accessoire par accessoire. */
  private pousserAccessoires(): void {
    if (this.accessoires.children.length === 0) return;
    const age = performance.now() - this.naissance;
    for (const enfant of this.accessoires.children) {
      const t = Math.min(1, Math.max(0, (age - (enfant.userData.retard as number)) / 320));
      const depasse = 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
      enfant.scale.setScalar(Math.max(0.0001, (enfant.userData.taille as number) * depasse));
    }
  }
}

function graine(nom: string): number {
  let hachage = 0;
  for (let i = 0; i < nom.length; i++) hachage = (hachage * 31 + nom.charCodeAt(i)) >>> 0;
  return hachage;
}

function alealoire(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
