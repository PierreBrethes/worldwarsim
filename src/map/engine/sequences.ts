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
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import { isRigPart, type RigFamily, type RigPart } from '@/emblems/rigs';
import { bakedRig } from './baking';
import { movesOnItsOwn, sceneOf } from './figurines/figurine';
import { stride } from './figurines/infantry';
import { EXHAUST, Smoke } from './smoke';

/** A motor's breath leaves a door low under its lintel, in metres of the building. `@a-mesurer` */
const EXHAUST_HEIGHT = 1.5;

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
  /** `root` or a man (`man_*`): the piece, or the man, moved from its rest, in board units along
   *  the world's axes — the path from a door to a rank is drawn on the board, whatever the pile's
   *  turn and size. */
  readonly travel?: Vec3;
  /** `root` or a man: the way it faces, a turn about the world's up from +z. */
  readonly heading?: number;
  /** `root` or a man: the men march, at this many seconds of their stride (`stride`); a man
   *  without it stands as his squad stands him. */
  readonly stride?: number;
  /** A marker (`fx_*`) only: a motor's breath (`EXHAUST`) there, at this many seconds and this
   *  share of its strength. */
  readonly exhaust?: readonly [seconds: number, fade: number];
};

/** `root` is the whole copy, `man_*` a man of a squad: a troop that walks to its rank (#268). */
export type Pose<F extends RigFamily> = Partial<
  Record<RigPart<F> | 'root' | `man_${number}` | `fx_${string}`, PartPose>
>;

/**
 * **Une séquence, fonction pure du temps** (ADR 0036 §3, les storyboards) : `at(t)` pour
 * `0 ≤ t < ms`, et `{}` au-delà — la pose finale est la pose de repos (§4).
 */
export type Sequence<F extends RigFamily = RigFamily> = {
  /** The parts its articulated copy keeps; absent, the piece moves whole and its copy is a clone
   *  of what the host draws (`copyOf`) — a squad of three men, a tank not yet regenerated. */
  readonly family?: F;
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
  pieceOf(id: string): { readonly url?: string; readonly box: Box3 | null } | null;
  /** A clone of the piece as drawn, for a sequence that moves it whole; `null` until it is. */
  copyOf?(id: string): Object3D | null;
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
  /** Recruits stand at a barracks: `groups` of the pile `pileId` walk out to their rank (#268). */
  | {
      readonly kind: 'sortie';
      readonly siteId: string;
      readonly pileId: string;
      readonly groups: ReadonlyArray<number>;
    }
  /** A column entered a garrison: `groups` of `pileId` walk from `at`, coming from `toward`, to
   *  their rank (décision de Pierre du 28/10). */
  | {
      readonly kind: 'entree';
      readonly siteId: string;
      readonly pileId: string;
      readonly groups: ReadonlyArray<number>;
      readonly at: LonLat;
      readonly toward?: LonLat;
    }
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
  sequence: Sequence;
  readonly start: number;
  /** What the host places; `rig` is inside it, so that `root` moves the rig, not the host's matrix. */
  copy: Object3D | null;
  rig: Object3D | null;
  rests: Map<Object3D, Rest>;
  /** The materials a fade gave to a mesh of the copy, freed at the end. */
  faded: Map<Mesh, { material: Material; opacity: number; depthWrite: boolean }>;
  /** The motors' breaths it hung on markers (`exhaust`). */
  breaths: Map<Object3D, Smoke>;
  /** Finie avant la fin de la cuisson : la copie n'a plus à se poser. */
  over: boolean;
};

const turn = new Quaternion();
const euler = new Euler();
/** A man of a squad (`squadOf`): a piece that moves whole walks its men in file. */
const MAN = /^man_\d+$/;
const up = new Vector3(0, 1, 0);
const parentTurn = new Quaternion();

/** **`travel` and `heading` are read on the board**, through whatever turns and scales the
 *  node's parent: a pile faces away from its building and grows with its floor. */
function onTheBoard(node: Object3D, rest: Rest, { travel, heading }: PartPose): void {
  const parent = node.parent!;
  parent.updateWorldMatrix(true, false);
  if (travel) {
    const at = parent.localToWorld(rest.position.clone()).add(new Vector3(...travel));
    node.position.copy(parent.worldToLocal(at));
  }
  if (heading !== undefined) {
    parent.getWorldQuaternion(parentTurn).invert();
    node.quaternion.setFromAxisAngle(up, heading).premultiply(parentTurn).multiply(rest.quaternion);
  }
}

export class SequenceLayer {
  /** `full` seul joue ; tout autre réglage finit les séquences en cours à la prochaine image. */
  motion: MapMotion = 'full';
  private readonly playing: Playing[] = [];

  constructor(
    /** Ce que voit l'œil cette image : la boîte coupe le champ, et fait au moins `px`. */
    private readonly sees: (box: Box3, px: number) => boolean,
    private readonly cook: (url: string, family: RigFamily) => Promise<Group> = articulatedOf,
  ) {}

  /** Lance `sequence` sur la pièce `id` de `host`, son horloge partie à `now` ; une pièce qui
   *  bouge entière se pose tout de suite, à `at`. Ne fait rien (`false`) hors de `full`, hors de
   *  vue, au-delà de `MAX_PLAYING`, si la pièce joue déjà ou n'a rien à prêter. */
  play<F extends RigFamily>(
    host: SequenceHost,
    id: string,
    sequence: Sequence<F>,
    now: number,
    at = now,
  ): boolean {
    if (this.motion !== 'full' || this.playing.length >= MAX_PLAYING) return false;
    if (this.playsOn(host, id)) return false;
    const piece = host.pieceOf(id);
    const { family } = sequence;
    const seen = (box: Box3 | null) => box === null || this.sees(box, sequence.minPx ?? PLAY_PX);
    // A box still unknown (a lot just rebuilt) is not judged now: `step` judges it once known. A
    // piece that moves whole is judged once posed: where its walk starts counts as its rank.
    if (piece === null || (family !== undefined && !seen(piece.box))) return false;
    // A piece that moves whole is its own drawn clone: nothing to cook, it stands in now, posed,
    // and the frame drawn next shows it at its door, never at its rest.
    const whole = family === undefined ? (host.copyOf?.(id) ?? null) : null;
    if (family === undefined ? whole === null : piece.url === undefined) return false;
    const playing: Playing = {
      host,
      id,
      sequence: sequence as Sequence,
      start: now,
      copy: null,
      rig: null,
      rests: new Map(),
      faded: new Map(),
      breaths: new Map(),
      over: false,
    };
    this.playing.push(playing);
    if (whole !== null) {
      this.standIn(playing, whole);
      this.pose(playing, sequence.at(at - now) as Record<string, PartPose | undefined>);
      if (seen(host.pieceOf(id)?.box ?? null)) return true;
      this.finish(playing);
      return false;
    }
    // Cooking is the first signal's cost: the clock already runs, so it eats the start of the
    // sequence, never its end.
    this.cook(piece.url!, family!).then(
      (rig) => {
        if (!playing.over) this.standIn(playing, rig.clone(true));
      },
      () => this.finish(playing),
    );
    return true;
  }

  private standIn(playing: Playing, posed: Object3D): void {
    const { family } = playing.sequence;
    // Only what a pose moves has a rest: a hub that `spin` turns, a marker that hangs smoke, are
    // left to their own.
    posed.traverse(
      (node) =>
        (node === posed ||
          (family === undefined ? MAN.test(node.name) : isRigPart(family, node.name))) &&
        playing.rests.set(node, {
          position: node.position.clone(),
          quaternion: node.quaternion.clone(),
        }),
    );
    const copy = new Group().add(posed);
    playing.rig = posed;
    playing.copy = copy;
    playing.host.standIn(playing.id, copy);
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

  /** **The piece plays on with `sequence`, on the clock it started on**: what its doors do for a
   *  second recruit cued while the first walks. `false` when it plays nothing. */
  retime<F extends RigFamily>(host: SequenceHost, id: string, sequence: Sequence<F>): boolean {
    const playing = this.playing.find((p) => p.host === host && p.id === id);
    if (playing === undefined) return false;
    playing.sequence = sequence as Sequence;
    return true;
  }

  /** Whether the piece `id` of `host` plays a sequence now. */
  playsOn(host: SequenceHost, id: string): boolean {
    return this.playing.some((p) => p.host === host && p.id === id);
  }

  /** How many more pieces may play now (`MAX_PLAYING`). */
  get room(): number {
    return MAX_PLAYING - this.playing.length;
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
      const own =
        rest !== undefined || node.name.startsWith('fx_')
          ? pose[node === playing.rig ? 'root' : node.name]
          : undefined;
      if (own?.exhaust) this.breathe(playing, node, own.exhaust);
      if (rest !== undefined) {
        node.position.copy(rest.position);
        node.quaternion.copy(rest.quaternion);
        if (own?.shift) node.position.add(new Vector3(...own.shift));
        if (own?.turn) node.quaternion.multiply(turn.setFromEuler(euler.set(...own.turn)));
        if (own?.travel || own?.heading !== undefined) onTheBoard(node, rest, own);
        if (own?.stride !== undefined) stride(node, own.stride);
        // A man arrived before the rest of his squad stands as `squadOf` stood him.
        else if (MAN.test(node.name)) stride(node, 0);
      }
      const seen = fade * (own?.fade ?? 1);
      if ((node as Mesh).isMesh) this.fadeMesh(playing, node as Mesh, seen);
      for (const child of node.children) walk(child, seen);
    };
    walk(playing.rig!, 1);
  }

  /** A plume hung on the marker for the sequence, gone with its copy. */
  private breathe(playing: Playing, marker: Object3D, [seconds, fade]: readonly [number, number]) {
    let smoke = playing.breaths.get(marker);
    if (smoke === undefined) {
      smoke = new Smoke(EXHAUST);
      // Out of the door, under its lintel.
      smoke.object.position.set(0, EXHAUST_HEIGHT, 1.5);
      marker.add(smoke.object);
      playing.breaths.set(marker, smoke);
    }
    smoke.frame(seconds, fade);
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
