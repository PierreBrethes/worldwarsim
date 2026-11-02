import { keepSound, readSound, type Sound } from './settings';

/**
 * **Un seul contexte audio** pour la table, le télégraphe et le front (#405) : un navigateur en
 * compte peu, et chacun naissait du sien.
 */
let audio: AudioContext | null = null;

export const sharedAudio = (): AudioContext => (audio ??= new AudioContext());

/** **Le réglage du son**, lu à chaque son : le changer agit à l'instant. */
let sound: Sound | null = null;
const listeners = new Set<() => void>();

export const soundNow = (): Sound => (sound ??= readSound());

export function setSound(next: Sound): void {
  sound = next;
  keepSound(next);
  for (const listener of listeners) listener();
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
