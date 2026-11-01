import type { LonLat } from '@/domain/geo';
import { type Box3, type Frustum, Group, Vector3, type Camera, type Raycaster } from 'three';
import {
  pawnTarget,
  temporalPosition,
  unrollRoute,
  type TemporalPosition,
  type UnrolledSegment,
} from '@/domain/route-timing';
import type { ArcView, TroopView } from '@/domain/player-view';
import type { UnitRole } from '@/domain/ids';
import { movementWear, type PilePieces } from '@/domain/pile-pieces';
import { movementRoles } from '@/emblems/units/manifest';
import { figurineFor } from './figurines/figurine';
import { annotationFigurine, eraseAnnotation, inkAnnotation } from './annotations';
import { ANONYMOUS_SPAN, troopPinSpan, troopScale } from './figurines/figurine';
import type { Medium } from '@/domain/routing';
import {
  buildThread,
  pointOnLeg,
  projectOnGround,
  stretchTether,
  type EndsOf,
  type Thread,
  type ThreadLeg,
} from './thread';
import type { Ribbon } from './route-ribbon';
import { Pawn, type ColumnPiece, type FilePiece, type Road } from './pawn';
import { dressedGroups } from './standing';
import { bendAround } from './sway';
import { ARC_COLORS } from './palette';
import type { MapMotion } from '@/domain/map-motion';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import type { InkLayer } from './ink';
import { CratePile } from './crates';
import { loadingAt, loadingUntilOf } from '@/domain/loading';
import { arcProgressAt } from '@/domain/arc-timing';
import { HEARTBEAT_MS } from './frame-demand';
import { asClockTime } from '@/domain/duration';
import { surveyInk } from '@/domain/survey-ink';
import { boxOfObject, drawnHit, leastHit, nearer, type PieceHit } from './piece-pick';

type RenderedArc = {
  readonly key: string;
  arc: ArcView;
  thread: Thread;
  unrolled: ReadonlyArray<UnrolledSegment>;
  pawn: Pawn;
  /** A last known position's annotation, at the end of the frozen stretch; `null` otherwise. */
  relic: Group | null;
  /** Rewritten in place every frame: it is the movement-head label's anchor. */
  headPosition: Vector3;
  /** Just ahead of the head on its road: the pin's trail points away from it (#234). */
  aheadPosition: Vector3;
  /** The ink a last known position was drawn in (`surveyInk`, two digits); `null` otherwise. */
  ink: string | null;
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
  /** Each movement's pawn by its id: a label or a pin reads its span at every frame. */
  private readonly pawnById = new Map<string, Pawn>();

  /** **The span a movement's pawn gives way to its pin by**, `null` for no movement of that id. */
  spanOf(id: string): number | null {
    const pawn = this.pawnById.get(id);
    return pawn === undefined ? null : troopPinSpan(pawn.span);
  }
  readonly aheadPositions = new Map<string, Vector3>();
  private readonly pawnPoint = new Vector3();
  private readonly behindPoint = new Vector3();
  private readonly furtherPoint = new Vector3();
  private readonly aheadPoint = new Vector3();
  private readonly groundPoint = new Vector3();
  private readonly cameraPosition = new Vector3();
  private cameraYaw = 0;
  /** The eye's field at the last frame: a file out of it is not laid out. */
  private inView: Frustum | null = null;
  private playerNation: string | null = null;
  private rendered: RenderedArc[] = [];

  /** The threads a combat played on the map hides (`veil`). */
  private readonly veiled = new Set<string>();

  /**
   * **A combat played on the map hides the thread of a column leaving its point** (#272): its
   * return (`walkHome`) would tell the outcome before the scene does. `null` lifts it.
   */
  veil(leaving: ((from: LonLat) => boolean) | null): void {
    const now = performance.now();
    for (const { arc, thread } of this.rendered) {
      if (leaving !== null && leaving(arc.from)) {
        this.veiled.add(arc.id);
        thread.object.visible = false;
      } else if (this.veiled.delete(arc.id))
        thread.object.visible = (this.inking.get(arc.id) ?? 0) <= now;
    }
  }

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
  /** When the last known positions' ink was last read against the clock (`fadeLastKnown`). */
  private inkReadMs = 0;
  private motionSetting: MapMotion = 'full';
  /** `off` stops the dashes drifting, so a displayed thread no longer forces continuous rendering.
   *  Full and reduced lay the runway and quay lead-ins (#129): reduced has the pawn on the axis
   *  at once, off draws the thread as the route runs. */
  get motion(): MapMotion {
    return this.motionSetting;
  }
  set motion(motion: MapMotion) {
    const before = this.motionSetting !== 'off';
    this.motionSetting = motion;
    if (before !== (motion !== 'off') && this.rendered.length > 0) this.rebuild();
  }
  private aloft = false;
  /** My troops, read for the strength my movements carry: the arc does not serve it. */
  troops: ReadonlyArray<TroopView> = [];
  /** **What each movement of mine shows on land** (#276), by its id: the route lays it out as its
   *  pile at rest, and the engine never reads the mode. */
  columns: ReadonlyMap<string, PilePieces> = new Map();

  /** Ids on screen at the last real display; `null` until the first, which is no appearance. */
  private known: ReadonlySet<string> | null = null;
  /** Threads whose pen stroke is still being laid: hidden until this instant, whatever rebuilds. */
  private readonly inking = new Map<string, number>();
  /** **Where the files of my movements just closed last stood** (#362), by troop: the pile at
   *  rest deploys from there. */
  private readonly left = new Map<
    string,
    FilePiece & { readonly road: ReadonlyArray<Vector3>; readonly since: number }
  >();
  fileLeftBy(troopId: string): (FilePiece & { readonly road: ReadonlyArray<Vector3> }) | null {
    return this.left.get(troopId) ?? null;
  }
  /** Kept across displays, which come at every step of any column: a crate falls once. */
  private readonly crates = new Map<string, CratePile>();

  constructor(
    private readonly frame: WorldFrame,
    private readonly ink: InkLayer,
    /** Where a plane leaves a runway or a hull a quay (`EndsOf`), by the board's own points. */
    private readonly ends: EndsOf = () => null,
  ) {}

  setPlayerNation(nation: string | null): void {
    if (nation === this.playerNation) return;
    this.playerNation = nation;
    this.rebuild();
  }

  /** **En Blitz, un avion ne se pose pas** (15/10) : son fil part et s'arrête à sa hauteur. */
  setAloft(aloft: boolean): void {
    if (aloft === this.aloft) return;
    this.aloft = aloft;
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

  /** A movement whose drawing did not change keeps its objects (`drawnKey`): the view is re-served
   *  at every step of any column and at every aim preview, and a pawn is up to three figurines. */
  display(arcs: ReadonlyArray<ArcView>, rebuilding = false): void {
    // Only mine are inked: nothing is added to what a sighting already says (fog). And only what
    // the player sent: a return is created by the resolution, nobody put a pen to it.
    const known = this.known;
    const appeared =
      rebuilding || known === null
        ? []
        : arcs.filter((arc) => arc.state === 'mine' && arc.type !== 'return' && !known.has(arc.id));
    if (!rebuilding) this.known = new Set(arcs.map((arc) => arc.id));
    for (const id of this.inking.keys()) {
      if (!arcs.some((arc) => arc.id === id)) this.inking.delete(id);
    }
    const now = performance.now();
    const clock = Date.now();
    const previous = new Map(this.rendered.map((rendered) => [rendered.arc.id, rendered]));
    this.rendered = [];
    this.targets = [];
    for (const arc of arcs) {
      const key = drawnKey(
        arc,
        this.playerNation,
        this.troops,
        this.columns.get(arc.id) ?? null,
        this.motion !== 'off',
        clock,
      );
      let rendered = previous.get(arc.id);
      previous.delete(arc.id);
      if (rendered?.key !== key) {
        if (rendered) release(rendered);
        rendered = this.build(arc, key, appeared.includes(arc), now, clock);
      }
      rendered.arc = arc;
      rendered.loadingUntil = loadingUntilOf(arc);
      this.headPositions.set(arc.id, rendered.headPosition);
      this.pawnById.set(arc.id, rendered.pawn);
      this.aheadPositions.set(arc.id, rendered.aheadPosition);
      this.targets.push(...rendered.thread.targets);
      this.rendered.push(rendered);
    }
    for (const [troopId, { since }] of this.left)
      if (now - since > LEFT_MS) this.left.delete(troopId);
    for (const gone of previous.values()) {
      const file = gone.pawn.lastFile();
      for (const piece of file?.pieces ?? [])
        this.left.set(piece.troopId, { ...piece, road: file!.road, since: now });
      release(gone);
      this.headPositions.delete(gone.arc.id);
      this.aheadPositions.delete(gone.arc.id);
      this.pawnById.delete(gone.arc.id);
    }
    this.syncCrates();
    this.applyAccent();
    this.animate();
  }

  private build(
    arc: ArcView,
    key: string,
    appearing: boolean,
    now: number,
    clock: number,
  ): RenderedArc {
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
      {
        aloft: this.aloft,
        ...(this.motion !== 'off' ? { ends: this.ends } : {}),
        ...(arc.state === 'mine' && arc.airdrop !== undefined ? { airdrop: arc.airdrop } : {}),
      },
    );
    thread.setResolution(this.width, this.height);
    thread.setScale(this.unitsPerPixel);
    this.group.add(thread.object);
    for (const target of thread.targets) target.userData.arc = arc.id;

    const roles = movementRoles(arc);
    const column = arc.state === 'mine' ? this.columnOf(arc.id) : null;
    const figurineOf = (role: UnitRole | null) =>
      role === null ? null : figurineFor(this.playerNation, role, [1, 1, 1]);
    const pawn = new Pawn(
      ARC_COLORS[arc.state].progress,
      // The fog serves an enemy no roles: up close it is an ink annotation, sliding along
      // its stretch (F2, ADR 0026 §4 révisé), dated by its first observation (H3).
      arc.state === 'enemyDetected'
        ? {
            land: annotationFigurine('land', arc.since),
            sea: annotationFigurine('sea', arc.since),
            air: annotationFigurine('air', arc.since),
          }
        : roles && {
            land: column === null ? figurineOf(roles.land) : null,
            sea: figurineOf(roles.sea),
            air: figurineOf(roles.air),
          },
      movementWear(arc, this.troops),
      roles,
      column,
    );
    pawn.visible = !stale;
    this.group.add(pawn.object);

    if (appearing) {
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
      relic = inkAnnotation(
        relicMedium,
        arc.lastSeenAt,
        minutesSince(arc.lastSeenAt, clock),
      ).object;
      pointOnLeg(lastLeg, 1, relic.position);
      relic.visible = false;
      this.group.add(relic);
    }

    return {
      key,
      arc,
      thread,
      unrolled: unrollRoute(arc.route),
      pawn,
      relic,
      headPosition: new Vector3(),
      aheadPosition: new Vector3(),
      ink: lastKnownInk(arc, clock),
      rest: thread.legs.length === 0 ? this.frame.projectLonLat(arc.to, COUNTRY_THICKNESS) : null,
      loadingUntil: null,
    };
  }

  /** My movement's pieces on land, dressed whole or not at all (`dressedGroups`). */
  private columnOf(id: string): ReadonlyArray<ColumnPiece> | null {
    const pieces = this.columns.get(id);
    const figurines = pieces === undefined ? null : dressedGroups(this.playerNation, pieces);
    if (pieces === undefined || figurines === null) return null;
    return pieces.groups.map(({ role, wear, troopIds }, k) => ({
      figurine: figurines[k]!,
      role,
      wear,
      troopId: troopIds[0]!,
    }));
  }

  /** Un fil affiché n'est jamais immobile : ses tirets dérivent vers l'arrivée et son pion
   *  marche. Tant qu'il y en a un, la boucle demande une image par pas de fil (`flowPaceOf`,
   *  `frame-demand.ts`), pas une à chaque rafraîchissement. */
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
      const distance =
        drawnHit(ray, pawn.object) ?? (pawn.standing ? leastHit(ray, pawn.object.position) : null);
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
  animate(camera?: Camera, unitsPerPixel?: number, yaw?: number, inView?: Frustum): void {
    if (camera) this.cameraPosition.copy(camera.position);
    if (inView !== undefined) this.inView = inView;
    if (yaw !== undefined) this.cameraYaw = yaw;
    if (unitsPerPixel !== undefined) this.unitsPerPixel = unitsPerPixel;

    const now = performance.now();
    const clock = Date.now();
    const sinceLastFrame = this.lastFrameMs === 0 ? 0 : now - this.lastFrameMs;
    const elapsed = sinceLastFrame / 1000;
    this.lastFrameMs = now;

    for (const rendered of this.rendered) {
      if (rendered.relic !== null) {
        const scale = troopScale(
          rendered.relic.position.distanceTo(this.cameraPosition),
          ANONYMOUS_SPAN,
        );
        rendered.relic.visible = scale > 0;
        rendered.relic.scale.setScalar(scale);
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

      // The share walked is read from the hour (#183): the arc carries the server's dates and
      // keeps its identity from one answer to the next, so no answer moves a pawn.
      const position = temporalPosition(rendered.unrolled, arcProgressAt(rendered.arc, clock));
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
      rendered.pawn.place(
        this.pawnPoint,
        this.aheadPoint,
        this.groundPoint.y,
        turn,
        roadOf(rendered.thread.legs, position, leg, local),
      );
      rendered.pawn.step(this.motion === 'full' ? elapsed : null, this.motion === 'reduced');
      rendered.pawn.orient(this.cameraPosition, this.cameraYaw, this.inView);
      rendered.headPosition.copy(this.pawnPoint);
      rendered.aheadPosition.copy(this.aheadPoint);

      if (rendered.thread.tether !== null)
        stretchTether(rendered.thread.tether, this.pawnPoint, this.groundPoint);

      const pile = this.crates.get(rendered.arc.id);
      if (pile !== undefined && rendered.loadingUntil !== null) {
        pile.update(loadingAt(rendered.loadingUntil, clock).crates, now, this.motion === 'full');
        pile.place(this.groundPoint, this.cameraPosition);
      }
    }
    if (now - this.inkReadMs >= HEARTBEAT_MS) this.fadeLastKnown(now, clock);
  }

  /**
   * **Une dernière position connue pâlit avec l'heure, pas avec la réponse** (#183) : l'arc
   * garde son identité d'une réponse à l'autre, et `display` ne tourne plus qu'avec un arc ou une
   * troupe qui change. Son encre se relit donc au battement de la boucle — une image par seconde
   * au plus, qui tourne déjà, animations coupées comprises, et jamais en onglet caché.
   */
  private fadeLastKnown(now: number, clock: number): void {
    this.inkReadMs = now;
    if (this.rendered.some((rendered) => rendered.ink !== lastKnownInk(rendered.arc, clock)))
      this.display(
        this.rendered.map((rendered) => rendered.arc),
        true,
      );
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

  /** A rebuild is a change of geometry — the player's nation landed — never a change of hour:
   *  nothing new appears, so nothing is inked. */
  rebuild(): void {
    const arcs = this.rendered.map((rendered) => rendered.arc);
    this.clear();
    this.display(arcs, true);
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
    for (const rendered of this.rendered) release(rendered);
    this.rendered = [];
    this.targets = [];
    this.headPositions.clear();
    this.aheadPositions.clear();
    this.pawnById.clear();
  }
}

/** A closed file waits this long for its pile to stand (`SORTIE_WAIT_MS` and a beat). */
const LEFT_MS = 3000;

function release({ thread, pawn, relic }: RenderedArc): void {
  thread.dispose();
  pawn.dispose();
  if (relic) eraseAnnotation(relic);
}

/**
 * **What a movement draws**, beyond what the loop advances (progress, loading): the nation
 * dressing it, its state, route and end, its roles and wear, the hour its annotation writes and
 * the ink a last known position fades to — read like `CampLayer`'s, by what shows, not by instants.
 */
function drawnKey(
  arc: ArcView,
  nation: string | null,
  troops: ReadonlyArray<TroopView>,
  column: PilePieces | null,
  lead: boolean,
  clock: number,
): string {
  return JSON.stringify([
    nation,
    lead,
    arc.state,
    arc.to,
    arc.route,
    movementRoles(arc),
    movementWear(arc, troops),
    // What rides aboard does not show: the file draws its standing pieces only.
    column?.groups.map(({ role, figures, wear }) => [role, figures, wear]) ?? null,
    arc.state === 'enemyDetected' ? asClockTime(arc.since) : null,
    arc.state === 'lastKnown' ? [asClockTime(arc.lastSeenAt), lastKnownInk(arc, clock)] : null,
  ]);
}

/**
 * **The leg a file is laid out on**: the one the head walks, or at a quay the land leg that
 * begins there — a column landed waits gathered on the shore, never strung out on the water
 * behind it. `null` at a quay toward the sea or the sky: the file is not worn there.
 */
function roadOf(
  legs: ReadonlyArray<ThreadLeg>,
  position: TemporalPosition,
  leg: ThreadLeg | undefined,
  local: number,
): Road | null {
  if (position.kind === 'leg') return leg === undefined ? null : { leg, local };
  const next = legs[position.legIndex];
  return next?.medium === 'land' ? { leg: next, local: 0 } : null;
}

const minutesSince = (at: number, clock: number): number => Math.max(0, clock - at) / 60_000;

const lastKnownInk = (arc: ArcView, clock: number): string | null =>
  arc.state === 'lastKnown' ? surveyInk(minutesSince(arc.lastSeenAt, clock)).toFixed(2) : null;

/**
 * **The medium a last known position's annotation is written in, or `null` for none** (F2):
 * the end of the frozen stretch, in what the sighting served — a point and a medium, nothing more.
 * A column still watched has its pawn; mine never goes stale.
 */
export function lastKnownMedium(arc: ArcView): Medium | null {
  return arc.state === 'lastKnown' ? (arc.route.legs.at(-1)?.medium ?? null) : null;
}
