/**
 * **The general channel's three bounds** — and they are not balancing numbers, which is why they
 * are here and not in `convex/constants.ts`: nothing in the game is decided by them, no simulation
 * will ever measure them, and the day they move it is because a line of text looked wrong on a
 * screen. They live in the domain because the server enforces them and the field has to show the
 * same ceiling — a client that let one type 400 characters into a 300-character mutation would be
 * offering a refusal.
 */

/** Counted in UTF-16 units, like the field's own `maxLength`: two ways to count is two ceilings. */
export const MESSAGE_MAX_CHARS = 300;

/** The anti-burst floor between two messages of the same player. */
export const MESSAGE_MIN_INTERVAL_MS = 1000;

/**
 * **The telegraph is a thread, not an archive.** The window serves the last messages of the
 * season and nothing older: a channel between eight friends over seven days does not need
 * pagination, and a scroll that loads backwards forever is a feature nobody asked for.
 */
export const TELEGRAPH_DEPTH = 200;

/** What the thread's layout reads of a message: when, from whom, and whether it is one's own. */
export type ThreadEntry = {
  readonly at: number;
  readonly nickname: string;
  readonly mine: boolean;
};

/**
 * **Consecutive messages from one player sit under one name** (mobile redesign, 1i): the name
 * opens a run and the bands after it close up, until another sender — or another day — opens the
 * next. A new day also lays its date across the thread. Days are local calendar days: the
 * separator says « today » to the reader, not to the server.
 */
export function threadLayout<Entry extends ThreadEntry>(
  entries: ReadonlyArray<Entry>,
): ReadonlyArray<{
  readonly entry: Entry;
  readonly opensDay: boolean;
  readonly opensRun: boolean;
}> {
  return entries.map((entry, rank) => {
    const previous = entries[rank - 1];
    const opensDay =
      previous === undefined ||
      new Date(previous.at).toDateString() !== new Date(entry.at).toDateString();
    const opensRun =
      previous === undefined ||
      opensDay ||
      previous.mine !== entry.mine ||
      previous.nickname !== entry.nickname;
    return { entry, opensDay, opensRun };
  });
}
