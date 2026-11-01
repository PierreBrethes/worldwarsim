import { useEffect, useState, useSyncExternalStore } from 'react';
import { parsePatchnotes, unreadOf, type Patchnote } from '@/domain/patchnotes';
import { keepPatchnotesRead, readPatchnotesRead } from './settings';

/**
 * Les bulletins sont des fichiers servis (`public/patchnotes/`), pas des données de partie : un
 * magasin de module les charge une fois, et le « lu » du navigateur se lit à côté. Un index
 * introuvable laisse la liste vide, jamais une erreur : les Réglages restent des Réglages.
 */
let read: ReadonlySet<string> | null = null;
const subscribers = new Set<() => void>();

const snapshot = (): ReadonlySet<string> => (read ??= readPatchnotesRead());

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function markPatchnoteRead(date: string): void {
  if (snapshot().has(date)) return;
  read = new Set([...snapshot(), date]);
  keepPatchnotesRead(read);
  for (const subscriber of subscribers) subscriber();
}

let loaded: Promise<Patchnote[]> | null = null;
const load = (): Promise<Patchnote[]> =>
  (loaded ??= fetch('/patchnotes/index.json')
    .then((response) => response.json() as Promise<unknown>)
    .then(parsePatchnotes)
    .catch(() => {
      loaded = null;
      return [];
    }));

export function usePatchnotes(): Patchnote[] {
  const [notes, setNotes] = useState<Patchnote[]>([]);
  useEffect(() => {
    let live = true;
    void load().then((all) => live && setNotes(all));
    return () => {
      live = false;
    };
  }, []);
  return notes;
}

const useRead = (): ReadonlySet<string> => useSyncExternalStore(subscribe, snapshot);

/** Les dates non lues : le point rouge du bouton des Réglages et les tampons de la liste. */
export function useUnreadPatchnotes(): ReadonlySet<string> {
  const notes = usePatchnotes();
  const readDates = useRead();
  return unreadOf(notes, readDates);
}
