import { useSyncExternalStore } from 'react';
import { fr } from '@/i18n/fr';

export type Notification = { readonly id: number; readonly message: string };

/**
 * A module store, like the indicator toggles: an unexpected error can surface anywhere
 * (mutation, orphan promise), there is no common React ancestor to entrust this state to.
 * Notifications do not pile up forever: the same message twice in a row shows only once —
 * a stuttering reconnection does not wallpaper the screen.
 */
let notifications: ReadonlyArray<Notification> = [];
let nextId = 1;
const subscribers = new Set<() => void>();

export function notify(message: string): void {
  if (notifications.some((existing) => existing.message === message)) return;
  notifications = [...notifications, { id: nextId++, message }];
  for (const subscriber of subscribers) subscriber();
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
 * The error dispatch stack, above everything — floating windows included (plane 40+).
 * Each card closes by hand: an unexpected error deserves to be read, not to evaporate
 * while one looks elsewhere.
 */
export function Notifications() {
  const shown = useSyncExternalStore(subscribe, snapshot);
  if (shown.length === 0) return null;
  return (
    <div className="hud pointer-events-none fixed top-4 right-4 z-[80] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2">
      {shown.map((notification) => (
        <div
          key={notification.id}
          role="alert"
          className="paper-grain pointer-events-auto flex items-start gap-3 border border-[var(--critical)] px-[14px] py-[10px] shadow-[0_10px_24px_rgba(0,0,0,.5)]"
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
      ))}
    </div>
  );
}
