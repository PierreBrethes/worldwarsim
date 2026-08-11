import type { BufferGeometry } from 'three';
import type { RepereMonde } from './repere';

type GeometrieCourbable = BufferGeometry & { userData: { yPlat?: Float32Array } };

/**
 * Mémorise le Y d'origine de chaque sommet pour pouvoir recalculer la courbure
 * quand son intensité change, sans jamais recharger la géométrie.
 */
export class Courbure {
  private readonly geometries: GeometrieCourbable[] = [];

  constructor(private readonly repere: RepereMonde) {}

  enregistrer<T extends BufferGeometry>(geometrie: T): T {
    const courbable = geometrie as GeometrieCourbable;
    const positions = courbable.attributes.position!;
    const yPlat = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) yPlat[i] = positions.getY(i);
    courbable.userData.yPlat = yPlat;
    this.geometries.push(courbable);
    this.appliquerA(courbable);
    return geometrie;
  }

  appliquerToutes(): void {
    for (const geometrie of this.geometries) this.appliquerA(geometrie);
  }

  private appliquerA(geometrie: GeometrieCourbable): void {
    const positions = geometrie.attributes.position!;
    const yPlat = geometrie.userData.yPlat;
    if (!yPlat) return;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, yPlat[i]! + this.repere.chute(positions.getX(i), positions.getZ(i)));
    }
    positions.needsUpdate = true;
    geometrie.computeVertexNormals();
    geometrie.computeBoundingSphere();
    geometrie.computeBoundingBox();
  }
}
