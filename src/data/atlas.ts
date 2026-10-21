import projection from '../../public/projection.json';
import { decodeAtlas, type Atlas, type AtlasFile } from '@/domain/atlas';
import { loadRegionTypes, type Projection } from '@/domain/world';
import { WorldFrame } from '@/map/engine/frame';
import type { NearSheet } from '@/map/engine/near-sheet';
import { drawnOf, pageCanvas, typeTexels } from '@/map/engine/terrain-drawings';

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

/** The near level and what it draws, built by a worker (`near-sheet.worker.ts`); the main
 *  thread decodes only the far file's objects around the near arcs it is handed. */
export type NearAtlas = { readonly atlas: Atlas; readonly sheet: NearSheet };

export const loadNearAtlas = once(async (): Promise<NearAtlas> => {
  const [file, sheet] = await Promise.all([farFile(), nearSheet()]);
  const atlas = decodeAtlas(file, sheet.arcs);
  if (sheet.types !== null) return { atlas, sheet };
  // No `OffscreenCanvas` in the worker: the type map is painted here, once per tab.
  const massifs = atlas.shapes(drawnOf(await loadRegionTypes()), 'far');
  const types = typeTexels(
    massifs,
    new WorldFrame(projection as unknown as Projection),
    pageCanvas,
  );
  return { atlas, sheet: { ...sheet, types } };
});

function nearSheet(): Promise<NearSheet> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../map/engine/near-sheet.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = ({ data }: MessageEvent<NearSheet | null>) => {
      worker.terminate();
      if (data === null) reject(new Error('near atlas: the worker gave up'));
      else resolve(data);
    };
    worker.onerror = (error) => {
      worker.terminate();
      reject(error);
    };
  });
}
