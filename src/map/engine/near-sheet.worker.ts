import type { AtlasFile, NearFile } from '@/domain/atlas';
import type { Projection } from '@/domain/world';
import projection from '../../../public/projection.json';
import { buffersOf } from './atlas-geometry';
import { buildNearSheet } from './near-sheet';
import type { TerrainCells } from './terrain-drawings';

/** Answers once with a `NearSheet`, its buffers handed over rather than copied, or `null`. */
const port = self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void };

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`atlas not found: ${url}`);
  return (await response.json()) as T;
}

Promise.all([
  json<AtlasFile>('/atlas.json'),
  json<NearFile>('/atlas-near.json'),
  json<TerrainCells>('/terrain-cells.json'),
])
  .then(([file, near, cells]) => {
    const sheet = buildNearSheet(file, near, cells, projection as unknown as Projection);
    port.postMessage(sheet, buffersOf(sheet));
  })
  .catch(() => port.postMessage(null, []));
