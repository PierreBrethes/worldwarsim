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
import type { UnitRole, UnitTier } from '@/domain/ids';
import type { MapMotion } from '@/domain/map-motion';
import type { ReplayView } from '@/domain/player-view';
import { isRigPart, type RigFamily, type RigPart } from '@/emblems/rigs';
import type { Carrier } from '../cues';
import { bakedRig } from './baking';
import { crateOf } from './crate';
import { SLATS, WOOD } from './crates';
import { movesOnItsOwn, posedScene, type RestPose } from './figurines/figurine';
import { carrying, crateOnMan, hop, stand, stride } from './figurines/infantry';
import { EXHAUST, Smoke } from './smoke';
import { darkCrate } from './timelines/loading';

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
  /** With `heading` only: banked this many radians about its own length (a truck in hand). */
  readonly roll?: number;
  /** With `heading` only: its nose up this many radians (a plane lifting off, #269). */
  readonly pitch?: number;
  /** `root` or a man: the men march, at this many seconds of their stride (`stride`); a man
   *  without it stands as his squad stands him. */
  readonly stride?: number;
  /** A man only: he hops (a tailgate, #277), hips and knees bent this much, 0..1 (`hop`). */
  readonly hop?: number;
  /** A man only: he bends (0..1) over a crate, lifts it (0 at his feet, 1 on his shoulder), and
   *  the crate shows so much (#279, `storyboard-prise`); absent, he carries none. */
  readonly carry?: readonly [bend: number, lift: number, crate: number];
  /** A man only: his crate lies on the ground at `at` (board units from his rest, like
   *  `travel`), shown so much, until he takes it up (`carry`). */
  readonly lying?: { readonly at: Vec3; readonly shown: number };
  /** A part only: its y lengthened this many times, about its own origin (the crane's cable). */
  readonly stretch?: number;
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
  /** **A column deploying at its arrival** (#362) plays on a ceiling of its own
   *  (`MAX_DEPLOYING`): a file of six must not wait on the barracks' doors, nor shut them. */
  readonly pool?: 'deployment' | 'site';
  /** It plays at reduced motion too: a held pose, nothing moves (the file that holds, #362). */
  readonly reduced?: true;
  at(t: number): Pose<F>;
};

/** **Une couche qui dessine des pièces au repos**, et en prête une à une séquence. */
export type SequenceHost = {
  /** La pièce `id` telle qu'elle est dessinée : son fichier et sa boîte dans le monde (`null` le
   *  temps qu'un lot reconstruit se pose : on ne juge pas cette image-là) ; `null` quand elle
   *  n'est pas dessinée ici (partie, fantôme, chantier, épingle, écartée par un rejeu). */
  pieceOf(
    id: string,
  ): { readonly url?: string; readonly pose?: RestPose; readonly box: Box3 | null } | null;
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
/** **Au plus tant de pièces qui se déploient à la fois** (#362). Une file plus longue — une
 *  colonne Blitz de neuf unités ou plus (`unitPieces`) — ne se déploie pas du tout : elle se pose
 *  d'un coup. `@a-mesurer` */
export const MAX_DEPLOYING = 8;

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
  /** **A new plane comes out of its hangar, a new hull off its slip** (#269, #270); or one that
   *  flew or sailed in lands on its runway, docks at its mole (`retour`): `groups` of `pileId`. */
  | {
      readonly kind: 'formation' | 'retour';
      readonly siteId: string;
      readonly pileId: string;
      readonly groups: ReadonlyArray<number>;
      /** Where a `retour` flew or sailed from: whether its thread came in moored. */
      readonly from?: readonly [number, number];
    }
  /** **A movement of mine just born** (#269, #270): its plane takes off from its airfield, its
   *  hull puts to sea from its mole, when its thread leaves one. */
  | { readonly kind: 'depart'; readonly arcId: string }
  /** **A column deploys at its point** (#362): `groups` of `pileId` leave the file the pawn
   *  left (`ArcLayer.fileLeftBy`) for their places in the pile. */
  | {
      readonly kind: 'deploiement';
      readonly pileId: string;
      readonly groups: ReadonlyArray<number>;
    }
  /** **A truck loads at its warehouse or its HQ** (#271): `groupId` backs to the quay of
   *  `siteId`, and so many crates jump aboard. */
  | {
      readonly kind: 'chargement';
      readonly siteId: string;
      readonly groupId: string;
      readonly crates: number;
    }
  /** **A truck on a tour loads at its warehouse or its HQ** (#278): the pawn of `arcId` is held
   *  at the socle's foot while its truck comes `from` the road, or its rank, to the quay. */
  | {
      readonly kind: 'tournee';
      readonly arcId: string;
      readonly siteId: string;
      readonly troopId: string;
      readonly crates: number;
      readonly from: 'road' | 'rank';
    }
  /** **Men step down from a truck** (#277): `truck` and each squad that came down, `men`, are
   *  `${pileId}/${group}` (`StandingLayer`). */
  | { readonly kind: 'descente'; readonly truck: string; readonly men: ReadonlyArray<string> }
  /** **Men board a truck** (#277): `truck` is its group; each rider is drawn by its `figures`
   *  from where it last stood, or the end of its file, to the tailgate. */
  | {
      readonly kind: 'montee';
      readonly truck: string;
      /** A plane's men board too (#480), but the engine plays only a truck's until #502. */
      readonly carrier: Carrier;
      readonly riders: ReadonlyArray<{
        readonly troopId: string;
        readonly figures: ReadonlyArray<UnitTier>;
      }>;
    }
  /** **Men and vehicles board a hull** (#504): `hull` is its group, `carrierId` its troop, and
   *  each rider is drawn by its `figures` — where it last stood is read in the engine, as
   *  `boardOf` does (`lastSeen`, `fileLeftBy`). The engine answers every one by feeding its riders
   *  to the tag (`watchBoarded`), played or not; at a cargo's quay the men walk up its gangway
   *  first (#479), and the tag is fed as each is through the door. */
  | {
      readonly kind: 'embarquement';
      readonly hull: string;
      readonly carrierId: string;
      readonly ground: 'quay' | 'beach';
      readonly riders: ReadonlyArray<{
        readonly troopId: string;
        readonly role: UnitRole;
        readonly figures: ReadonlyArray<UnitTier>;
      }>;
    }
  /** **A squad disbanded at its point** (#277, U): what stays of `pileId` glides to the point,
   *  each piece set apart (`groupId`, by its `troopId`) walks from its `rank` to its place in the
   *  crown. A pile drawn `whole` (ADR 0028 §6) does not walk: rings of ink. */
  | {
      readonly kind: 'dispersion';
      readonly pileId: string;
      readonly whole: boolean;
      readonly moves: ReadonlyArray<{
        readonly groupId: string;
        readonly troopId: string;
        readonly rank: number;
      }>;
    }
  /** **My column takes at its point** (#279): a crate taken up, a site plundered or sabotaged,
   *  played on the column `arcId` leaving it — its squad's men go and come back. */
  | {
      readonly kind: 'prise';
      readonly act: 'ramassage' | 'recherche' | 'pillage' | 'sabotage';
      readonly arcId: string;
      readonly siteId?: string;
    }
  /** **A combat at its point** (#272): first without its view, to hide the point while it is
   *  asked for, then with it. `toward` is where the attacker came from, when it is known. */
  | {
      readonly kind: 'combat';
      readonly id: string;
      readonly point: LonLat;
      readonly view: ReplayView | null;
      readonly toward: LonLat | null;
      /** **D'où ma batterie a tiré** (#325) : chez le tireur seul, d'où l'arc part. */
      readonly from: LonLat | null;
    };

/** A site's doors and slip (`pool: 'site'`, #487) are no piece: `MAX_PLAYING` counts pieces only. */
const ceilingOf = (pool: Sequence['pool']): number =>
  pool === 'deployment' ? MAX_DEPLOYING : pool === 'site' ? Infinity : MAX_PLAYING;

type Rest = {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  readonly scale: Vector3;
};

const cooked = new Map<string, Promise<Group>>();
/** Cuite une fois par fichier, au premier signal ; les copies en partagent géométries et matériaux. */
export function articulatedOf(url: string, family: RigFamily, pose?: RestPose): Promise<Group> {
  const key = `${url} ${family} ${pose ?? ''}`;
  let rig = cooked.get(key);
  if (!rig) {
    // Its sign kept apart, to grow on its foot at a distance as the instance's does (ADR 0038 §7).
    rig = posedScene(url, pose).then((scene) => {
      const baked = bakedRig(
        scene,
        (node) => isRigPart(family, node.name) || movesOnItsOwn(node) || node.name === 'signe',
      );
      if (family === 'hq') stockDark(baked, scene);
      return baked;
    });
    cooked.set(key, rig);
  }
  return rig;
}

/** **The HQ keeps no pile**: two crates wait in the dark behind its service door, on the axis
 *  of its `fx_quai`, for a loading to bring out (#271). Its copy's own, never its instance's. */
function stockDark(rig: Object3D, scene: Object3D): void {
  const quay = scene.getObjectByName('fx_quai');
  if (quay === undefined) return;
  const stop = quay.getWorldPosition(new Vector3());
  const front = new Vector3(0, 0, 1).applyQuaternion(quay.getWorldQuaternion(new Quaternion()));
  for (const k of [0, 1]) {
    const crate = crateOf(WOOD, SLATS, true);
    crate.name = `caisse_${k + 1}`;
    crate.position.set(...darkCrate(stop.toArray(), front.toArray(), k));
    rig.add(crate);
  }
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
  /** The crates its men carry (`carry`), by man. */
  crates: Map<Object3D, Group>;
  /** Finie avant la fin de la cuisson : la copie n'a plus à se poser. */
  over: boolean;
};

const turn = new Quaternion();
const euler = new Euler();
/** A man of a squad (`squadOf`): a piece that moves whole walks its men in file. */
const MAN = /^man_\d+$/;
const up = new Vector3(0, 1, 0);
/** A piece faces +z once turned to its heading: its length. */
const along = new Vector3(0, 0, 1);
const across = new Vector3(1, 0, 0);
const parentTurn = new Quaternion();

/** **A part back at its rest, then shifted and turned** as its pose says: what a door does. */
export function bentFromRest(
  node: Object3D,
  rest: Pick<Rest, 'position' | 'quaternion'>,
  own?: Pick<PartPose, 'shift' | 'turn'>,
): void {
  node.position.copy(rest.position);
  node.quaternion.copy(rest.quaternion);
  if (own?.shift) node.position.add(new Vector3(...own.shift));
  if (own?.turn) node.quaternion.multiply(turn.setFromEuler(euler.set(...own.turn)));
}

/** **`travel` and `heading` are read on the board**, through whatever turns and scales the
 *  node's parent: a pile faces away from its building and grows with its floor. */
function onTheBoard(node: Object3D, rest: Rest, { travel, heading, roll, pitch }: PartPose): void {
  const parent = node.parent!;
  parent.updateWorldMatrix(true, false);
  if (travel) {
    const at = parent.localToWorld(rest.position.clone()).add(new Vector3(...travel));
    node.position.copy(parent.worldToLocal(at));
  }
  if (heading !== undefined) {
    parent.getWorldQuaternion(parentTurn).invert();
    node.quaternion.setFromAxisAngle(up, heading).premultiply(parentTurn);
    if (roll) node.quaternion.multiply(turn.setFromAxisAngle(along, roll));
    if (pitch) node.quaternion.multiply(turn.setFromAxisAngle(across, -pitch));
    node.quaternion.multiply(rest.quaternion);
  }
}

export class SequenceLayer {
  /** `full` seul joue, et `reduced` une pose tenue (`Sequence.reduced`) ; tout autre réglage
   *  finit les séquences en cours à la prochaine image. */
  motion: MapMotion = 'full';
  private readonly playing: Playing[] = [];
  /** When the last sequence on each piece ended, on the clock `step` is given (ms). */
  private readonly ended = new WeakMap<SequenceHost, Map<string, number>>();
  private clock = 0;

  constructor(
    /** Ce que voit l'œil cette image : la boîte coupe le champ, et fait au moins `px`. */
    private readonly sees: (box: Box3, px: number) => boolean,
    private readonly cook: (
      url: string,
      family: RigFamily,
      pose?: RestPose,
    ) => Promise<Group> = articulatedOf,
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
    if (!this.plays(sequence) || this.playingIn(sequence.pool) >= ceilingOf(sequence.pool))
      return false;
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
      crates: new Map(),
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
    // A lasting state is baked in the copy as in the instance it stands in for.
    this.cook(piece.url!, family!, piece.pose).then(
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
          scale: node.scale.clone(),
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
    this.clock = now;
    for (const playing of [...this.playing]) {
      const t = now - playing.start;
      const piece = playing.host.pieceOf(playing.id);
      if (
        !this.plays(playing.sequence) ||
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

  /** **When the last sequence on the piece `id` of `host` ended** (ms, the clock of `step`): what
   *  a loop that starts again at its phase 0 counts from. `undefined` for a piece that never
   *  played. */
  endedAt(host: SequenceHost, id: string): number | undefined {
    return this.ended.get(host)?.get(id);
  }

  /** Whether the piece `id` of `host` plays a sequence now. */
  playsOn(host: SequenceHost, id: string): boolean {
    return this.playing.some((p) => p.host === host && p.id === id);
  }

  /** Whether a sequence on the piece `id` of `host` already placed its own copy. */
  holds(host: SequenceHost, id: string): boolean {
    return this.playing.some((p) => p.host === host && p.id === id && p.copy !== null);
  }

  /** How many more pieces may play now (`MAX_PLAYING`), a deployment aside. */
  get room(): number {
    return this.roomFor(undefined);
  }

  /** How many more pieces of `pool` may play now (`MAX_DEPLOYING` for a deployment). */
  roomFor(pool: Sequence['pool']): number {
    return ceilingOf(pool) - this.playingIn(pool);
  }

  private plays({ reduced }: Sequence): boolean {
    return this.motion === 'full' || (this.motion === 'reduced' && reduced === true);
  }

  private playingIn(pool: Sequence['pool']): number {
    return this.playing.filter(({ sequence }) => sequence.pool === pool).length;
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
    this.ended.set(
      playing.host,
      (this.ended.get(playing.host) ?? new Map()).set(playing.id, this.clock),
    );
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
        bentFromRest(node, rest, own);
        node.scale.copy(rest.scale);
        if (own?.stretch !== undefined) node.scale.y *= own.stretch;
        if (own?.travel || own?.heading !== undefined) onTheBoard(node, rest, own);
        if (own?.stride !== undefined) stride(node, own.stride);
        else if (own?.hop !== undefined) hop(node, own.hop);
        // A man arrived before the rest of his squad stands as `squadOf` stood him.
        else if (MAN.test(node.name)) stand(node);
        if (MAN.test(node.name)) this.carry(playing, node, rest, own);
      }
      const seen = fade * (own?.fade ?? 1) * ((node.userData.crate as number | undefined) ?? 1);
      if ((node as Mesh).isMesh) this.fadeMesh(playing, node as Mesh, seen);
      for (const child of node.children) walk(child, seen);
    };
    walk(playing.rig!, 1);
  }

  /** **A man's crate** (#279): his own, hung on him, on the ground where it lies (`lying`) or
   *  on him (`carry`), hidden without either. */
  private carry(playing: Playing, man: Object3D, rest: Rest, { carry, lying }: PartPose = {}) {
    let crate = playing.crates.get(man);
    if (carry === undefined && lying === undefined) {
      if (crate) crate.visible = false;
      return;
    }
    if (crate === undefined) {
      crate = crateOf(WOOD, SLATS, true);
      crate.name = 'caisse';
      man.add(crate);
      playing.crates.set(man, crate);
    }
    let shown: number;
    if (carry !== undefined) {
      const [bend, lift] = carry;
      shown = carry[2];
      carrying(man, bend, lift);
      crate.position.set(...crateOnMan(lift));
    } else {
      shown = lying!.shown;
      const parent = man.parent!;
      man.updateWorldMatrix(true, false);
      const ground = parent.localToWorld(rest.position.clone()).add(new Vector3(...lying!.at));
      crate.position.copy(man.worldToLocal(ground));
    }
    crate.visible = shown > 0;
    crate.userData.crate = shown;
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
