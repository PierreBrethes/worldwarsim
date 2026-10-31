import type { InkBurst } from '@/domain/ink-bursts';

/** The longest « terrain tenu » waits for the map to say whether it played the combat: past a
 *  replayOf that never came back, it stands as ever. @a-mesurer : une vue lente d'un téléphone
 *  tient dans la même attente que l'écran qui la masque (`WAIT_MS`) ? */
export const HELD_MAX_MS = 15_000;

/**
 * **« Terrain tenu » d'un combat que la carte peut jouer** (#327) : il disait l'issue pendant la
 * frappe, et le tampon du compte-rendu le remplace. Il attend donc que la carte dise : une scène
 * montrée, il est abandonné ; un combat réglé sans scène (hors champ, sous le plancher, vue jamais
 * reçue), il se pose, ce qui reste de son délai après « engagé ».
 */
export class HeldBursts {
  private readonly pending = new Map<
    string,
    {
      readonly burst: InkBurst;
      readonly since: number;
      readonly timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly stamp: (burst: InkBurst) => void) {}

  hold(burst: InkBurst): void {
    const id = burst.combatId;
    if (id === undefined) return this.stamp(burst);
    const timer = setTimeout(() => this.abandon(id), HELD_MAX_MS);
    this.pending.set(id, { burst, since: Date.now(), timer });
  }

  /** The combat's scene stood on the board: its stamp says the outcome now. */
  shown(id: string): void {
    this.drop(id);
  }

  /** The combat is settled and the map showed no scene of it. */
  abandon(id: string): void {
    const entry = this.pending.get(id);
    if (entry === undefined) return;
    this.drop(id);
    const { combatId: _, ...rest } = entry.burst;
    const left = Math.max(0, (entry.burst.delayMs ?? 0) - (Date.now() - entry.since));
    this.stamp({ ...rest, delayMs: left });
  }

  dispose(): void {
    for (const id of [...this.pending.keys()]) this.drop(id);
  }

  private drop(id: string): void {
    const entry = this.pending.get(id);
    if (entry === undefined) return;
    clearTimeout(entry.timer);
    this.pending.delete(id);
  }
}
