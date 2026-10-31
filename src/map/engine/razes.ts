import {
  type Box3,
  CircleGeometry,
  Color,
  Group,
  type Material,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { MapMotion } from '@/domain/map-motion';
import type { Part } from './baking';
import { InkRing } from './ink-ring';
import { PALETTE } from './palette';
import { MAX_PLAYING } from './sequences';
import { charred, DustBurst } from './smoke';
import { RAZE_DUST_AT, RAZE_MS, razeAt, RAZE_RING_MS, razeRingAt } from './timelines/raze';

/** What a raze is handed of its maquette before the view that lost it is drawn (`drawnOf`). */
export type Drawn = {
  readonly parts: ReadonlyArray<Part>;
  readonly matrix: Matrix4;
  readonly box: Box3;
};

/** The footprint's radii, against the model's sides (`combat.js`, `footprint`). */
const FOOTPRINT = 0.6;
const FOOTPRINT_INK = 0.18;
/** A puff's grain against the building's widest side on the board. `@a-mesurer` */
const DUST_GRAIN = 0.35;
const DUST_PUFFS = [14, 10] as const;
const DISC = new CircleGeometry(1, 48).rotateX(-Math.PI / 2);

type Razing = {
  readonly since: number;
  readonly ms: number;
  /** Placed by the maquette's matrix: its own units inside. */
  readonly object: Group;
  /** The building itself, at full motion: it trembles and falls about its ground. */
  readonly body: Group | null;
  readonly tints: ReadonlyArray<{
    readonly material: MeshStandardMaterial;
    readonly from: Color;
    readonly to: Color;
  }>;
  /** The building's own copies, faded with it. */
  readonly materials: ReadonlyArray<Material>;
  readonly footprint: Mesh<CircleGeometry, MeshBasicMaterial> | null;
  readonly ring: InkRing | null;
  readonly dust: Array<DustBurst | null>;
  readonly grain: number;
  /** The ring's radius in its own units, at full size. */
  readonly reach: number;
  readonly centre: Vector3;
};

/**
 * **Raser abat le bâtiment** (#326) : quand la vue perd la maquette que le joueur vient de raser,
 * une copie de ce qu'elle dessinait joue l'affaissement (`razeAt`) à sa place — elle tremble,
 * s'écrase en noircissant, la poussière monte, le tas s'efface sur son empreinte d'encre. En
 * réduites, un anneau d'encre à sa place ; en coupées, rien. Au plus `MAX_PLAYING` à la fois.
 * Une couche à part, au modèle de `CombatLayer` : la pièce n'est plus sur la carte.
 */
export class RazeLayer {
  readonly group = new Group();
  motion: MapMotion = 'full';
  private playing: Razing[] = [];

  /** Frames are due every image while one plays. */
  get active(): boolean {
    return this.playing.length > 0;
  }

  play(drawn: Drawn, now: number): void {
    if (this.motion === 'off' || this.playing.length >= MAX_PLAYING) return;
    const object = new Group();
    object.matrixAutoUpdate = false;
    object.matrix.copy(drawn.matrix);
    const size = drawn.box.getSize(new Vector3());
    const centre = drawn.box.getCenter(new Vector3()).setY(drawn.box.min.y);
    const materials: Material[] = [];
    const tints: Array<Razing['tints'][number]> = [];
    let body: Group | null = null;
    let footprint: Razing['footprint'] = null;
    let ring: InkRing | null = null;
    if (this.motion === 'full') {
      body = new Group();
      for (const part of drawn.parts) {
        // Its own copy: one raze blackens and fades nobody else's maquette.
        const material = part.material.clone();
        materials.push(material);
        if (material instanceof MeshStandardMaterial)
          tints.push({
            material,
            from: material.color.clone(),
            to: charred(part.material as MeshStandardMaterial).color,
          });
        const mesh = new Mesh(part.geometry, material);
        mesh.userData.building = true;
        body.add(mesh);
      }
      footprint = new Mesh(
        DISC,
        new MeshBasicMaterial({ color: PALETTE.border, transparent: true, depthWrite: false }),
      );
      footprint.position.copy(centre);
      footprint.scale.set(FOOTPRINT * size.x, 1, FOOTPRINT * size.z);
      footprint.userData.ground = true;
      object.add(body, footprint);
    } else {
      ring = new InkRing();
      ring.position.copy(centre);
      object.add(ring);
    }
    this.group.add(object);
    const widest = Math.max(size.x, size.z) * drawn.matrix.getMaxScaleOnAxis();
    this.playing.push({
      since: now,
      ms: body === null ? RAZE_RING_MS : RAZE_MS,
      object,
      body,
      tints,
      materials,
      footprint,
      ring,
      dust: RAZE_DUST_AT.map(() => null),
      grain: widest * DUST_GRAIN,
      reach: FOOTPRINT * Math.max(size.x, size.z),
      centre: centre.applyMatrix4(drawn.matrix),
    });
  }

  advance(now: number): void {
    this.playing = this.playing.filter((each) => {
      const t = now - each.since;
      if (t >= each.ms) {
        this.end(each);
        return false;
      }
      if (each.ring !== null) {
        const { size, opacity } = razeRingAt(t);
        each.ring.style('ripple', 0, true);
        each.ring.opacity = opacity;
        each.ring.scale.setScalar(size * each.reach);
      }
      if (each.body !== null) {
        const pose = razeAt(t);
        each.body.rotation.z = pose.sway;
        each.body.scale.y = pose.height;
        for (const { material, from, to } of each.tints)
          material.color.lerpColors(from, to, pose.char);
        for (const material of each.materials) {
          material.transparent = pose.opacity < 0.999;
          material.opacity = pose.opacity;
          material.depthWrite = pose.opacity > 0.5;
        }
        each.body.visible = pose.opacity > 0.01;
        each.footprint!.material.opacity = FOOTPRINT_INK * pose.ink;
        each.footprint!.visible = pose.ink > 0.01;
        RAZE_DUST_AT.forEach((at, k) => {
          if (t < at) return;
          let burst = each.dust[k] ?? null;
          if (burst === null) {
            burst = new DustBurst(DUST_PUFFS[k]!, each.grain);
            burst.object.position.copy(each.centre);
            this.group.add(burst.object);
            each.dust[k] = burst;
          }
          burst.object.visible = burst.step((t - at) / 1000, each.grain);
        });
      }
      return true;
    });
  }

  dispose(): void {
    for (const each of this.playing) this.end(each);
    this.playing = [];
  }

  private end(each: Razing): void {
    each.object.removeFromParent();
    // The building's copies are not `dispose()`d: they share their programs with the models', and
    // the renderer's release of them cost a long task on a phone (#332). They go with the garbage.
    each.footprint?.material.dispose();
    each.ring?.material.dispose();
    for (const burst of each.dust) burst?.dispose();
  }
}
