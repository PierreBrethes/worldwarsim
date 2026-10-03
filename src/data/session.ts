import { useSyncExternalStore } from 'react';
import type { Id } from '../../convex/_generated/dataModel';

const SESSION_KEY = 'wws-session';
const SEASON_KEY = 'wws-season';

/**
 * **Ce qu'il faut pour qu'un ordre soit reçu** (ADR 0022) : qui parle, et à quelle table. Le
 * jeton de partie tenait les deux à lui seul, et c'est précisément ce qui interdisait de
 * retrouver ses parties depuis un second appareil — il fallait recopier une chaîne d'un
 * navigateur à l'autre.
 */
export type Seat = { readonly token: string; readonly seasonId: Id<'seasons'> };

const subscribers = new Set<() => void>();

const announce = (): void => {
  for (const subscriber of subscribers) subscriber();
};

export const readSession = (): string | null => localStorage.getItem(SESSION_KEY);

export const keepSession = (token: string): void => {
  localStorage.setItem(SESSION_KEY, token);
  announce();
};

/**
 * **Se déconnecter efface aussi la place active** : la session partie, la saison qu'elle
 * ouvrait ne s'ouvre plus, et une place restée là ferait entrer le compte suivant sur le
 * plateau du précédent.
 */
export const forgetSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SEASON_KEY);
  announce();
};

let snapshot: Seat | null = null;

/**
 * **La place active**, jeton compris — les deux ou rien : une saison sans session n'ouvre
 * aucune porte, et une session sans saison n'ouvre que l'accueil.
 *
 * Le résultat est mémoïsé sur les deux chaînes brutes parce que `useSyncExternalStore` compare
 * les instantanés par identité : un objet neuf à chaque lecture est une boucle de rendu.
 */
export function readSeat(): Seat | null {
  const token = localStorage.getItem(SESSION_KEY);
  const seasonId = localStorage.getItem(SEASON_KEY);
  if (token === null || seasonId === null) {
    snapshot = null;
    return null;
  }
  if (snapshot?.token === token && snapshot.seasonId === seasonId) return snapshot;
  snapshot = { token, seasonId: seasonId as Id<'seasons'> };
  return snapshot;
}

export const keepSeat = (seasonId: Id<'seasons'>): void => {
  localStorage.setItem(SEASON_KEY, seasonId);
  announce();
};

/** On quitte la partie, pas le compte : la session reste, et l'accueil liste encore les
 *  autres places. */
export const forgetSeat = (): void => {
  localStorage.removeItem(SEASON_KEY);
  announce();
};

/**
 * La session comme source réactive. La lire à même le corps d'un rendu marchait par accident :
 * la valeur ne changeait qu'à une navigation qui remontait le composant de toute façon. Ce
 * n'est plus vrai d'un onglet à l'autre — se déconnecter dans l'un laisse l'autre sur un
 * plateau dont il n'a plus la clé.
 *
 * `storage` ne se déclenche que dans les *autres* onglets, jamais dans celui qui a écrit, d'où
 * l'annonce manuelle de chaque écriture.
 */
export function useSession(): string | null {
  return useSyncExternalStore(subscribe, readSession, () => null);
}

export function useSeat(): Seat | null {
  return useSyncExternalStore(subscribe, readSeat, () => null);
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
  // Une clé `null` veut dire que tout le stockage a été vidé, ce qui nous concerne aussi.
  if (event.key === SESSION_KEY || event.key === SEASON_KEY || event.key === null) announce();
}
