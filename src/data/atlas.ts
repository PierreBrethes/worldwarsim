import { decodeAtlas, type AtlasFile, type NearFile } from '@/domain/atlas';

/**
 * The atlas (ADR 0034), fetched once for the lifetime of the tab like the world: `atlas.json` with
 * the board, `atlas-near.json` after it. The far file is kept, since the near arcs decode against
 * its objects. A failure is forgotten, so the next mount tries afresh.
 */
function once<T>(make: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () =>
    (promise ??= make().catch((error: unknown) => {
      promise = null;
      throw error;
    }));
}

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`atlas not found: ${url}`);
  return (await response.json()) as T;
}

const farFile = once(() => json<AtlasFile>('/atlas.json'));

export const loadAtlas = once(async () => decodeAtlas(await farFile()));

export const loadNearAtlas = once(async () => {
  const [file, near] = await Promise.all([farFile(), json<NearFile>('/atlas-near.json')]);
  return decodeAtlas(file, near);
});
