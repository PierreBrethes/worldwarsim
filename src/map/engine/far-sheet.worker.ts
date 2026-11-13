import { decodeAtlas, type AtlasFile } from '@/domain/atlas';
import { buffersOf } from './atlas-geometry';
import { sheetData } from './countries';
import { PROJECTION, WorldFrame } from './frame';

/** Given `atlas.json`'s text by the main thread (a second request would revalidate, or download it
 *  again), answers once with the far level's `SheetData`, its buffers handed over rather than
 *  copied, or `null`: the loader awaits it, so the board never draws without its countries. */
const port = self as unknown as {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

port.onmessage = ({ data }) => {
  try {
    const atlas = decodeAtlas(JSON.parse(data) as AtlasFile);
    const sheet = sheetData(atlas, 'far', new WorldFrame(PROJECTION));
    port.postMessage(sheet, buffersOf(sheet));
  } catch {
    port.postMessage(null, []);
  }
};
