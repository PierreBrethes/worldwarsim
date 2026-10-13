/** How long the pointer stays still before a held piece asks for its route (ADR 0026 §6). */
export const REST_MS = 300;

/**
 * **A stop of the pointer, told once**: while it moves no route is shown, and the server is
 * asked only when it settles. The clock is the caller's, so the rule reads without a timer.
 */
export class PointerRest {
  /** The last move over the board, `null` while there is nothing to wait for. */
  private since: number | null = null;
  private resting = false;

  /** The pointer moved over the board: `true` when that ends a stop already told. */
  moved(now: number): boolean {
    const ended = this.resting;
    this.resting = false;
    this.since = now;
    return ended;
  }

  /** The pointer left the board, or nothing is held any more: `true` when that ends a stop. */
  stop(): boolean {
    const ended = this.resting;
    this.resting = false;
    this.since = null;
    return ended;
  }

  /** `true` once per stop, when the pointer has been still `REST_MS`. */
  due(now: number): boolean {
    if (this.resting || this.since === null || now - this.since < REST_MS) return false;
    this.resting = true;
    return true;
  }
}
