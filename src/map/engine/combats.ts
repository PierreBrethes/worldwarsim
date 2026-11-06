import { Group, Vector3 } from 'three';
import {
  afloat,
  COMBAT_LIMITS,
  combatAt,
  type CombatShown,
  playsWhole,
  sceneOf,
  seatsTagOf,
  sceneSpan,
} from '@/domain/combat-on-map';
import type { Medium } from '@/domain/ids';
import type { MapMotion } from '@/domain/map-motion';
import type { ReplayView } from '@/domain/player-view';
import { replayAt, seatsTagAt, seatsTagWindow, type SeatsTagWindow } from '@/domain/replay';
import { BatteryShot, type BatteryHost } from './bombardment';
import { warmPieces, type Flash } from './halo';
import { lineCentre, REPLAY_STAGE, ReplayScene, replayReach } from './replay';

type Played = {
  /** What the scene plays: at sea, its ships alone (`afloat`). */
  readonly view: ReplayView;
  /** What the stamp reads (#327): the whole account, the drowned included. */
  readonly told: ReplayView;
  /** Its longest piece, on the board: what it is drawn and seen by (`sceneSpan`). */
  readonly span: number;
  readonly scene: ReplayScene;
  /** The combat's point on the board, where the defender's line stands. */
  readonly point: Vector3;
  /** The defender's line across the scene, in its units: what is moved onto the point. */
  readonly offset: number;
  readonly reach: number;
  /** It plays its six steps; `false`, it holds the final pose (`combatAt`). */
  readonly plays: boolean;
  readonly since: number;
  /** The step last drawn: a held step asks one whole frame as it changes. */
  step: string | null;
  /** **My battery firing at it** (#325), its copy and its arc: the shooter's only. */
  readonly shot: BatteryShot | null;
  /** Its ink stamp has been asked: once, as the account begins (#327). */
  reported: boolean;
  /** It has stood at a scale above zero: the map showed it. */
  shown: boolean;
  /** **Its seats tag** (#514): when it is struck through, for the side that loses its passengers
   *  `null` for the rest. A final pose draws no tag by itself: its only frame is the empty sea. */
  readonly tagWindow: SeatsTagWindow | null;
  /** What the tag last said, so a change is told once. */
  tag: 'whole' | 'struck' | null;
};

/** A point waits this long for its view before it shows again. @a-mesurer: a slow `replayOf`
 *  on a phone still lands inside it? */
export const WAIT_MS = 4000;
/** What a point waiting for its view veils around it, in hulls of its longest piece (`span`).
 *  @a-mesurer: the reach of a combat of three tanks a side, about. */
const WAITING_HULLS = 4;

/**
 * **Les combats qui se jouent sur la carte** (#272) : chacun pose sa propre scène au point, tirée
 * du rejeu (`ReplayScene`) — quand le client l'apprend, ses pièces ne sont plus sur la carte —,
 * et la mène par `combatAt`. Autant à la fois que `COMBAT_LIMITS` le dit ; au-delà, la pose
 * finale. `onSettled` dit quand un combat a fini de se montrer — à la fin de sa scène, ou tout de
 * suite quand il ne joue pas : sa dépêche l'attend.
 */
export class CombatLayer {
  readonly group = new Group();
  motion: MapMotion = 'full';
  /** A phone plays fewer and smaller combats (`COMBAT_LIMITS`). */
  phone = false;
  onSettled: (id: string) => void = () => {};
  /** **The account begins** (#327) — at the last step of a scene, or with the final pose — on a
   *  combat the player can see: the stamp that reads its outcome goes up. */
  onReport: (view: ReplayView) => void = () => {};
  /** **The map showed this combat's scene** (#327), from the first image above the floor. */
  onShown: (id: string) => void = () => {};
  /** **The seats tag of a hull going down changes** (#514): whole, struck through, or taken down. */
  onSeatsTag: (view: ReplayView, tag: 'whole' | 'struck' | null) => void = () => {};
  /** **What lends my guns** to a bombardment's shot (#325): the standing piles. */
  host: BatteryHost | null = null;
  private readonly seen = new Set<string>();
  private played: Played[] = [];
  private readonly waiting = new Map<
    string,
    { readonly point: Vector3; readonly span: number; readonly since: number }
  >();
  /** What the scenes cover on the board, as of the last `advance`: the ground there is hidden. */
  veils: ReadonlyArray<{ readonly center: Vector3; readonly reach: number }> = [];

  /** My batteries firing, each its point and reach on the board: a veil leaves them standing,
   *  or a gun near its target would vanish under its own shot (#325). */
  get batteries(): ReadonlyArray<{ readonly at: Vector3; readonly within: number }> {
    return this.played.flatMap(({ shot }) =>
      shot === null ? [] : [{ at: shot.from, within: shot.within }],
    );
  }

  /** Frames are due every image while one plays at full motion. */
  get active(): boolean {
    return this.motion === 'full' && this.played.some((each) => each.plays);
  }

  /** A combat is known before its view comes: its point is hidden from now, as far as `span`,
   *  the piece it is seen by (`playCombat`), takes. */
  wait(id: string, point: Vector3, span: number, now: number): void {
    this.waiting.set(id, { point, span, since: now });
  }

  waits(id: string): boolean {
    return this.waiting.has(id);
  }

  /** A scene of this combat stood on the board: « terrain tenu » is the stamp's now. */
  shown(id: string): boolean {
    return this.seen.has(id);
  }

  /** `yaw` turns the scene on the board; `nation` is mine; `medium` is the point's (#324).
   *  `battery`, my battery's place on the board and how near it my gun stands, when it fired at
   *  this point (#325): read from `firedFrom` alone, the target has none. */
  play(
    told: ReplayView,
    nation: string | null,
    point: Vector3,
    yaw: number,
    now: number,
    medium: Medium = 'land',
    battery: { readonly at: Vector3; readonly within: number } | null = null,
  ): void {
    this.waiting.delete(told.combatId);
    const view = sceneOf(medium === 'sea' ? afloat(told) : told);
    const shooting = view.bombardment !== undefined && view.side === 'attacker';
    // Nothing afloat on one side: the dispatch tells it, no scene does.
    if (medium === 'sea' && ((!shooting && view.mine.length === 0) || view.theirs.troops === 0)) {
      this.onSettled(told.combatId);
      return;
    }
    const attacker = view.side === 'attacker' ? 'mine' : 'theirs';
    const defender = attacker === 'mine' ? 'theirs' : 'mine';
    const pieces = replayAt(view, 0).pieces;
    const span = sceneSpan(view);
    const scene = new ReplayScene(
      nation,
      pieces,
      medium,
      view.bombardment === undefined ? null : shooting ? 'afar' : 'unseen',
      view.faced?.nation ?? null,
      attacker,
      span,
    );
    scene.object.rotation.y = yaw;
    this.group.add(scene.object);
    const playing = this.played.filter((each) => each.plays).length;
    const plays =
      playsWhole(view, this.phone) &&
      this.motion !== 'off' &&
      playing < COMBAT_LIMITS[this.phone ? 'phone' : 'desk'].atOnce;
    scene.sharesMaterials = !plays;
    scene.final = !plays;
    this.played.push({
      view,
      told,
      span,
      scene,
      point,
      offset: lineCentre(
        pieces.filter((piece) => piece.side === defender).length,
        defender,
        medium,
      ),
      reach: replayReach(view, null, medium),
      plays,
      shot: shooting && battery !== null ? this.shotAt(battery, point) : null,
      since: now,
      step: null,
      reported: false,
      shown: false,
      tagWindow: seatsTagOf(told) !== null ? seatsTagWindow(view) : null,
      tag: null,
    });
  }

  /**
   * Draws every combat at `now`, at the scale `scaleAt` gives its point for its longest piece —
   * 0 past the figurines' floor, where nothing shows nor sounds. `true` when a whole frame is due: a scene came, went,
   * or a held step changed.
   */
  advance(now: number, scaleAt: (point: Vector3, span: number) => number): boolean {
    let due = false;
    const veils: Array<{ center: Vector3; reach: number }> = [];
    this.played = this.played.filter((each) => {
      const shown = combatAt(each.view, now - each.since, this.motion, each.plays);
      if (shown.over) {
        this.end(each);
        due = true;
        return false;
      }
      // Its arc and its gun show whichever end is in the field (#325).
      each.shot?.show(shown.frame, this.motion, each.plays);
      const scale = scaleAt(each.point, each.span);
      const object = each.scene.object;
      object.visible = scale > 0;
      this.hangTag(each, scale > 0 ? shown : null);
      if (scale === 0) return true;
      if (!each.shown) {
        each.shown = true;
        this.seen.add(each.view.combatId);
        this.onShown(each.view.combatId);
      }
      if (!each.reported && shown.reportDue) {
        each.reported = true;
        this.onReport(each.told);
      }
      object.scale.setScalar(scale);
      const yaw = object.rotation.y;
      object.position
        .copy(each.point)
        .add(new Vector3(-Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(each.offset * scale));
      if (shown.frame.step !== each.step) {
        each.step = shown.frame.step;
        due = true;
      }
      each.scene.show(shown.frame, now / 1000, this.motion !== 'full' || !each.plays, shown.turns);
      veils.push({ center: object.position, reach: each.reach * scale });
      return true;
    });
    for (const [id, { point, span, since }] of this.waiting) {
      if (now - since > WAIT_MS) {
        this.waiting.delete(id);
        this.onSettled(id);
        due = true;
      } else
        veils.push({
          center: point,
          reach: ((WAITING_HULLS * span) / REPLAY_STAGE) * scaleAt(point, span),
        });
    }
    this.veils = veils;
    return due;
  }

  /** Tells the map when the seats tag changes: `null` for a scene out of sight, where it hangs no more. */
  private hangTag(each: Played, shown: CombatShown | null): void {
    const state =
      shown === null
        ? null
        : seatsTagAt(each.tagWindow, shown.frame, this.motion !== 'full' || !each.plays);
    if (state === each.tag) return;
    each.tag = state;
    this.onSeatsTag(each.told, state);
  }

  /** At night a combat glows like a pile (`StandingLayer.lights`): it stood in the dark. */
  lights(emit: (at: Vector3, radius: number, near: number) => void): void {
    for (const { scene, reach } of this.played)
      if (scene.object.visible)
        emit(scene.object.position, (scene.fleet ?? reach) * scene.object.scale.x, 1);
  }

  /** **The shots that light the night** (#332): each shown scene's most vivid flash (cut
   *  motion holds the final pose, where nobody fires). */
  flashes(): Flash[] {
    return this.played.flatMap(({ scene, reach, shot }) => {
      const lit = scene.object.visible ? scene.brightestFlash() : null;
      const gun = shot?.flashOf() ?? null;
      return [
        ...(lit === null ? [] : [{ ...lit, reach: (scene.fleet ?? reach) * scene.object.scale.x }]),
        ...(gun === null ? [] : [gun]),
      ];
    });
  }

  /** The pen's measures this frame, for the arcs of ink (#325). */
  scaleInk(unitsPerPixel: number, viewHeight: number): void {
    for (const { shot } of this.played) shot?.scaleInk(unitsPerPixel, viewHeight);
  }

  private shotAt(battery: { readonly at: Vector3; readonly within: number }, point: Vector3) {
    const shot = new BatteryShot(battery.at, battery.within, point, this.host);
    this.group.add(shot.object);
    return shot;
  }

  /** The pieces' glow by `night`, each scene swelling with its own flash (#332). */
  warm(night: number): void {
    for (const { scene } of this.played)
      warmPieces(scene.object, night, scene.brightestFlash()?.strength ?? 0);
  }

  /** Every scene and every wait goes — a replay opens: the board is left as it stands. */
  clear(): void {
    for (const each of this.played) this.end(each);
    this.played = [];
    for (const id of this.waiting.keys()) this.onSettled(id);
    this.waiting.clear();
    this.veils = [];
  }

  dispose(): void {
    for (const each of this.played) {
      each.scene.dispose();
      each.shot?.dispose();
    }
    this.played = [];
    this.waiting.clear();
  }

  private end(each: Played): void {
    this.hangTag(each, null);
    each.scene.dispose();
    each.shot?.dispose();
    // A stamp up carries the dispatch with it: its lifting settles the combat.
    if (!each.reported) this.onSettled(each.view.combatId);
  }
}
