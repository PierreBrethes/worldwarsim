import {
  CircleGeometry,
  Plane,
  Color,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import type { MapMotion } from '@/domain/map-motion';
import { InkRing } from './ink-ring';
import type { Drawn } from './maquettes';
import { PALETTE } from './palette';
import { MAX_PLAYING } from './sequences';
import { DustBurst } from './smoke';
import { RETICLE_LIFT } from './standing';
import { RAZE_DUST_AT, RAZE_MS, razeAt, RAZE_RING_MS, razeRingAt } from './timelines/raze';

/** **The maquettes I razed that this view no longer serves** (#326): they fall. */
export const razedOf = (
  razing: ReadonlySet<string>,
  served: ReadonlyArray<{ readonly id: string }>,
): string[] => {
  const kept = new Set(served.map(({ id }) => id));
  return [...razing].filter((id) => !kept.has(id));
};

/** The footprint's radii, against the model's sides (`combat.js`, `footprint`). */
const FOOTPRINT = 0.6;
const FOOTPRINT_INK = 0.18;
/** What it blackens toward (`storyboard-combat/commun/scene.js`, `tint`). */
const SOOT = new Color('#1b1610');
/** How far it blackens at most (`razeAt`): its glow is gone there. */
const CHARRED = 0.85;
/** How dark the walls left standing are (`bplus.js`, `ruines`). */
const RUINED = 0.45;
/** A puff's grain against the building's widest side on the board. `@a-mesurer` */
const DUST_GRAIN = 0.35;
const DUST_PUFFS = [14, 10] as const;
const DISC = new CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const BLACK = new Color(0);

type Razing = {
  readonly id: string;
  readonly since: number;
  readonly ms: number;
  /** Placed by the maquette's matrix: its own units inside. */
  readonly object: Group;
  /** The building itself, at full motion: it trembles and falls about its ground. */
  readonly body: Group | null;
  /** The building's own copies, faded with it, with the colour and glow they start from. */
  readonly worn: ReadonlyArray<{
    readonly material: Material;
    readonly color: Color | null;
    readonly emissive: Color | null;
  }>;
  readonly footprint: Mesh<CircleGeometry, MeshBasicMaterial> | null;
  readonly ring: InkRing | null;
  readonly dust: Array<DustBurst | null>;
  readonly grain: number;
  /** The ring's radius in its own units, at full size. */
  readonly reach: number;
  readonly centre: Vector3;
  /** Its pool of light by night, on the board, as it stands whole. */
  readonly glow: number;
  /** What is left of it standing, as last drawn. */
  opacity: number;
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
  /** Its fall is over: the place it held on the board is given back. */
  onEnded: (id: string) => void = () => {};
  private playing: Razing[] = [];

  /** Frames are due every image while one plays. */
  get active(): boolean {
    return this.playing.length > 0;
  }

  /** `false` when it does not play — cut motion, or `MAX_PLAYING` already falling. */
  play(id: string, drawn: Drawn, now: number): boolean {
    if (this.motion === 'off' || this.playing.length >= MAX_PLAYING) return false;
    const object = new Group();
    object.matrixAutoUpdate = false;
    object.matrix.copy(drawn.matrix);
    const size = drawn.box.getSize(new Vector3());
    const scale = drawn.matrix.getMaxScaleOnAxis();
    // Above the ground by the margin of every other mark of ink, in its own units.
    const centre = drawn.box.getCenter(new Vector3()).setY(drawn.box.min.y + RETICLE_LIFT / scale);
    const worn: Array<Razing['worn'][number]> = [];
    let body: Group | null = null;
    let footprint: Razing['footprint'] = null;
    let ring: InkRing | null = null;
    if (this.motion === 'full') {
      body = new Group();
      // On a socle, the walls are cut a little over it and darkened, the yard's ruins at their foot
      // (ADR 0038 §5): the cut is read in the world, where the copy stands now.
      const ruins = drawn.ruins;
      const stump =
        ruins === undefined
          ? null
          : new Plane(
              new Vector3(0, -1, 0),
              new Vector3().setFromMatrixPosition(drawn.matrix).y + ruins.stump * scale,
            );
      for (const part of [...drawn.parts, ...(ruins?.parts ?? [])]) {
        // Its own copy: one raze blackens and fades nobody else's maquette.
        const material = part.material.clone();
        if (stump !== null && ruins!.shell.includes(part)) {
          material.clippingPlanes = [...(material.clippingPlanes ?? []), stump];
          material.clipShadows = true;
          if (material instanceof MeshStandardMaterial) material.color.multiplyScalar(RUINED);
        }
        const standard = material instanceof MeshStandardMaterial ? material : null;
        worn.push({
          material,
          color: standard?.color.clone() ?? null,
          emissive: standard?.emissive.clone() ?? null,
        });
        const mesh = new Mesh(part.geometry, material);
        // A sign grown on its foot, a building shrunk on its socle (`Drawn.parts`).
        (part as Drawn['parts'][number]).within?.decompose(
          mesh.position,
          mesh.quaternion,
          mesh.scale,
        );
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
      ring.userData.ground = true;
      object.add(ring);
    }
    this.group.add(object);
    const widest = Math.max(size.x, size.z) * scale;
    this.playing.push({
      id,
      since: now,
      ms: body === null ? RAZE_RING_MS : RAZE_MS,
      object,
      body,
      worn,
      footprint,
      ring,
      dust: RAZE_DUST_AT.map(() => null),
      grain: widest * DUST_GRAIN,
      reach: FOOTPRINT * Math.max(size.x, size.z),
      centre: centre.clone().applyMatrix4(drawn.matrix),
      glow: widest / 2,
      opacity: body === null ? 0 : 1,
    });
    return true;
  }

  advance(now: number): void {
    this.playing = this.playing.filter((each) => {
      const t = now - each.since;
      if (t >= each.ms) {
        this.end(each);
        this.onEnded(each.id);
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
        each.opacity = pose.opacity;
        for (const { material, color, emissive } of each.worn) {
          if (material instanceof MeshStandardMaterial) {
            if (color !== null) material.color.lerpColors(color, SOOT, pose.char);
            if (emissive !== null)
              material.emissive.lerpColors(emissive, BLACK, Math.min(1, pose.char / CHARRED));
          }
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

  /** By night a falling building keeps its pool of light, as long as it stands (`MaquetteLayer.lights`). */
  lights(emit: (at: Vector3, radius: number, near: number) => void): void {
    for (const { body, centre, glow, opacity } of this.playing)
      if (body !== null) emit(centre, glow * opacity, 1);
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
