/**
 * **Quand la carte doit-elle se redessiner ?** Elle rendait soixante images par seconde, même
 * posée et immobile : un plateau qu'on lit sans y toucher faisait tourner le GPU, et vidait la
 * batterie d'un téléphone, pour redessiner la même image.
 *
 * Deux filets, parce qu'une invalidation oubliée fige une carte et qu'aucun test ne le voit :
 *
 * - **la fenêtre d'activité** : ce qui remue la carte ne demande pas *une* image mais
 *   `SETTLE_MS` d'images. L'inertie de la caméra, la plume du terrain survolé, une
 *   texture qui arrive juste après : rien de cela n'a à se déclarer, la fenêtre le couvre ;
 * - **le battement** : même sans rien, une image toutes les `HEARTBEAT_MS` (rien, onglet caché). Un oubli se lit
 *   alors comme un retard d'une seconde, jamais comme une carte gelée.
 *
 * Pure et sans horloge propre — l'instant est donné — pour se tester sans navigateur.
 *
 * **Elle dit aussi pourquoi l'image est due** : une image d'ambiance ne change que des uniformes
 * de shader (mer, vent, fumées), donc la carte d'ombres et les étiquettes de l'image d'avant
 * valent encore — les refaire trente fois par seconde ne servait à rien. Le battement se compte
 * depuis la dernière image complète, sans quoi l'ambiance le repousserait sans fin.
 */
export const SETTLE_MS = 1500;
export const HEARTBEAT_MS = 1000;
/** A thread that flows (dashes, marching piece) asks a whole frame this often. */
export const FLOW_FULL_MS = 32; // @a-mesurer: 30 frames a second, invisible on a drifting dash?
export const FLOW_REDUCED_MS = 100;

export type FrameReason = 'stirred' | 'heartbeat' | 'ambient';

export class FrameDemand {
  private stirredAt: number;
  private fullAt = Number.NEGATIVE_INFINITY;
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

  /** Pourquoi cette image est due, ou `null` ; `pace` est l'écart voulu entre deux images complètes
   *  au repos (battement, fil qui coule, `Infinity` onglet caché) ; une image remuée ou de battement compte comme complète.
   *  **Un fil qui coule porte l'ambiance** (#189) : ses images complètes jouent aussi le pas de la mer
   *  et du vent, qui n'en demande plus d'autre entre elles — 45 à 60 images par seconde au repos
   *  au lieu de 30, pour la même mer à 32 ms près. */
  due(now: number, pace: number = HEARTBEAT_MS): FrameReason | null {
    const requested = this.requested;
    this.requested = false;
    const reason: FrameReason | null =
      now - this.stirredAt <= SETTLE_MS
        ? 'stirred'
        : now - this.fullAt >= pace
          ? 'heartbeat'
          : requested && pace >= HEARTBEAT_MS
            ? 'ambient'
            : null;
    if (reason === 'stirred' || reason === 'heartbeat') this.fullAt = now;
    return reason;
  }
}
