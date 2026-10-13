import { useSyncExternalStore } from 'react';
import { fr } from '@/i18n/fr';

/**
 * **Deux tons, et le second n'est pas une alerte.** Une erreur se lit et se ferme à la main ; un
 * **avis** dit qu'une action a pris effet **hors du champ où l'on a cliqué**, et s'efface seul.
 * Rien d'autre n'en justifie un : une pose que la carte dessine sous la souris se voit déjà, et
 * un avis par action ferait du bandeau un fil d'activité (décision du 27/08).
 */
export type NotificationTone = 'error' | 'info';

export type Notification = {
  readonly id: number;
  readonly message: string;
  readonly tone: NotificationTone;
};

/**
 * A module store, like the indicator toggles: an unexpected error can surface anywhere
 * (mutation, orphan promise), there is no common React ancestor to entrust this state to.
 * Notifications do not pile up forever: the same message twice in a row shows only once —
 * a stuttering reconnection does not wallpaper the screen.
 */
let notifications: ReadonlyArray<Notification> = [];
let nextId = 1;
const subscribers = new Set<() => void>();

/** Assez pour lire une ligne, trop court pour qu'on aille le chercher : un avis manqué n'a rien
 *  perdu, la file qu'il annonce est dans son bureau. */
const INFO_MILLISECONDS = 4_000;

export function notify(message: string, tone: NotificationTone = 'error'): void {
  if (notifications.some((existing) => existing.message === message)) return;
  const id = nextId++;
  notifications = [...notifications, { id, message, tone }];
  for (const subscriber of subscribers) subscriber();
  if (tone === 'info') setTimeout(() => dismissNotification(id), INFO_MILLISECONDS);
}

export function dismissNotification(id: number): void {
  notifications = notifications.filter((notification) => notification.id !== id);
  for (const subscriber of subscribers) subscriber();
}

const snapshot = (): ReadonlyArray<Notification> => notifications;

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

/**
 * The dispatch stack, above everything — floating windows included (plane 40+).
 *
 * **Les erreurs d'abord, les avis dessous.** Un avis qui s'efface au bout de quatre secondes ne
 * doit pas pousser une erreur qu'on est en train de lire ; l'ordre le garantit sans que la
 * carte d'erreur ait à savoir qu'un avis existe.
 */
export function Notifications() {
  const shown = useSyncExternalStore(subscribe, snapshot);
  if (shown.length === 0) return null;
  const ordered = [
    ...shown.filter((notification) => notification.tone === 'error'),
    ...shown.filter((notification) => notification.tone === 'info'),
  ];
  return (
    <div className="hud pointer-events-none fixed top-[calc(var(--board-top)/var(--hud-scale)_+_12px)] right-4 z-[var(--z-notice)] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2">
      {ordered.map((notification) =>
        notification.tone === 'error' ? (
          <Card key={notification.id} notification={notification} />
        ) : (
          <Notice key={notification.id} message={notification.message} />
        ),
      )}
    </div>
  );
}

/** Une erreur se ferme à la main : elle mérite d'être lue, pas de s'évaporer pendant qu'on
 *  regarde ailleurs. */
function Card({ notification }: { notification: Notification }) {
  return (
    <div
      role="alert"
      className="paper-grain pointer-events-auto flex items-start gap-3 border border-[var(--critical)] px-[14px] py-[10px] float"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[9px] tracking-[.22em] text-[var(--critical)] uppercase">
          {fr.notifications.kicker}
        </div>
        <p className="mt-[3px] text-[12.5px] leading-[1.45] text-[var(--ink)]">
          {notification.message}
        </p>
      </div>
      <button
        type="button"
        onClick={() => dismissNotification(notification.id)}
        title={fr.notifications.close}
        className="shrink-0 cursor-pointer border border-[var(--ink)] px-[7px] py-[2px] text-[11px] leading-none text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        ×
      </button>
    </div>
  );
}

/** **Pas de croix, pas d'`alert`.** Un avis ne demande rien : il part seul, et `status` le fait
 *  lire par un lecteur d'écran sans interrompre ce qui se dit. */
function Notice({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="paper-grain pointer-events-none border border-(color:--ink)/42 px-[14px] py-[9px] float"
    >
      <div className="text-[9px] tracking-[.22em] text-[var(--ink-quiet)] uppercase">
        {fr.notifications.noticeKicker}
      </div>
      <p className="mt-[3px] text-[12.5px] leading-[1.45] text-[var(--ink)]">{message}</p>
    </div>
  );
}
