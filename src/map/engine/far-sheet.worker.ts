import { decodeAtlas, type AtlasFile } from '@/domain/atlas';
import { buffersOf } from './atlas-geometry';
import { sheetData } from './countries';
import { PROJECTION, WorldFrame } from './frame';

/** Answers once with the far level's `SheetData`, its buffers handed over rather than copied, or
 *  `null`: the loader awaits it, so the board never draws without its countries. */
const port = self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void };

fetch('/atlas.json')
  .then(async (response) => {
    if (!response.ok) throw new Error('atlas not found');
    const atlas = decodeAtlas((await response.json()) as AtlasFile);
    const sheet = sheetData(atlas, 'far', new WorldFrame(PROJECTION));
    port.postMessage(sheet, buffersOf(sheet));
  })
  .catch(() => port.postMessage(null, []));
