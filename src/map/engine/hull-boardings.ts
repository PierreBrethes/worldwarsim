import type { Cue } from './sequences';

type HullCue = Extract<Cue, { kind: 'embarquement' }>;

/** **A boarding that plays**: when each rider is let into the tag (`at`, ms from its start; 0 for
 *  one that is posed at once, a vehicle), how long it lasts, whether it is over before its end
 *  (its men cut by a hand on the pile, the zoom, the motion setting), and what it leaves to clean. */
export type Started = {
  readonly ms: number;
  /** In the order of `at`. */
  readonly feeds: ReadonlyArray<{ readonly at: number; readonly riders: ReadonlyArray<string> }>;
  over(): boolean;
  end(): void;
};

export type HullBoardingHost = {
  /** The tag may show these riders of the hull's carrier. */
  feed(carrierId: string, riders: ReadonlyArray<string>): void;
  /** Starts the sequence once the hull, its port and its men stand: `'wait'` until they do,
   *  `null` when it cannot play (out of the field, under a combat, no room). */
  start(cue: HullCue, now: number): Started | 'wait' | null;
  /** The sequence will not play: whatever held the pile for it lets go. */
  unplayed(cue: HullCue): void;
};

/** **How long a boarding waits for its hull to stand** before the tag takes its count whole. */
const HULL_WAIT_MS = 2000;

type Entry = {
  readonly cue: HullCue;
  readonly since: number;
  run?: { readonly started: Started; readonly at: number; fed: number };
};

/**
 * **The boardings of the hulls at a quay** (#479, #504): one per hull, waiting for its hull, its
 * port and its men to stand, then played; the tag is fed as the sequence says, and never keeps
 * the old count past the sequence — or past the wait, when it never plays. What `cue` refuses
 * (a second boarding of a hull that already has one) is posed at once by the caller.
 */
export class HullBoardings {
  private entries: Entry[] = [];

  constructor(private readonly host: HullBoardingHost) {}

  /** One waits or plays: the map asks for its images, which settle it. */
  get active(): boolean {
    return this.entries.length > 0;
  }

  /** Queues the boarding; `false` when its hull already has one waiting or playing. */
  cue(cue: HullCue, now: number): boolean {
    if (this.entries.some((entry) => entry.cue.hull === cue.hull)) return false;
    this.entries.push({ cue, since: now });
    return true;
  }

  step(now: number): void {
    this.entries = this.entries.filter((entry) => !this.settled(entry, now));
  }

  /** Whether the entry is over, after doing what it owes at `now`. */
  private settled(entry: Entry, now: number): boolean {
    const { cue } = entry;
    const everyone = cue.riders.map(({ troopId }) => troopId);
    if (entry.run === undefined) {
      const started = this.host.start(cue, now);
      if (started === 'wait' && now - entry.since < HULL_WAIT_MS) return false;
      if (started === 'wait' || started === null) {
        this.host.feed(cue.carrierId, everyone);
        this.host.unplayed(cue);
        return true;
      }
      entry.run = { started, at: now, fed: 0 };
    }
    const { started, at } = entry.run;
    const t = now - at;
    const due = started.feeds.filter((feed, k) => k >= entry.run!.fed && feed.at <= t);
    for (const feed of due) this.host.feed(cue.carrierId, feed.riders);
    entry.run.fed += due.length;
    if (t < started.ms && !started.over()) return false;
    const left = started.feeds.slice(entry.run.fed).flatMap(({ riders }) => riders);
    if (left.length > 0) this.host.feed(cue.carrierId, left);
    started.end();
    return true;
  }
}
