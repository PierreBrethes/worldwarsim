import { type Box3, Group, Vector3, type Camera, type Raycaster } from 'three';
import {
  pawnTarget,
  temporalPosition,
  unrollRoute,
  type UnrolledSegment,
} from '@/domain/route-timing';
import { PREVIEW_ARC_ID, type ArcView, type TroopView } from '@/domain/player-view';
import type { UnitRole } from '@/domain/ids';
import { movementWear } from '@/domain/pile-pieces';
import { movementRoles, movementSprites } from '@/emblems/units/manifest';
import { figurineFor } from './figurines/figurine';
import { annotationFigurine, eraseAnnotation, inkAnnotation } from './annotations';
import { nearWeight } from './figurines/figurine';
import type { Medium } from '@/domain/routing';
import { buildThread, pointOnLeg, projectOnGround, stretchTether, type Thread } from './thread';
import type { Ribbon } from './route-ribbon';
import { Pawn } from './pawn';
import { bendAround } from './sway';
import { ARC_COLORS } from './palette';
import type { MapMotion } from '@/domain/map-motion';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import type { InkLayer } from './ink';
import { CratePile } from './crates';
import { loadingAt, loadingUntilOf } from '@/domain/loading';
import { pieceScale } from './piece-scale';
import { boxOfObject, drawnHit, nearer, type PieceHit } from './piece-pick';

type RenderedArc = {
  arc: ArcView;
  thread: Thread;
  unrolled: ReadonlyArray<UnrolledSegment>;
  pawn: Pawn;
  /** A last known position's annotation, at the end of the frozen stretch; `null` otherwise. */
  relic: Group | null;
  /** Rewritten in place every frame: it is the movement-head label's anchor. */
  headPosition: Vector3;
  /**
   * **The share walked, advanced by the loop and not by React.** `arc.progress` is a snapshot
   * taken the instant the server's answer was adapted; reading it every frame renders a column
   * that never moves until something else happens to re-render the board. The widget already
   * counts down against its own clock, and the map has to do the same — with the difference
   * that here it costs no re-render at all.
   */
  progress: number;
  /** Share of the trip per millisecond, zero for anything that is not travelling. */
  pace: number;
  /** **A thread of one point** — an expedition on site — has no leg to walk: it stands here. */
  rest: Vector3 | null;
  loadingUntil: number | null;
};

/** Every thread's weight against its original design: the first one read too heavy on the sheet. */
const THREAD_WEIGHT = 0.5;

/** Board units read behind and ahead of a plane for the bend of its road: a few grid cells. */
const BANK_SPAN = 0.4;

/**
 * Thickness carries the hierarchy between movements — the ribbon's floor in pixels, and its true
 * width in proportion (`threadWidth`): what is not mine does not push to the foreground. Within a thread it says nothing — covered and
 * remaining are the same stroke, and the dashes tell them apart.
 */
const THICKNESSES: Readonly<Record<ArcView['state'], number>> = {
  mine: 2.5 * THREAD_WEIGHT,
  enemyDetected: 2 * THREAD_WEIGHT,
  lastKnown: 2 * THREAD_WEIGHT,
  seaControl: 2 * THREAD_WEIGHT,
};

const TRACE_OPACITY = 0.55;

/**
 * The accent is a matter of intensity, never of color: a thread's color says whose it is,
 * changing it on hover would say something else. The designated thread rises, the others
 * fade — it is the gap that reads, not the absolute value.
 */
const ACCENT_DESIGNATED = 1.6;
const ACCENT_OTHERS = 0.4;
/** A thread's pointer pick radius, in pixels beyond the ribbon's edge: it is aimed at on screen. */
export const ARC_HOVER_THRESHOLD = 6;

export class ArcLayer {
  readonly group = new Group();
  /** The head labels' screen positions read here: they move every frame. */
  readonly headPositions = new Map<string, Vector3>();
  private readonly pawnPoint = new Vector3();
  private readonly behindPoint = new Vector3();
  private readonly furtherPoint = new Vector3();
  private readonly aheadPoint = new Vector3();
  private readonly groundPoint = new Vector3();
  private readonly cameraPosition = new Vector3();
  private cameraYaw = 0;
  private playerNation: string | null = null;
  private rendered: RenderedArc[] = [];

  /** The pawns on the threads, which a replay hides where they would stand in its scene. */
  get pawns(): ReadonlyArray<Group> {
    return this.rendered.map((rendered) => rendered.pawn.object);
  }
  private targets: Ribbon[] = [];
  private accented: string | null = null;
  private width = 1;
  private height = 1;
  private unitsPerPixel = 1;
  /** The dash drift's clock: it lives in the loop, never in React state. */
  private lastFrameMs = 0;
  /** `off` stops the dashes drifting, so a displayed thread no longer forces continuous rendering. */
  motion: MapMotion = 'full';
  /** My troops, read for the strength my movements carry: the arc does not serve it. */
  troops: ReadonlyArray<TroopView> = [];

  /** Ids on screen at the last real display; `null` until the first, which is no appearance. */
  private known: ReadonlySet<string> | null = null;
  /** Threads whose pen stroke is still being laid: hidden until this instant, whatever rebuilds. */
  private readonly inking = new Map<string, number>();
  /** Kept across displays, which come at every step of any column: a crate falls once. */
  private readonly crates = new Map<string, CratePile>();

  constructor(
    private readonly frame: WorldFrame,
    private readonly ink: InkLayer,
  ) {}

  setPlayerNation(nation: string | null): void {
    if (nation === this.playerNation) return;
    this.playerNation = nation;
    this.rebuild();
  }

  /**
   * A ribbon's floor and its marks are in pixels: they need the canvas size to convert. Keeping it here
   * prevents a thread built after a resize from being born at the wrong scale — the kind of
   * bug that only shows after moving the window.
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    for (const rendered of this.rendered) rendered.thread.setResolution(width, height);
  }

  display(arcs: ReadonlyArray<ArcView>, carried?: ReadonlyMap<string, number>): void {
    this.clear();
    // Only mine are inked: nothing is added to what a sighting already says (fog). And only what
    // the player sent: a return is created by the resolution, nobody put a pen to it.
    const known = this.known;
    const appeared =
      carried !== undefined || known === null
        ? []
        : arcs.filter(
            (arc) =>
              arc.state === 'mine' &&
              arc.id !== PREVIEW_ARC_ID &&
              arc.type !== 'return' &&
              !known.has(arc.id),
          );
    if (carried === undefined) this.known = new Set(arcs.map((arc) => arc.id));
    for (const id of this.inking.keys()) {
      if (!arcs.some((arc) => arc.id === id)) this.inking.delete(id);
    }
    const now = performance.now();
    const clock = Date.now();
    for (const arc of arcs) {
      const stale = arc.state === 'lastKnown';
      const thread = buildThread(
        arc.route,
        this.frame,
        ARC_COLORS[arc.state],
        THICKNESSES[arc.state],
        {
          trace: TRACE_OPACITY,
          progress: stale ? 0.45 : 1,
        },
      );
      thread.setResolution(this.width, this.height);
      thread.setScale(this.unitsPerPixel);
      this.group.add(thread.object);
      for (const target of thread.targets) {
        target.userData.arc = arc.id;
        this.targets.push(target);
      }

      const roles = movementRoles(arc);
      const figurineOf = (role: UnitRole | null) =>
        role === null ? null : figurineFor(this.playerNation, role, [1, 1, 1]);
      const pawn = new Pawn(
        movementSprites(arc, this.playerNation),
        ARC_COLORS[arc.state].progress,
        // The fog serves an enemy no roles: up close it is an ink annotation, sliding along
        // its stretch (F2, ADR 0026 §4 révisé). In sight, its hour is the last look: now.
        arc.state === 'enemyDetected'
          ? {
              land: annotationFigurine('land', clock),
              sea: annotationFigurine('sea', clock),
              air: annotationFigurine('air', clock),
            }
          : roles && {
              land: figurineOf(roles.land),
              sea: figurineOf(roles.sea),
              air: figurineOf(roles.air),
            },
        movementWear(arc, this.troops),
        roles,
      );
      pawn.visible = !stale;
      this.group.add(pawn.object);

      if (appeared.includes(arc)) {
        const duration = this.ink.trace(thread.legs, now);
        if (duration > 0) this.inking.set(arc.id, now + duration);
      }
      if ((this.inking.get(arc.id) ?? 0) > now) {
        thread.object.visible = false;
        pawn.visible = false;
      }

      const relicMedium = lastKnownMedium(arc);
      const lastLeg = thread.legs.at(-1);
      let relic: Group | null = null;
      if (relicMedium !== null && lastLeg !== undefined && arc.state === 'lastKnown') {
        relic = inkAnnotation(relicMedium, arc.lastSeenAt, arc.seenMinutesAgo).object;
        pointOnLeg(lastLeg, 1, relic.position);
        relic.visible = false;
        this.group.add(relic);
      }

      const headPosition = new Vector3();
      this.headPositions.set(arc.id, headPosition);

      this.rendered.push({
        arc,
        thread,
        unrolled: unrollRoute(arc.route),
        pawn,
        relic,
        headPosition,
        /** A column the server says is at the end of its thread wins over the value the loop
         *  carried: held at the border, its pace is nil, and a pawn carried to 0,98 would
         *  otherwise stand there for good. */
        progress: arc.progress >= 1 ? 1 : (carried?.get(arc.id) ?? arc.progress),
        pace: paceOf(arc),
        rest: thread.legs.length === 0 ? this.frame.projectLonLat(arc.to, COUNTRY_THICKNESS) : null,
        loadingUntil: loadingUntilOf(arc),
      });
    }
    this.syncCrates();
    this.applyAccent();
    this.animate();
  }

  /** Un fil affiché n'est jamais immobile : ses tirets dérivent vers l'arrivée et son pion
   *  marche. Tant qu'il y en a un, chaque image est due (`frame-demand.ts`). */
  get isFlowing(): boolean {
    return this.motion !== 'off' && this.rendered.length > 0;
  }

  /**
   * Hover comes from the timeline or the pointer, but the accent never climbs back to
   * React: an id comes in, opacities change, the loop keeps running at sixty frames.
   */
  accent(id: string | null): void {
    if (id === this.accented) return;
    this.accented = id;
    this.applyAccent();
  }

  boxOf(id: string): Box3 | null {
    const rendered = this.rendered.find(({ arc }) => arc.id === id);
    return rendered?.pawn.object.visible ? boxOfObject(rendered.pawn.object) : null;
  }

  /** The pawn under `ray`, by its movement's id — the id its head label carries. */
  pawnUnder(ray: Raycaster): PieceHit | null {
    let best: PieceHit | null = null;
    for (const { arc, pawn } of this.rendered) {
      const distance = drawnHit(ray, pawn.object);
      if (distance !== null) best = nearer(best, { id: arc.id, distance });
    }
    return best;
  }

  /** The movement id under the pointer, so the timeline highlights its card. */
  hover(ray: Raycaster): string | null {
    const hit = ray.intersectObjects(this.targets, false)[0];
    return (hit?.object.userData.arc as string | undefined) ?? null;
  }

  /**
   * The thread is baked once; per frame only an `instanceCount` advances and a pawn moves.
   * The position comes from time, not distance: a movement straddling three mediums does
   * not cross the sea at road speed, and it stops at the dock.
   */
  animate(camera?: Camera, unitsPerPixel?: number, yaw?: number): void {
    if (camera) this.cameraPosition.copy(camera.position);
    if (yaw !== undefined) this.cameraYaw = yaw;
    if (unitsPerPixel !== undefined) this.unitsPerPixel = unitsPerPixel;

    const now = performance.now();
    const sinceLastFrame = this.lastFrameMs === 0 ? 0 : now - this.lastFrameMs;
    const elapsed = sinceLastFrame / 1000;
    this.lastFrameMs = now;

    for (const rendered of this.rendered) {
      if (rendered.relic !== null) {
        const near = nearWeight(rendered.relic.position.distanceTo(this.cameraPosition));
        rendered.relic.visible = near > 0;
        rendered.relic.scale.setScalar(near * pieceScale.troops);
        rendered.relic.rotation.set(0, this.cameraYaw, 0);
      }
      const inkedUntil = this.inking.get(rendered.arc.id);
      if (inkedUntil !== undefined && now >= inkedUntil) {
        this.inking.delete(rendered.arc.id);
        rendered.thread.object.visible = true;
        rendered.pawn.visible = true;
      }
      if (unitsPerPixel !== undefined) rendered.thread.setScale(unitsPerPixel);
      if (this.motion !== 'off') rendered.thread.drift(elapsed);

      rendered.progress = Math.min(1, rendered.progress + sinceLastFrame * rendered.pace);
      const position = temporalPosition(rendered.unrolled, rendered.progress);
      const { legIndex, local } = pawnTarget(position);

      rendered.thread.cut(legIndex, local);

      const leg = rendered.thread.legs[legIndex];
      let turn = 0;
      if (leg !== undefined) {
        pointOnLeg(leg, local, this.pawnPoint);
        pointOnLeg(leg, Math.min(1, local + 0.01), this.aheadPoint);
        if (leg.medium === 'air' && leg.length > 0) {
          const span = BANK_SPAN / leg.length;
          pointOnLeg(leg, local - span, this.behindPoint);
          pointOnLeg(leg, local + span, this.furtherPoint);
          turn = bendAround(this.behindPoint, this.pawnPoint, this.furtherPoint);
        }
        // At the dock, the pawn already wears the silhouette of what it is about to become:
        // it is the embarkation itself that shows, and the stop that reads.
        rendered.pawn.wear(
          position.kind === 'dock'
            ? (rendered.thread.legs[position.legIndex]?.medium ?? leg.medium)
            : leg.medium,
        );
      } else if (rendered.rest !== null) {
        this.pawnPoint.copy(rendered.rest);
        this.aheadPoint.copy(rendered.rest);
      } else continue;
      projectOnGround(this.pawnPoint, this.groundPoint);
      rendered.pawn.place(this.pawnPoint, this.aheadPoint, this.groundPoint.y, turn);
      rendered.pawn.step(this.motion === 'full' ? elapsed : null);
      rendered.pawn.orient(this.cameraPosition, this.cameraYaw);
      rendered.headPosition.copy(this.pawnPoint);

      if (rendered.thread.tether !== null)
        stretchTether(rendered.thread.tether, this.pawnPoint, this.groundPoint);

      const pile = this.crates.get(rendered.arc.id);
      if (pile !== undefined && rendered.loadingUntil !== null) {
        pile.update(
          loadingAt(rendered.loadingUntil, Date.now()).crates,
          now,
          this.motion === 'full',
        );
        pile.place(this.groundPoint, this.cameraPosition);
      }
    }
  }

  private syncCrates(): void {
    const loading = new Map(
      this.rendered.flatMap((rendered) =>
        rendered.loadingUntil === null ? [] : [[rendered.arc.id, rendered.loadingUntil] as const],
      ),
    );
    for (const [id, pile] of this.crates) {
      if (loading.has(id)) continue;
      pile.object.removeFromParent();
      this.crates.delete(id);
    }
    for (const [id, until] of loading) {
      if (this.crates.has(id)) continue;
      const pile = new CratePile(loadingAt(until, Date.now()).crates);
      this.crates.set(id, pile);
      this.group.add(pile.object);
    }
  }

  /**
   * A rebuild is a change of geometry — the player's nation landed — never a change of hour.
   * The share walked is carried over, otherwise every column would snap back to where the last
   * server answer found it.
   */
  rebuild(): void {
    this.display(
      this.rendered.map((rendered) => rendered.arc),
      new Map(this.rendered.map((rendered) => [rendered.arc.id, rendered.progress])),
    );
  }

  /** Frees every thread and pawn, and detaches them from the scene. */
  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private applyAccent(): void {
    for (const rendered of this.rendered) {
      rendered.thread.setAccent(
        this.accented === null
          ? 1
          : rendered.arc.id === this.accented
            ? ACCENT_DESIGNATED
            : ACCENT_OTHERS,
      );
    }
  }

  private clear(): void {
    for (const rendered of this.rendered) {
      rendered.thread.dispose();
      rendered.pawn.dispose();
      if (rendered.relic) eraseAnnotation(rendered.relic);
    }
    this.rendered = [];
    this.targets = [];
    this.headPositions.clear();
  }
}

/**
 * How fast a column walks its own thread, as a share of the thread per millisecond — derived from
 * the one thing the server dates. For a movement of mine that is the arrival; **for a sighting it
 * is the close of the window**, because the thread drawn is the watched stretch and the pawn is
 * due at its end when the watch ends, not when the column lands somewhere nobody was shown.
 *
 * **Zero is a still pawn and not a bug**: a last known position is a memory and a sea control a
 * standing fact. The map must not invent a pace to fill a `null`.
 */
function paceOf(arc: ArcView): number {
  const left =
    arc.state === 'mine'
      ? arc.minutesLeft
      : arc.state === 'enemyDetected'
        ? arc.watchMinutesLeft
        : null;
  if (left === null || left <= 0 || arc.progress >= 1) return 0;
  return (1 - arc.progress) / (left * 60_000);
}

/**
 * **The medium a last known position's annotation is written in, or `null` for none** (F2):
 * the end of the frozen stretch, in what the sighting served — a point and a medium, nothing more.
 * A column still watched has its pawn; mine never goes stale.
 */
export function lastKnownMedium(arc: ArcView): Medium | null {
  return arc.state === 'lastKnown' ? (arc.route.legs.at(-1)?.medium ?? null) : null;
}
