import { Euler, type Box3, type Group, type Object3D, Quaternion, Vector3 } from 'three';
import type { MapMotion } from '@/domain/map-motion';
import { RIG_PARTS, type RigFamily, type RigPart } from '@/emblems/rigs';
import { bakedRig } from './baking';
import { sceneOf } from './figurines/figurine';

type Vec3 = readonly [x: number, y: number, z: number];

/** **L'écart d'une pièce à sa pose de repos.** Absent, le repos. */
export type PartPose = {
  /** Radians, appliqués après la rotation de repos. */
  readonly turn?: Vec3;
  /** En mètres du modèle. */
  readonly shift?: Vec3;
};

export type Pose<F extends RigFamily> = Partial<Record<RigPart<F>, PartPose>>;

/**
 * **Une séquence, fonction pure du temps** (ADR 0036 §3, les storyboards) : `at(t)` pour
 * `0 ≤ t < ms`, et `{}` au-delà — la pose finale est la pose de repos (§4).
 */
export type Sequence<F extends RigFamily = RigFamily> = {
  readonly family: F;
  readonly ms: number;
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
export type Cue = { readonly kind: 'sortie'; readonly siteId: string };

type Rest = { readonly position: Vector3; readonly quaternion: Quaternion };

const cooked = new Map<string, Promise<Group>>();
/** Cuite une fois par fichier, au premier signal ; les copies en partagent géométries et matériaux. */
function articulatedOf(url: string, family: RigFamily): Promise<Group> {
  const key = `${url} ${family}`;
  let rig = cooked.get(key);
  if (!rig) {
    const keep: ReadonlyArray<string> = RIG_PARTS[family];
    rig = sceneOf(url).then((scene) => bakedRig(scene, (node) => keep.includes(node.name)));
    cooked.set(key, rig);
  }
  return rig;
}

type Playing = {
  readonly host: SequenceHost;
  readonly id: string;
  readonly sequence: Sequence;
  readonly start: number;
  copy: Object3D | null;
  rests: Map<Object3D, Rest>;
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
    /** Ce que voit l'œil cette image : la boîte coupe le champ, et fait au moins `PLAY_PX`. */
    private readonly sees: (box: Box3) => boolean,
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
    if (piece === null || piece.box === null || !this.sees(piece.box)) return;
    const playing: Playing = {
      host,
      id,
      sequence: sequence as Sequence,
      start: now,
      copy: null,
      rests: new Map(),
      over: false,
    };
    this.playing.push(playing);
    // Cooking is the first signal's cost: the clock already runs, so it eats the start of the
    // sequence, never its end.
    this.cook(piece.url, sequence.family).then(
      (rig) => {
        if (playing.over) return;
        const copy = rig.clone(true);
        copy.traverse((node) =>
          playing.rests.set(node, {
            position: node.position.clone(),
            quaternion: node.quaternion.clone(),
          }),
        );
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
        (piece.box !== null && !this.sees(piece.box))
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
    playing.over = true;
    this.playing.splice(this.playing.indexOf(playing), 1);
    if (playing.copy !== null) playing.host.standIn(playing.id, null);
  }

  private pose(playing: Playing, pose: Record<string, PartPose | undefined>): void {
    for (const [node, rest] of playing.rests) {
      node.position.copy(rest.position);
      node.quaternion.copy(rest.quaternion);
      const own = pose[node.name];
      if (own === undefined) continue;
      if (own.shift) node.position.add(new Vector3(...own.shift));
      if (own.turn) node.quaternion.multiply(turn.setFromEuler(euler.set(...own.turn)));
    }
  }
}
