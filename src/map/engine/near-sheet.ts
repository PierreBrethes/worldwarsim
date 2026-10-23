import {
  decodeArcs,
  decodeAtlas,
  packArcs,
  type AtlasFile,
  type DecodedArcs,
  type Detail,
  type NearFile,
} from '@/domain/atlas';
import type { Projection } from '@/domain/world';
import { geometryData, type GeometryData } from './atlas-geometry';
import { sheetData, type SheetData } from './countries';
import { WorldFrame } from './frame';
import { regionLines } from './regions';
import { typesFromCells, type TerrainCells, type TypesData } from './terrain-drawings';

/**
 * **Everything the near level costs, built off the main thread** (`near-sheet.worker.ts`): the
 * arcs decoded, the sheet, the region lines at both levels, and the terrain's type map. The main thread only wraps the arrays, so the first near frame waits for all of it at
 * once and the board never stutters while it comes.
 */
export type NearSheet = {
  readonly arcs: DecodedArcs;
  readonly sheet: SheetData;
  readonly lines: Record<Detail, GeometryData>;
  /** The terrain's type map; `null` when its cells failed to load: the drawings are decor, the
   *  near level goes on without them. */
  readonly types: TypesData | null;
};

export function buildNearSheet(
  file: AtlasFile,
  near: NearFile,
  cells: TerrainCells | null,
  projection: Projection,
): NearSheet {
  const arcs = packArcs(decodeArcs(near.arcs, near.transform));
  const atlas = decodeAtlas(file, arcs);
  const frame = new WorldFrame(projection);
  return {
    arcs,
    sheet: sheetData(atlas, 'near', frame),
    lines: {
      far: geometryData(regionLines(atlas, 'far', frame)),
      near: geometryData(regionLines(atlas, 'near', frame)),
    },
    types: cells && typesFromCells(cells, frame),
  };
}
