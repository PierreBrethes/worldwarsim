import { useSyncExternalStore } from 'react';
import { type MouseMapping } from '@/domain/mouse-mapping';
import { keepMouseMapping, readMouseMapping } from './settings';

/**
 * Le mappage a quatre lecteurs qui ne se voient pas — le moteur de carte, les étiquettes, la
 * fiche `?` et l'aide-mémoire — et aucun ancêtre commun qui devrait le porter. Un magasin de
 * module comme les bascules de bord d'écran : l'effet est immédiat, sans rechargement, parce que
 * l'état vit là où on l'écrit.
 */
let state: MouseMapping | null = null;
const subscribers = new Set<() => void>();

const snapshot = (): MouseMapping => (state ??= readMouseMapping());

export const useMouseMapping = (): MouseMapping => useSyncExternalStore(subscribe, snapshot);

export function setMouseMapping(mapping: MouseMapping): void {
  state = mapping;
  keepMouseMapping(mapping);
  for (const subscriber of subscribers) subscriber();
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
