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
