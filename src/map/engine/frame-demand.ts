/**
 * **Quand la carte doit-elle se redessiner ?** Elle rendait soixante images par seconde, même
 * posée et immobile : un plateau qu'on lit sans y toucher faisait tourner le GPU, et vidait la
 * batterie d'un téléphone, pour redessiner la même image.
 *
 * Deux filets, parce qu'une invalidation oubliée fige une carte et qu'aucun test ne le voit :
 *
 * - **la fenêtre d'activité** : ce qui remue la carte ne demande pas *une* image mais
 *   `SETTLE_MS` d'images. L'inertie de la caméra, la pousse des accessoires d'une région, une
 *   texture qui arrive juste après : rien de cela n'a à se déclarer, la fenêtre le couvre ;
 * - **le battement** : même sans rien, une image toutes les `HEARTBEAT_MS`. Un oubli se lit
 *   alors comme un retard d'une demi-seconde, jamais comme une carte gelée.
 *
 * Pure et sans horloge propre — l'instant est donné — pour se tester sans navigateur.
 */
export const SETTLE_MS = 1500;
export const HEARTBEAT_MS = 500;

export class FrameDemand {
  private stirredAt: number;
  private renderedAt = Number.NEGATIVE_INFINITY;
  private requested = false;

  constructor(now: number) {
    this.stirredAt = now;
  }

  /** Quelque chose a bougé, ou va bouger : la carte rend pendant `SETTLE_MS` à compter d'ici. */
  stir(now: number): void {
    this.stirredAt = now;
  }

  /** Une image seule, sans ouvrir la fenêtre : l'ambiance la demande à chaque pas. */
  request(): void {
    this.requested = true;
  }

  /** Cette image est-elle due ? Répondre oui la compte comme rendue. */
  due(now: number): boolean {
    const due =
      this.requested || now - this.stirredAt <= SETTLE_MS || now - this.renderedAt >= HEARTBEAT_MS;
    this.requested = false;
    if (due) this.renderedAt = now;
    return due;
  }
}
