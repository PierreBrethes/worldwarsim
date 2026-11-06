import type { Sequence } from './sequences';
import {
  airfieldSequence,
  DEPARTURE_WINDOW_MS,
  type Departing,
  type Doors,
  landingLead,
  takeoffLead,
  type Waiting,
} from './site-ways';
import type { HullPost } from './timelines/rest';

/** A movement cued to leave an airfield or a port, once it plays (#487, #478). */
export type Departure = {
  readonly arcId: string;
  readonly site: string;
  readonly post: HullPost | null;
  readonly since: number;
  readonly plane?: Departing;
};

/** Where the lights of an airfield are played: if they are on already, and a way to light them. */
export type LightHost = {
  playing(): boolean;
  play(sequence: Sequence<'airfield'>): boolean;
};

type Use = { site: string; kind: 'depart' | 'land'; since: number; busy: number };
type Lit = { start: number; end: number; doors: Doors[] };

/**
 * **Who holds each runway, and the lights that are on** (#478): the state that lives across cues,
 * on the clock of the orders' `since`. A plane takes off or lands when the one before has left
 * the runway, whichever cue it came by; the lights stay on to the last plane queued.
 */
export class Runways {
  private uses: Use[] = [];
  private lit = new Map<string, Lit>();
  private played: Departure[] = [];

  /** **How long the runway of `site` is held** from `since`, in ms, by planes that took off or
   *  landed before. A takeoff ordered within the window of `since` is a plane of its queue,
   *  already counted (`keepWindow`). */
  busyFor(site: string, since: number, keepWindow: boolean): number {
    return this.uses
      .filter(
        (each) =>
          each.site === site &&
          !(
            keepWindow &&
            each.kind === 'depart' &&
            Math.abs(each.since - since) < DEPARTURE_WINDOW_MS
          ),
      )
      .reduce((most, each) => Math.max(most, each.busy - since), 0);
  }

  /** How long a plane takes off after `others` cued with it, the runway's holders waited for. */
  takeoffLead(site: string, mine: Waiting, others: ReadonlyArray<Departure>) {
    return takeoffLead(
      mine,
      others.flatMap(({ plane, since }) => (plane === undefined ? [] : [{ ...plane, since }])),
      this.busyFor(site, mine.since, true),
    );
  }

  /** How long a plane lands after the `queue` of its cue, the runway's holders waited for. */
  landingLead(
    site: string,
    since: number,
    queue: Parameters<typeof landingLead>[0],
    mine: Parameters<typeof landingLead>[1],
  ) {
    return landingLead(queue, mine, this.busyFor(site, since, false));
  }

  /** A plane that landed holds the runway until `busy`. */
  landed(site: string, since: number, busy: number): void {
    this.uses.push({ site, kind: 'land', since, busy });
  }

  /**
   * **A departure counts once it plays**: a refused `play` (the ceiling, out of sight) records no
   * departure and no hold of the runway, so that the others do not wait for a plane that never
   * rolls. `wait` is its lead.
   */
  depart(entry: Departure, wait: number, play: () => boolean): boolean {
    if (!play()) return false;
    this.played.push(entry);
    if (entry.plane !== undefined)
      this.uses.push({
        site: entry.site,
        kind: 'depart',
        since: entry.since,
        busy: entry.since + wait + entry.plane.free,
      });
    return true;
  }

  /** **The other movements cued or played from this site**, the ones not yet played (`pending`)
   *  and the ones playing, each once. */
  others(arcId: string, site: string, pending: ReadonlyArray<Departure>): Departure[] {
    const seen = new Set<string>([arcId]);
    return [...this.played.filter((each) => each.site === site), ...pending].filter(
      (each) => !seen.has(each.arcId) && seen.add(each.arcId),
    );
  }

  /**
   * **The airfield's lights**, on until `end`: a plane queued behind another extends them, and the
   * doors of a formation cued while they burn open in the same sequence, shifted to its `since`.
   */
  lightUp(site: string, since: number, end: number, doors: ReadonlyArray<Doors>, host: LightHost) {
    const lit = this.lit.get(site);
    if (lit !== undefined && host.playing()) {
      lit.end = Math.max(lit.end, end);
      const shift = since - lit.start;
      for (const { lane, open } of doors)
        lit.doors.push({ lane, open: (ms) => (ms < shift ? 0 : open(ms - shift)) });
      return;
    }
    const state: Lit = { start: since, end, doors: [...doors] };
    if (host.play(airfieldSequence(() => state.end - state.start, state.doors)))
      this.lit.set(site, state);
  }

  /** Forget what is over by `now`: the runway holds, the lights, the departures of the window. */
  purge(now: number): void {
    this.uses = this.uses.filter(({ busy }) => busy > now);
    this.played = this.played.filter(({ since }) => now - since < DEPARTURE_WINDOW_MS);
    for (const [site, { end }] of this.lit) if (end <= now) this.lit.delete(site);
  }

  /** The sites whose lights the state still keeps (for the purge's test). */
  get litSites(): string[] {
    return [...this.lit.keys()];
  }
}
