import { Group, Vector3 } from 'three';
import { COMBAT_LIMITS, combatAt, playsWhole } from '@/domain/combat-on-map';
import type { MapMotion } from '@/domain/map-motion';
import type { ReplayView } from '@/domain/player-view';
import { replayAt } from '@/domain/replay';
import { lineCentre, ReplayScene, replayReach } from './replay';

type Played = {
  readonly view: ReplayView;
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
  /** Its ink stamp has been asked: once, as the account begins (#327). */
  reported: boolean;
  /** It has stood at a scale above zero: the map showed it. */
  shown: boolean;
};

/** A point waits this long for its view before it shows again. @a-mesurer: a slow `replayOf`
 *  on a phone still lands inside it? */
export const WAIT_MS = 4000;
/** What a point waiting for its view veils around it, in the scene's units. @a-mesurer: the
 *  reach of a combat of three pieces a side, about. */
const WAITING_REACH = 3;

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
  private readonly seen = new Set<string>();
  private played: Played[] = [];
  private readonly waiting = new Map<string, { readonly point: Vector3; readonly since: number }>();
  /** What the scenes cover on the board, as of the last `advance`: the ground there is hidden. */
  veils: ReadonlyArray<{ readonly center: Vector3; readonly reach: number }> = [];

  /** Frames are due every image while one plays at full motion. */
  get active(): boolean {
    return this.motion === 'full' && this.played.some((each) => each.plays);
  }

  /** A combat is known before its view comes: its point is hidden from now. */
  wait(id: string, point: Vector3, now: number): void {
    this.waiting.set(id, { point, since: now });
  }

  waits(id: string): boolean {
    return this.waiting.has(id);
  }

  /** A scene of this combat stood on the board: « terrain tenu » is the stamp's now. */
  shown(id: string): boolean {
    return this.seen.has(id);
  }

  /** `yaw` turns the scene on the board; `nation` is mine. */
  play(view: ReplayView, nation: string | null, point: Vector3, yaw: number, now: number): void {
    this.waiting.delete(view.combatId);
    const attacker = view.side === 'attacker' ? 'mine' : 'theirs';
    const defender = attacker === 'mine' ? 'theirs' : 'mine';
    const pieces = replayAt(view, 0).pieces;
    const scene = new ReplayScene(
      nation,
      pieces,
      'land',
      null,
      view.faced?.nation ?? null,
      attacker,
    );
    scene.object.rotation.y = yaw;
    this.group.add(scene.object);
    const playing = this.played.filter((each) => each.plays).length;
    const plays =
      playsWhole(view, this.phone) &&
      this.motion !== 'off' &&
      playing < COMBAT_LIMITS[this.phone ? 'phone' : 'desk'].atOnce;
    this.played.push({
      view,
      scene,
      point,
      offset: lineCentre(pieces.filter((piece) => piece.side === defender).length, defender),
      reach: replayReach(view),
      plays,
      since: now,
      step: null,
      reported: false,
      shown: false,
    });
  }

  /**
   * Draws every combat at `now`, at the scale `scaleAt` gives its point — 0 past the figurines'
   * floor, where nothing shows nor sounds. `true` when a whole frame is due: a scene came, went,
   * or a held step changed.
   */
  advance(now: number, scaleAt: (point: Vector3) => number): boolean {
    let due = false;
    const veils: Array<{ center: Vector3; reach: number }> = [];
    this.played = this.played.filter((each) => {
      const shown = combatAt(each.view, now - each.since, this.motion, each.plays);
      if (shown.over) {
        this.end(each);
        due = true;
        return false;
      }
      const scale = scaleAt(each.point);
      const object = each.scene.object;
      object.visible = scale > 0;
      if (scale === 0) return true;
      if (!each.shown) {
        each.shown = true;
        this.seen.add(each.view.combatId);
        this.onShown(each.view.combatId);
      }
      if (!each.reported && shown.frame.step === 'compte-rendu') {
        each.reported = true;
        this.onReport(each.view);
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
    for (const [id, { point, since }] of this.waiting) {
      if (now - since > WAIT_MS) {
        this.waiting.delete(id);
        this.onSettled(id);
        due = true;
      } else veils.push({ center: point, reach: WAITING_REACH * scaleAt(point) });
    }
    this.veils = veils;
    return due;
  }

  /** At night a combat glows like a pile (`StandingLayer.lights`): it stood in the dark. */
  lights(emit: (at: Vector3, radius: number, near: number) => void): void {
    for (const { scene, reach } of this.played)
      if (scene.object.visible) emit(scene.object.position, reach * scene.object.scale.x, 1);
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
    for (const each of this.played) each.scene.dispose();
    this.played = [];
    this.waiting.clear();
  }

  private end(each: Played): void {
    each.scene.dispose();
    // A stamp up carries the dispatch with it: its lifting settles the combat.
    if (!each.reported) this.onSettled(each.view.combatId);
  }
}
