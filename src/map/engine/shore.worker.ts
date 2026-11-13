import type { GridAsset } from '@/domain/routing';
import { buffersOf } from './atlas-geometry';
import { PROJECTION } from './frame';
import { shoreOf } from './sea';

/** Answers once with the `Shore`, its buffers handed over rather than copied, or `null`. */
const port = self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void };

fetch('/grid.json')
  .then(async (response) => {
    if (!response.ok) throw new Error('grid not found');
    const shore = shoreOf((await response.json()) as GridAsset, PROJECTION);
    port.postMessage(shore, buffersOf(shore));
  })
  .catch(() => port.postMessage(null, []));
