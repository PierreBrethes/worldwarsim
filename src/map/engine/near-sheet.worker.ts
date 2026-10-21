import type { AtlasFile, NearFile } from '@/domain/atlas';
import { loadRegionTypes, type Projection } from '@/domain/world';
import projection from '../../../public/projection.json';
import { buffersOf } from './atlas-geometry';
import { buildNearSheet } from './near-sheet';

/** Answers once with a `NearSheet`, its buffers handed over rather than copied, or `null`. */
const port = self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void };

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`atlas not found: ${url}`);
  return (await response.json()) as T;
}

Promise.all([json<AtlasFile>('/atlas.json'), json<NearFile>('/atlas-near.json'), loadRegionTypes()])
  .then(([file, near, types]) => {
    const canvasOf =
      typeof OffscreenCanvas === 'undefined'
        ? null
        : (width: number, height: number) => new OffscreenCanvas(width, height);
    const sheet = buildNearSheet(file, near, types, projection as unknown as Projection, canvasOf);
    port.postMessage(sheet, buffersOf(sheet));
  })
  .catch(() => port.postMessage(null, []));
