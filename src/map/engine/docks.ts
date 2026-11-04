import type { MapMotion } from '@/domain/map-motion';
import type { Sequence, SequenceHost, SequenceLayer } from './sequences';
import { loadingAt, MAX_CRATES } from './timelines/loading';

type Plan = Parameters<typeof loadingAt>[0];

/** **A truck at a quay** (#271): its plan, its clock, and the times its quay reads. */
export type Docked = {
  readonly since: number;
  readonly siteId: string;
  readonly plan: Plan;
  /** A load signalled before the tailgate starts up joins this one. */
  readonly gateUp: number;
  /** It starts back into its place: the next truck may leave its own. */
  readonly homeAt: number;
  /** Its site's sequence ends: until then, truck and quay play together or not at all. */
  readonly siteMs: number;
  /** **A truck on a tour** (#278): lent by its pawn, not by a pile. */
  readonly onArc?: true;
};

/** A load waits so long for its pile to stand, from when its quay is free. `@a-mesurer` */
export const LOADING_WAIT_MS = 15_000;
/** A joined crate jumps no sooner than this after its signal. */
const JOIN_MS = 100;
/** The two pieces a loading plays: none starts if the room lacks either. */
const LOADING_ROOM = 2;

/** **Docks a truck**: its entry, from the timelines its plan lays out. */
export function dockedOf(plan: Plan, siteId: string, since: number, onArc = false) {
  const laid = loadingAt(plan);
  const docked: Docked = {
    since,
    siteId,
    plan,
    gateUp: laid.gateUp,
    homeAt: laid.homeAt,
    siteMs: laid.site.ms,
    ...(onArc ? { onArc: true as const } : {}),
  };
  return { docked, truck: laid.truck, site: laid.site };
}

/** **All or nothing**: a loading starts only with room for both pieces, and both seen. */
export const mayDock = (room: number, truckSeen: boolean, siteSeen: boolean): boolean =>
  room >= LOADING_ROOM && truckSeen && siteSeen;

/** **One quay, one file**: taken from a truck's start to when it backs into its place. */
export function quayTaken(docked: ReadonlyMap<string, Docked>, siteId: string, now: number) {
  for (const entry of docked.values())
    if (entry.siteId === siteId && now - entry.since < entry.homeAt) return true;
  return false;
}

/** **A second load joins the first** while its tailgate is down: so many more crates, on its
 *  clock; `null` once the tailgate starts up — it waits for the quay as another truck. */
export function joinedOf(entry: Docked, crates: number, now: number) {
  const t = now - entry.since;
  if (t >= entry.gateUp) return null;
  const plan = {
    ...entry.plan,
    crates: [...entry.plan.crates, ...Array<number>(crates).fill(t + JOIN_MS)].slice(0, MAX_CRATES),
  };
  return dockedOf(plan, entry.siteId, entry.since);
}

/** What a waiting load does this frame: plays, waits for its pile, or waits for its quay. */
export type Attempt = 'done' | 'wait' | 'queued';

/** **The loads still waiting**: one queued behind a quay counts its wait from the quay's freeing. */
export function stillWaiting<L extends { readonly since: number }>(
  loadings: ReadonlyArray<L>,
  now: number,
  attempt: (loading: L) => Attempt,
): L[] {
  return loadings.flatMap((loading) => {
    const outcome = attempt(loading);
    if (outcome === 'done') return [];
    if (outcome === 'queued') return [{ ...loading, since: now }];
    return now - loading.since < LOADING_WAIT_MS ? [loading] : [];
  });
}

/**
 * **What a tour's truck does at its quay now** (#278): nothing with motion off or its building
 * not drawn, a ring at reduced motion, a file at the socle's foot while the quay is taken
 * (`LOADING_WAIT_MS` from its signal at most), a wait while it or its site is not drawn yet;
 * else it docks.
 */
export function tourStepOf(
  motion: MapMotion,
  at: {
    readonly built: boolean;
    readonly site: boolean;
    readonly busy: boolean;
    readonly drawn: boolean;
  },
  since: number,
): 'nothing' | 'ring' | 'wait' | 'dock' | { readonly holdUntil: number } {
  if (motion === 'off' || !at.built) return 'nothing';
  if (motion === 'reduced') return 'ring';
  if (!at.site) return 'wait';
  if (at.busy) return { holdUntil: since + LOADING_WAIT_MS };
  return at.drawn ? 'dock' : 'wait';
}

/** **The tours held at their foot that run on now** (#278): their truck neither plays nor waits
 *  for its quay — played out, refused, or tired of waiting. */
export function toursLetGo(
  held: Iterable<string>,
  playing: (arcId: string) => boolean,
  waiting: ReadonlyArray<{ readonly cue: { readonly arcId: string } }>,
): string[] {
  return [...held].filter((id) => !playing(id) && !waiting.some(({ cue }) => cue.arcId === id));
}

const ENDED: Sequence = { ms: 0, at: () => ({}) };

/** **A truck and its quay end together** until its site's end: one ended early (out of the
 *  field, too small, taken in hand, its site razed) ends the other — no crate jumps into a truck
 *  that is not there. After it, the truck drives home alone; its entry goes with it. */
export function undock(
  docked: Map<string, Docked>,
  layer: Pick<SequenceLayer, 'playsOn' | 'retime'>,
  hosts: {
    readonly truck: SequenceHost;
    readonly site: SequenceHost;
    /** Where a truck on a tour is lent from (#278). */
    readonly arc?: SequenceHost;
  },
  now: number,
): void {
  for (const [groupId, entry] of docked) {
    const host = entry.onArc && hosts.arc ? hosts.arc : hosts.truck;
    const truck = layer.playsOn(host, groupId);
    if (now - entry.since >= entry.siteMs) {
      if (!truck) docked.delete(groupId);
      continue;
    }
    const site = layer.playsOn(hosts.site, entry.siteId);
    if (truck && site) continue;
    if (truck) layer.retime(host, groupId, ENDED);
    if (site) layer.retime(hosts.site, entry.siteId, ENDED);
    docked.delete(groupId);
  }
}
