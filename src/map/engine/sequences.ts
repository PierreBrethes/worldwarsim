import {
  Euler,
  type Box3,
  Group,
  type Material,
  type Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { MapMotion } from '@/domain/map-motion';
import { isRigPart, type RigFamily, type RigPart } from '@/emblems/rigs';
import { bakedRig } from './baking';
import { movesOnItsOwn, sceneOf } from './figurines/figurine';

type Vec3 = readonly [x: number, y: number, z: number];

/** **L'écart d'une pièce à sa pose de repos.** Absent, le repos. */
export type PartPose = {
  /** Radians, appliqués après la rotation de repos. */
  readonly turn?: Vec3;
  /** En mètres du modèle. */
  readonly shift?: Vec3;
  /** 1 whole, 0 gone: the part and what hangs from it. The copy takes materials of its own to
   *  fade, drawn last, and gives them back at the end. */
  readonly fade?: number;
};

/** `root` is the whole copy: a troop that walks from the door to its rank (#268). */
export type Pose<F extends RigFamily> = Partial<Record<RigPart<F> | 'root', PartPose>>;

/**
 * **Une séquence, fonction pure du temps** (ADR 0036 §3, les storyboards) : `at(t)` pour
 * `0 ≤ t < ms`, et `{}` au-delà — la pose finale est la pose de repos (§4).
 */
export type Sequence<F extends RigFamily = RigFamily> = {
  readonly family: F;
  readonly ms: number;
  /** The least size of the piece on screen for it to play, in px on the 900 px reference window;
   *  `PLAY_PX` when absent. A truck never reads at a building's size: the zoom stops short. */
  readonly minPx?: number;
  at(t: number): Pose<F>;
};

/** **Une couche qui dessine des pièces au repos**, et en prête une à une séquence. */
export type SequenceHost = {
  /** La pièce `id` telle qu'elle est dessinée : son fichier et sa boîte dans le monde (`null` le
   *  temps qu'un lot reconstruit se pose : on ne juge pas cette image-là) ; `null` quand elle
   *  n'est pas dessinée ici (partie, fantôme, chantier, épingle, écartée par un rejeu). */
  pieceOf(id: string): { readonly url: string; readonly box: Box3 | null } | null;
  /** La copie se tient à la place de la pièce au repos, placée comme elle, jusqu'à `null`. Un
   *  `rebuild` de l'hôte la garde par son id. */
  standIn(id: string, copy: Object3D | null): void;
};

/** **Sous cette taille à l'écran, une séquence ne joue pas** (px, fenêtre de 900). `@a-mesurer` */
export const PLAY_PX = 150;
/** **Au plus tant de copies à la fois** ; au-delà, la pose finale. `@a-mesurer` */
export const MAX_PLAYING = 4;

/** **Un signal** : ce que la vue vient d'apprendre et que la carte joue. Grandit par lot. */
export type Cue =
  | { readonly kind: 'sortie'; readonly siteId: string }
  /** A troop steps down from a truck: `groupId` is `${pileId}/${group}` (`StandingLayer`). */
  | { readonly kind: 'descente'; readonly groupId: string };

type Rest = { readonly position: Vector3; readonly quaternion: Quaternion };

const cooked = new Map<string, Promise<Group>>();
/** Cuite une fois par fichier, au premier signal ; les copies en partagent géométries et matériaux. */
function articulatedOf(url: string, family: RigFamily): Promise<Group> {
  const key = `${url} ${family}`;
  let rig = cooked.get(key);
  if (!rig) {
    rig = sceneOf(url).then((scene) =>
      bakedRig(scene, (node) => isRigPart(family, node.name) || movesOnItsOwn(node)),
    );
    cooked.set(key, rig);
  }
  return rig;
}

type Playing = {
  readonly host: SequenceHost;
  readonly id: string;
  readonly sequence: Sequence;
  readonly start: number;
  /** What the host places; `rig` is inside it, so that `root` moves the rig, not the host's matrix. */
  copy: Object3D | null;
  rig: Object3D | null;
  rests: Map<Object3D, Rest>;
  /** The materials a fade gave to a mesh of the copy, freed at the end. */
  faded: Map<Mesh, { material: Material; opacity: number; depthWrite: boolean }>;
  /** Finie avant la fin de la cuisson : la copie n'a plus à se poser. */
  over: boolean;
};

const turn = new Quaternion();
const euler = new Euler();

export class SequenceLayer {
  /** `full` seul joue ; tout autre réglage finit les séquences en cours à la prochaine image. */
  motion: MapMotion = 'full';
  private readonly playing: Playing[] = [];

  constructor(
    /** Ce que voit l'œil cette image : la boîte coupe le champ, et fait au moins `px`. */
    private readonly sees: (box: Box3, px: number) => boolean,
    private readonly cook: (url: string, family: RigFamily) => Promise<Group> = articulatedOf,
  ) {}

  /** Lance `sequence` sur la pièce `id` de `host`, à l'instant `now`. Ne fait rien hors de
   *  `full`, hors de vue, au-delà de `MAX_PLAYING`, ou si la pièce joue déjà. */
  play<F extends RigFamily>(
    host: SequenceHost,
    id: string,
    sequence: Sequence<F>,
    now: number,
  ): void {
    if (this.motion !== 'full' || this.playing.length >= MAX_PLAYING) return;
    if (this.playing.some((p) => p.host === host && p.id === id)) return;
    const piece = host.pieceOf(id);
    // A box still unknown (a lot just rebuilt) is not judged now: `step` judges it once known.
    if (piece === null || (piece.box !== null && !this.sees(piece.box, sequence.minPx ?? PLAY_PX)))
      return;
    const playing: Playing = {
      host,
      id,
      sequence: sequence as Sequence,
      start: now,
      copy: null,
      rig: null,
      rests: new Map(),
      faded: new Map(),
      over: false,
    };
    this.playing.push(playing);
    // Cooking is the first signal's cost: the clock already runs, so it eats the start of the
    // sequence, never its end.
    this.cook(piece.url, sequence.family).then(
      (rig) => {
        if (playing.over) return;
        const posed = rig.clone(true);
        // Only what a pose moves has a rest: a hub that `spin` turns, a marker that hangs smoke,
        // are left to their own.
        posed.traverse(
          (node) =>
            (node === posed || isRigPart(sequence.family, node.name)) &&
            playing.rests.set(node, {
              position: node.position.clone(),
              quaternion: node.quaternion.clone(),
            }),
        );
        const copy = new Group().add(posed);
        playing.rig = posed;
        playing.copy = copy;
        host.standIn(id, copy);
      },
      () => this.finish(playing),
    );
  }

  /** Pose chaque copie à son `t` ; finit ce qui est au bout, parti, hors de vue ou hors de
   *  `full`. La boucle l'appelle à chaque image dessinée. */
  step(now: number): void {
    for (const playing of [...this.playing]) {
      const t = now - playing.start;
      const piece = playing.host.pieceOf(playing.id);
      if (
        this.motion !== 'full' ||
        t >= playing.sequence.ms ||
        piece === null ||
        (piece.box !== null && !this.sees(piece.box, playing.sequence.minPx ?? PLAY_PX))
      ) {
        this.finish(playing);
        continue;
      }
      if (playing.copy !== null)
        this.pose(playing, playing.sequence.at(t) as Record<string, PartPose | undefined>);
    }
  }

  get active(): boolean {
    return this.playing.length > 0;
  }

  dispose(): void {
    for (const playing of [...this.playing]) this.finish(playing);
  }

  private finish(playing: Playing): void {
    if (playing.over) return;
    playing.over = true;
    this.playing.splice(this.playing.indexOf(playing), 1);
    if (playing.copy !== null) playing.host.standIn(playing.id, null);
    for (const { material } of playing.faded.values()) material.dispose();
  }

  private pose(playing: Playing, pose: Record<string, PartPose | undefined>): void {
    const walk = (node: Object3D, fade: number): void => {
      const rest = playing.rests.get(node);
      const own = rest && pose[node === playing.rig ? 'root' : node.name];
      if (rest !== undefined) {
        node.position.copy(rest.position);
        node.quaternion.copy(rest.quaternion);
        if (own?.shift) node.position.add(new Vector3(...own.shift));
        if (own?.turn) node.quaternion.multiply(turn.setFromEuler(euler.set(...own.turn)));
      }
      const seen = fade * (own?.fade ?? 1);
      if ((node as Mesh).isMesh) this.fadeMesh(playing, node as Mesh, seen);
      for (const child of node.children) walk(child, seen);
    };
    walk(playing.rig!, 1);
  }

  /** The cooked materials are shared by every copy: a fade works on a clone of its own. */
  private fadeMesh(playing: Playing, mesh: Mesh, fade: number): void {
    let own = playing.faded.get(mesh);
    if (own === undefined) {
      if (fade === 1) return;
      const shared = mesh.material as Material;
      own = {
        material: shared.clone(),
        opacity: shared.opacity,
        depthWrite: shared.depthWrite,
      };
      own.material.transparent = true;
      playing.faded.set(mesh, own);
      mesh.material = own.material;
    }
    own.material.opacity = own.opacity * fade;
    own.material.depthWrite = fade === 1 && own.depthWrite;
  }
}
