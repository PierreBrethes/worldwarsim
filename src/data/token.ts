import { useSyncExternalStore } from 'react';

const KEY = 'wws-token';

const subscribers = new Set<() => void>();

const announce = (): void => {
  for (const subscriber of subscribers) subscriber();
};

export const readToken = (): string | null => localStorage.getItem(KEY);

export const keepToken = (token: string): void => {
  localStorage.setItem(KEY, token);
  announce();
};

export const forgetToken = (): void => {
  localStorage.removeItem(KEY);
  announce();
};

/**
 * The token as a reactive source. Reading `readToken()` straight from a render body worked
 * by accident: the value only changed on a navigation that remounted the component anyway.
 * It stopped being true across tabs — quitting a lobby in one leaves the other showing a
 * game it no longer holds a token for.
 *
 * `storage` only fires in the *other* tabs, never the one that wrote, hence the manual
 * announce in `keepToken` and `forgetToken`.
 */
export function useToken(): string | null {
  return useSyncExternalStore(subscribe, readToken, () => null);
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  if (subscribers.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) window.removeEventListener('storage', onStorage);
  };
}

function onStorage(event: StorageEvent): void {
  // A `null` key means the whole store was cleared, which concerns us too.
  if (event.key === KEY || event.key === null) announce();
}
