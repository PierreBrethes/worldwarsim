import { Vector3 } from 'three';
import type { UnitRole } from '@/domain/ids';
import type { RigFamily } from '@/emblems/rigs';
import type { PartPose, Pose, Sequence } from './sequences';
import {
  AIR,
  type AirRole,
  doorCourse,
  hangarOf,
  AIRFIELD_LANES,
  laneOf,
  type Spot,
  type Track,
} from './timelines/airfield';
import {
  craneAt,
  craneParts,
  craneToward,
  craneVisit,
  HOOK_ABAFT_STEM,
  PORT_CRANE,
} from './timelines/at-rest';
import { type Berth, hauling, type HullTrack, type SeaRole } from './timelines/port';
import type { HullPost, Rest } from './timelines/rest';
import { troopMetres } from '@/domain/piece-size';
import { ease, span } from './timelines/curves';
import { WALK_MIN_PX } from './timelines/walk';
import { MOORING_MS } from './mooring';

/** A site's frame on the board (`MaquetteLayer.siteOf`). */
type Frame = { toBoard(point: Vector3): Vector3; toModel(point: Vector3): Vector3 };

export const isAirRole = (role: UnitRole): role is AirRole => role in AIR;
export const isSeaRole = (role: UnitRole): role is SeaRole =>
  role === 'cargo' || role === 'escort' || role === 'carrier';

/** **A piece at rest on the board, in its site's metres**: where it stands and its heading. */
export function spotOf(site: Frame, at: Vector3, front: Vector3): Spot & { yaw: number } {
  const here = site.toModel(at);
  const ahead = site.toModel(at.clone().add(front)).sub(here);
  return { x: here.x, z: here.z, yaw: Math.atan2(ahead.x, ahead.z) };
}

/** **The gear folds** (`gear`, 0 down, 1 up): in toward the belly for a fighter, back for the
 *  others (storyboard). Axes and course `@a-mesurer` until the models are read for it. */
function gearPose(role: AirRole, gear: number): Record<string, PartPose> {
  if (gear <= 0) return {};
  const fold = (Math.PI / 2) * gear;
  return AIR[role].fold === 'in'
    ? {
        gear_left: { turn: [0, 0, fold] },
        gear_right: { turn: [0, 0, -fold] },
        tailwheel: { turn: [-fold, 0, 0] },
      }
    : {
        gear_left: { turn: [-fold, 0, 0] },
        gear_right: { turn: [-fold, 0, 0] },
        tailwheel: { turn: [-fold, 0, 0] },
      };
}

/**
 * **A track in the site's metres played on a piece standing at `rest`** (#269, #270): its root
 * travels on the board, heads and pitches as the track says; a plane folds its gear. `fade`, 0 to
 * 1, how much of it stands (a hull dressing on its slip).
 */
export function trackSequence(
  site: Frame,
  track: Track | HullTrack,
  rest: Vector3,
  role: UnitRole,
  articulated: boolean,
  fade?: (ms: number) => number,
): Sequence {
  const air = isAirRole(role) ? role : null;
  const family = articulated && air !== null ? (air as RigFamily) : undefined;
  return {
    ...(family === undefined ? {} : { family }),
    ms: track.ms,
    // As long as its piece stands, like a walk out of a door: the site plays as far.
    minPx: WALK_MIN_PX,
    at(t): Pose<RigFamily> {
      const q = track.at(t);
      const at = site.toBoard(new Vector3(q.x, q.y, q.z));
      const ahead = site
        .toBoard(new Vector3(q.x + Math.sin(q.yaw), q.y, q.z + Math.cos(q.yaw)))
        .sub(at);
      const root: PartPose = {
        travel: at.clone().sub(rest).toArray(),
        heading: Math.atan2(ahead.x, ahead.z),
        pitch: q.pitch,
        ...(fade === undefined ? {} : { fade: fade(t) }),
      };
      const gear =
        air !== null && family !== undefined && 'gear' in q ? gearPose(air, q.gear as number) : {};
      return { root, ...gear } as Pose<RigFamily>;
    },
  };
}

/** **The gap between two planes formed together**, from one leaving its hangar to the next.
 *  `@a-mesurer` */
export const FORMATION_STAGGER_MS = 2500;
/** **The gap between two hulls putting to sea together**, the outer one first. `@a-mesurer` */
export const UNDOCK_STAGGER_MS = 3500;
/** **How long the hull at the mole's side waits before it is hauled up**, when the one at the
 *  mole puts to sea: it is backing out of the basin. `@a-mesurer` */
export const HAUL_LEAD_MS = 8000;

/** **A piece that waits its turn** (#487): for `lead` ms it stands at its start — unseen (`hidden`,
 *  a piece not yet born) or where it lay —, then it plays from there. */
export function delayed(sequence: Sequence, lead: number, hidden = true): Sequence {
  if (lead <= 0) return sequence;
  return {
    ...sequence,
    ms: sequence.ms + lead,
    at(t) {
      const pose = sequence.at(Math.max(0, t - lead));
      return t >= lead || !hidden ? pose : { ...pose, root: { ...pose.root, fade: 0 } };
    },
  };
}

/** One hangar's doors: its lane, how open they are at `ms`. */
export type Doors = { readonly lane: number; open(ms: number): number };

/** **The airfield while a plane moves on it** (#269): its runway lit by night (the copy's own
 *  lamps, `MaquetteLayer.standIn`), and the doors of each hangar a new plane comes out of. */
export function airfieldSequence(
  ms: number | (() => number),
  doors: Doors | ReadonlyArray<Doors> = [],
): Sequence<'airfield'> {
  const hangars = 'lane' in doors ? [doors] : doors;
  return {
    family: 'airfield',
    pool: 'site',
    // A function: the lights stay on as long as the last plane queued on the runway needs them.
    get ms() {
      return typeof ms === 'number' ? ms : ms();
    },
    minPx: WALK_MIN_PX,
    at(t) {
      const pose: Record<string, PartPose> = {};
      // A hangar's doors may come from several orders (#478): the most open one rules.
      const opened = new Map<number, number>();
      for (const { lane, open } of hangars)
        opened.set(laneOf(lane), Math.max(opened.get(laneOf(lane)) ?? 0, open(t)));
      for (const [lane, open] of opened) {
        const suffix = hangarOf(lane);
        const { inner, outer } = doorCourse(open);
        // The left leaves run to +x, the right to -x (storyboard).
        const by = (x: number): PartPose => ({ shift: [x, 0, 0] });
        pose[`porte_gauche_1${suffix}`] = by(inner);
        pose[`porte_gauche_2${suffix}`] = by(outer);
        pose[`porte_droite_1${suffix}`] = by(-inner);
        pose[`porte_droite_2${suffix}`] = by(-outer);
      }
      return pose as Pose<'airfield'>;
    },
  };
}

/**
 * **One door set for the planes of a hangar, formed one after the other** (#487): it opens at the
 * first, holds while the others roll out, and shuts behind the last. Each plane is its own
 * `doors` (how open at `ms` of its track), its `lead`, and `closing`, where its doors start to
 * shut, in ms.
 */
export function doorsOf(
  planes: ReadonlyArray<{ lead: number; doors(ms: number): number; closing: number }>,
): (ms: number) => number {
  const first = planes[0]!;
  const last = planes.at(-1)!;
  return (ms) =>
    ms < last.lead + last.closing
      ? first.doors(Math.min(ms - first.lead, first.closing))
      : last.doors(ms - last.lead);
}

/** The six shores of the slip, by name. */
const SHORES = [1, 2, 3, 4, 5, 6] as const;
/** How far a shore tips over as it falls. */
const SHORE_FALL = (77 * Math.PI) / 180;

/** A hull launched at `lead` ms, for `ms`: its slip's cradle and shores (`launch`). */
type Launched = {
  readonly lead: number;
  readonly ms: number;
  dressed(ms: number): number;
  shores(ms: number, k: number): number;
};

/** **The port while hulls are launched, one after the other** (#270, #487): the hull on its slip
 *  gives way to the one produced, its shores fall outward one after another; a new hull is dressed
 *  on the slip, its shores standing, when the next launch starts. */
export function slipSequence(launches: ReadonlyArray<Launched>): Sequence<'port'> {
  const last = launches.at(-1)!;
  return {
    family: 'port',
    pool: 'site',
    ms: last.lead + last.ms,
    minPx: WALK_MIN_PX,
    at(t) {
      // The launch under way: the last one begun; before the first, the cradle stands.
      const now = launches.filter(({ lead }) => lead <= t).at(-1) ?? launches[0]!;
      const τ = t - now.lead;
      const pose: Record<string, PartPose> = { coque_cale: { fade: 1 - now.dressed(τ) } };
      // The first three stand on -x, the others on +x: each falls away from the hull.
      for (const k of SHORES)
        pose[`accore_${k}`] = {
          turn: [0, 0, (k <= 3 ? 1 : -1) * SHORE_FALL * now.shores(τ, k - 1)],
        };
      return pose as Pose<'port'>;
    },
  };
}

/** The share of a take-off spent flying home when its thread is not moored to the runway.
 *  `@a-mesurer` */
const HOMING_SHARE = 0.35;

/**
 * **A take-off on a flight too short to moor its thread** (#269, Pierre's decision): the plane
 * still rolls and lifts off its runway, then flies back to its pawn, where the thread leaves from
 * the pile as before the lot.
 */
export function homing(sequence: Sequence): Sequence {
  const from = sequence.ms * (1 - HOMING_SHARE);
  return {
    ...sequence,
    at(t) {
      const pose = sequence.at(t);
      const travel = pose.root?.travel;
      if (t <= from || travel === undefined) return pose;
      const keep = 1 - ease.inOut(span(t, from, sequence.ms));
      return {
        ...pose,
        root: { ...pose.root, travel: [travel[0] * keep, travel[1] * keep, travel[2] * keep] },
      };
    },
  };
}

/**
 * **A landing or a docking on a way too short to moor its thread** (#269, #270): the piece starts
 * where its pawn came in, `from` its rest, and joins its track over its first part, the reverse of
 * `homing`. `inward`, a hull never sails farther out than its pawn stood (#521): it joins its
 * track at its point nearest the pawn among those no farther out, instead of backing out to its
 * offshore and off the screen.
 */
export function arriving(
  sequence: Sequence,
  from: NonNullable<PartPose['travel']>,
  inward = false,
): Sequence {
  const near = Math.hypot(...from);
  // ponytail: sampled, 1/200 of the way.
  let join = 0;
  for (let k = 0, best = Infinity; inward && k <= 200; k++) {
    const t = (sequence.ms * k) / 200;
    const at = sequence.at(t).root?.travel ?? [0, 0, 0];
    const gap = Math.hypot(at[0] - from[0], at[1] - from[1], at[2] - from[2]);
    if (Math.hypot(...at) <= near && gap < best) [best, join] = [gap, t];
  }
  const until = Math.max(sequence.ms * HOMING_SHARE, join);
  return {
    ...sequence,
    at(t) {
      const pose = sequence.at(Math.max(t, join));
      const travel = pose.root?.travel;
      if (t >= until || travel === undefined) return sequence.at(t);
      const k = ease.inOut(span(t, 0, until));
      const mix = (a: number, b: number) => a + (b - a) * k;
      return {
        ...pose,
        root: {
          ...pose.root,
          travel: [mix(from[0], travel[0]), mix(from[1], travel[1]), mix(from[2], travel[2])],
        },
      };
    },
  };
}

/** **A flight or a voyage shorter than so many of its offsets** is not moored to its runway or
 *  its offshore (#269, #270): the site's way out would eat it whole. `@a-mesurer` */
const MOORED_CHORDS = 3;

type Flat = { readonly x: number; readonly z: number };
const apart = (a: Flat, b: Flat) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * **Whether a thread at a site's point `at` moors at the site's `end`** (its runway's end, its
 * offshore): never under a theatre, where distances are shares of it (Blitz); not on a way
 * whose other end `far` is too near; always when nothing says where it goes.
 */
export function moors(at: Flat, end: Flat, far: Flat | null, blitz: boolean): boolean {
  if (blitz) return false;
  return far === null || apart(far, at) >= MOORED_CHORDS * apart(end, at);
}

/** **Whether a departure plays** (#269, #270): a hull with no offshore to sail to keeps its berth,
 *  a plane takes off whatever its flight. */
export const departs = (air: boolean, moored: boolean): boolean => air || moored;

/** Hulls cued within this of each other put to sea together (#487). `@a-mesurer` */
export const DEPARTURE_WINDOW_MS = 1000;

/** The hangars' lanes by their nearness to the runway's free end: the right one, then the left. */
const laneRank = (x: number): number => (AIRFIELD_LANES as readonly number[]).indexOf(laneOf(x));

/** **Planes leave one after the other** (#478): the right lane before the left, in a lane the
 *  place in front (the most advanced, `z`) before the one at the back. */
export const inFormationOrder = <T extends { readonly x: number; readonly z: number }>(
  parts: ReadonlyArray<T>,
): T[] => [...parts].sort((a, b) => laneRank(a.x) - laneRank(b.x) || b.z - a.z);

/** **Planes come home in the reverse order** they leave in: the back of the left lane first. */
export const landingOrder = <T extends { readonly x: number; readonly z: number }>(
  parts: ReadonlyArray<T>,
): T[] => inFormationOrder(parts).reverse();

/** **Past so many planes in a queue**, the others stand at their place, as one past
 *  `MAX_PLAYING` does (#478). `@a-mesurer` */
export const QUEUE_MAX = 3;

/** One plane's turn on the runway: when it is on it (`align`) and when it has left it (`free`,
 *  off the ground, or off the runway), in ms of its own track. */
type Slot = { readonly align: number; readonly free: number };

/**
 * **When each plane of a queue starts** (#478): the next is on the runway as the one before leaves
 * it, so only one is on it at a time, and never starts before the one before.
 */
export function queueLeads(slots: ReadonlyArray<Slot>, busy = 0): number[] {
  const leads: number[] = [];
  for (const [k, { align }] of slots.entries()) {
    const before = slots[k - 1];
    leads.push(
      before === undefined
        ? Math.max(0, busy - align)
        : leads[k - 1]! + Math.max(0, before.free - align),
    );
  }
  return leads;
}

/** **How long the plane that lands after `queue` waits** (#478): `busy` ms, the runway taken
 *  still by what landed or took off before; `null` past `QUEUE_MAX`, it stands at its place. */
export const landingLead = (queue: ReadonlyArray<Slot>, mine: Slot, busy = 0): number | null =>
  queue.length >= QUEUE_MAX ? null : queueLeads([...queue, mine], busy).at(-1)!;

/** **How far short of its thread's start each plane of a queue stops on it** (#478, « en file à
 *  30 m »), by rank. `@a-mesurer` */
export const THREAD_GAP_M = 30;

/** A plane cued to take off: where it rests, and its slot. */
export type Departing = Slot & { readonly x: number; readonly z: number };
export type Waiting = Departing & { readonly since: number };

/**
 * **How long a plane waits to take off** (#478, calqué sur `undockLead`): the planes of the same
 * airfield cued within `DEPARTURE_WINDOW_MS` that leave before it make a queue, the right lane
 * first. `null` past `QUEUE_MAX`: it leaves by its thread, with no takeoff.
 */
export function takeoffLead(
  mine: Waiting,
  others: ReadonlyArray<Waiting>,
  busy = 0,
): { lead: number; turn: number } | null {
  const line = inFormationOrder([
    mine,
    ...others.filter(({ since }) => Math.abs(since - mine.since) < DEPARTURE_WINDOW_MS),
  ]);
  const turn = line.indexOf(mine);
  return turn >= QUEUE_MAX ? null : { lead: queueLeads(line, busy)[turn]!, turn };
}

/** **When the `turn`th piece formed leaves**, from the first's start (#487). */
export const formationLead = (turn: number): number => turn * FORMATION_STAGGER_MS;

/** **When a hull is launched**: when the ones launched before it are moored (#487). */
export const launchLead = (before: ReadonlyArray<{ readonly ms: number }>): number =>
  before.reduce((sum, each) => sum + each.ms, 0);

/** **The least a hull that comes home waits before its approach**, and **how long a hull takes to
 *  moor** once it touches: four lines at 0,3 s and the last 0,4 s (storyboard `port`, « À couple »,
 *  `commun/port.js`, scénario `suite`). `@a-mesurer` */
const DOCK_MIN_LEAD_MS = 2400;

/**
 * **When hulls that come home together dock** (#477, « À couple »): each touches when the one
 * before is moored, but not sooner than `DOCK_MIN_LEAD_MS` after the order. `docks` is each hull's
 * approach, in ms to its touch; the result is, for each, its `lead` (its approach starts then) and
 * the instant `touch` it touches, from the first order.
 */
export function dockLeads(
  docks: ReadonlyArray<{ readonly ms: number }>,
): Array<{ lead: number; touch: number }> {
  const out: Array<{ lead: number; touch: number }> = [];
  for (const [n, { ms }] of docks.entries()) {
    const before = out[n - 1];
    const lead =
      before === undefined ? 0 : Math.max(DOCK_MIN_LEAD_MS, before.touch + MOORING_MS - ms);
    out.push({ lead, touch: lead + ms });
  }
  return out;
}

/**
 * **The crane's visit to the hull that touches the mole** (#477): the crane goes on with its loop
 * `loop0` seconds in (`null`: it stood at rest) until the hull touches, `touch` ms after the
 * sequence starts, then its jib comes over the hull's fore deck, the hook goes down, and it goes
 * back to its rest, where its loop starts again at its phase 0. `null` for a hull that is not at
 * the mole, or whose fore deck the jib cannot reach: the crane keeps its loop.
 */
export function craneSequence(
  hull: {
    readonly post: HullPost | null;
    readonly length: number;
    readonly x: number;
    readonly z: number;
    readonly yaw: number;
  },
  touch: number,
  loop0: number | null,
): Sequence<'port'> | null {
  if (hull.post !== 'mole') return null;
  const { rig, ring } = PORT_CRANE;
  const abaft = hull.length / 2 - HOOK_ABAFT_STEM;
  const to = craneToward(rig, {
    x: hull.x + abaft * Math.sin(hull.yaw) - ring.x,
    z: hull.z + abaft * Math.cos(hull.yaw) - ring.z,
  });
  if (to === null) return null;
  const loop = (ms: number) => (loop0 === null ? craneAt(0, rig) : craneAt(loop0 + ms / 1000, rig));
  const visit = craneVisit(rig, loop(touch), to);
  return {
    family: 'port',
    pool: 'site',
    ms: touch + visit.ms,
    minPx: WALK_MIN_PX,
    at: (t) => craneParts(rig, t < touch ? loop(t) : visit.at(t - touch)) as Pose<'port'>,
  };
}

/** **Two sequences of one site played as one** (a site plays one at a time): the parts of each
 *  move as it says, until the longer is done. */
export function alongside<F extends RigFamily>(a: Sequence<F>, b: Sequence<F>): Sequence<F> {
  return { ...a, ms: Math.max(a.ms, b.ms), at: (t) => ({ ...a.at(t), ...b.at(t) }) };
}

/** The order hulls put to sea in: the roads first, the side next, the mole last. */
const SAILS: Readonly<Record<HullPost, number>> = { roads: 0, couple: 1, mole: 2 };

/**
 * **How long a hull waits to put to sea** (#487, storyboard « l'ordre s'inverse »): one stagger for
 * each other hull of the same port cued within `DEPARTURE_WINDOW_MS` that sails before it — the
 * roads, then the side, then the mole. A hull with no post known waits for none.
 */
export function undockLead(
  mine: { readonly post: HullPost | null; readonly since: number },
  others: ReadonlyArray<{ readonly post: HullPost | null; readonly since: number }>,
): number {
  if (mine.post === null) return 0;
  const first = SAILS[mine.post];
  const ahead = others.filter(
    ({ post, since }) =>
      post !== null && Math.abs(since - mine.since) < DEPARTURE_WINDOW_MS && SAILS[post] < first,
  );
  return ahead.length * UNDOCK_STAGGER_MS;
}

/** **Where a piece took off or put to sea from**: its remembered rest when it was at this site,
 *  else `null` — the left lane, the mole's berth, as before the lot (#487). */
export const restAt = (
  kept: { readonly site: string; readonly rest: Rest } | null,
  siteId: string,
): Rest | null => (kept !== null && kept.site === siteId ? kept.rest : null);

/** **What a cue's groups say about the sequence** (#487): `null` while one is not yet laid out
 *  (`wait`), else the indices of those with a place — a piece with none (`unposted`) is skipped
 *  and nothing is retried. */
export function playable(states: ReadonlyArray<'ready' | 'unposted' | 'wait'>): number[] | null {
  if (states.includes('wait')) return null;
  return states.flatMap((state, k) => (state === 'ready' ? [k] : []));
}

/** **The ring of ink under each piece that arrives at reduced motion** (#487, 0.6 s). */
export const arrivalRings = <P>(
  parts: ReadonlyArray<{ readonly role: UnitRole; readonly at: P }>,
  metre: number,
): Array<{ at: P; radius: number }> =>
  parts.map(({ role, at }) => ({ at, radius: (troopMetres(role) / 2) * metre }));

/** **The hull at the mole's side is hauled up to the mole** (#487): it holds where it lay while
 *  the one at the mole puts to sea (`HAUL_LEAD_MS`), then is hauled across. */
export function haulSequence(
  site: Frame,
  role: SeaRole,
  from: Rest,
  to: Rest,
  rest: Vector3,
): Sequence {
  const track = hauling(role, from as Berth, to as Berth);
  return delayed(trackSequence(site, track, rest, role, false), HAUL_LEAD_MS, false);
}
