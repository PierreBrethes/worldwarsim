/**
 * The real terrain of a region — relief, climate and forest cover read from three public rasters,
 * decided per region on area-weighted shares (`WWS/docs/design/propositions/classification-regions.md`).
 * **Decoration only**: no game rule reads `RegionType` (sheet 08).
 *
 * Attribution owed:
 * - NOAA NCEI (2022), ETOPO 2022 Global Relief Model, doi:10.25921/fd45-gt74 — US public domain;
 * - Beck, H. E. et al. (2023), High-resolution (1 km) Köppen-Geiger maps for 1901–2099, Scientific
 *   Data 10, 724 — CC BY 4.0;
 * - Hansen, M. C. et al. (2013), Science 342, 850 — Hansen/UMD/Google/USGS/NASA, aggregated by
 *   Wallace et al., doi:10.5281/zenodo.16930105 — CC BY 4.0.
 *
 * A raster here is `{ width, height, west, north, step, values }`, rows north to south, `west` and
 * `north` the centre of the first cell. The readers are hand-written: each format is a header and
 * a flat array, and the one real piece of code is the LZW decoder.
 */
import { inflateRawSync } from 'node:zlib';
import { prepareRegionOutlines, regionAtPlanePoint } from '../src/domain/region-crossing.ts';

/** Local relief (max − min over a 3 × 3 window of 0.1° samples, ≈ 33 km) that makes a mountain. */
const MOUNTAIN_RELIEF_M = 600;
/** Above this altitude, a lower relief is enough: a high plateau cut by valleys is a mountain. */
const HIGHLAND_ALTITUDE_M = 1500;
const HIGHLAND_RELIEF_M = 300;
/** Share of the region's area that must be mountainous: the mountain wins over the climate. */
const MOUNTAIN_SHARE = 0.5;
/** Mean forest fraction that turns a temperate region into forest and a tropical one into jungle. */
const FOREST_SHARE = 0.4;
/**
 * The same line for a cold region, lower: the boreal canopy is sparse — Sakha, larch taiga over
 * three million km², averages 0.38 in Hansen — and tundra is the absence of trees, not their
 * thinning. Chukotka stands at 0.06, the Northwest Territories at 0.29.
 */
const TAIGA_SHARE = 0.3;

const ARID = new Set([4, 5]);
/**
 * **Cold is polar and subarctic** — ET, EF, and the D climates whose summer is short (Dsc, Dsd,
 * Dwc, Dwd, Dfc, Dfd). The interior of Chukotka is Dfc, not ET, and treeless: counted apart, it
 * came out plain. Cold then splits on the forest like the other climates — the taiga is forest.
 */
const COLD_CODES = new Set([19, 20, 23, 24, 27, 28, 29, 30]);
const TROPICAL = new Set([1, 2, 3]);

/** Area-weighted tallies of one region, in the order `terrainOf` reads them. */
const MOUNTAIN = 0;
const DRY = 1;
const COLD = 2;
const HOT = 3;
const OTHER = 4;
const FOREST = 5;
const WEIGHT = 6;
const TALLIES = 7;

/**
 * **The sea is not relief.** ETOPO is bathymetry offshore: without the floor at zero, every steep
 * coast — Chile, Norway — would read a kilometre of drop and turn mountain.
 */
function reliefAround(relief, lon, lat) {
  let low = Infinity;
  let high = -Infinity;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const raw = valueAt(relief, lon + dx * relief.step, lat - dy * relief.step);
      if (Number.isNaN(raw)) continue;
      const z = Math.max(0, raw);
      low = Math.min(low, z);
      high = Math.max(high, z);
    }
  }
  return { altitude: valueAt(relief, lon, lat), drop: high - low };
}

function tally(tallies, at, rasters, lon, lat, code, weight) {
  const { altitude, drop } = reliefAround(rasters.relief, lon, lat);
  const mountainous =
    drop >= MOUNTAIN_RELIEF_M || (altitude >= HIGHLAND_ALTITUDE_M && drop >= HIGHLAND_RELIEF_M);
  if (mountainous) tallies[at + MOUNTAIN] += weight;
  const climate = ARID.has(code)
    ? DRY
    : COLD_CODES.has(code)
      ? COLD
      : TROPICAL.has(code)
        ? HOT
        : OTHER;
  tallies[at + climate] += weight;
  tallies[at + FOREST] += weight * valueAt(rasters.forest, lon, lat);
  tallies[at + WEIGHT] += weight;
}

/**
 * An islet's interior point often falls on a 0.1° cell Köppen calls sea — a hundred and four of
 * them. The climate is taken from the nearest land cell, up to three cells out (≈ 33 km).
 */
function landCodeNear(climate, lon, lat) {
  for (let radius = 0; radius <= 3; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const code = valueAt(climate, lon + dx * climate.step, lat + dy * climate.step);
        if (code > 0) return code;
      }
    }
  }
  // Six regions have no Köppen land within three cells: code 0 is in no climate set, so they read OTHER.
  return 0;
}

/** The decision, on shares of the region's area (forest: its mean fraction). */
function terrainOf({ mountain, dry, cold, hot, other, forest }) {
  if (mountain >= MOUNTAIN_SHARE) return 'mountain';
  const dominant = Math.max(dry, cold, hot, other);
  if (dry === dominant && dry > other) return 'desert';
  if (cold === dominant && cold > other) return forest >= TAIGA_SHARE ? 'forest' : 'tundra';
  const wooded = forest >= FOREST_SHARE;
  if (hot === dominant && hot > other) return wooded ? 'jungle' : 'plain';
  return wooded ? 'forest' : 'plain';
}

/**
 * Every land sample of the climate grid (Köppen ≠ 0) is projected by the contours' own projection
 * and found in its region; the region then decides on its area-weighted shares (`cos(lat)`). A
 * region no sample falls in — 641 are smaller than a 0.1° cell — is read at its
 * interior point, a single sample with the same thresholds.
 *
 * `regions`: `{ id, rings, point }`, rings in plane coordinates, `point` lon/lat.
 * `plane`: `{ project(lon, lat) → [x, y], width }`, the width being the wrap of the plane.
 */
export function measureRegions(regions, rasters, plane) {
  const outlines = prepareRegionOutlines(regions);
  const rankOf = new Map(regions.map((region, rank) => [region.id, rank]));
  const BUCKET = 1;
  const buckets = new Map();
  for (const outline of outlines) {
    const [minX, minY, maxX, maxY] = outline.box;
    for (let y = Math.floor(minY / BUCKET); y <= Math.floor(maxY / BUCKET); y += 1) {
      for (let x = Math.floor(minX / BUCKET); x <= Math.floor(maxX / BUCKET); x += 1) {
        const key = `${x}:${y}`;
        const found = buckets.get(key);
        if (found === undefined) buckets.set(key, [outline]);
        else found.push(outline);
      }
    }
  }

  const tallies = new Float64Array(regions.length * TALLIES);
  const { climate } = rasters;
  for (let row = 0; row < climate.height; row += 1) {
    const lat = climate.north - row * climate.step;
    const weight = Math.cos((lat * Math.PI) / 180);
    for (let column = 0; column < climate.width; column += 1) {
      const code = climate.values[row * climate.width + column];
      if (code === 0) continue;
      const lon = climate.west + column * climate.step;
      const [x, y] = plane.project(lon, lat);
      const nearby = buckets.get(`${Math.floor(x / BUCKET)}:${Math.floor(y / BUCKET)}`);
      if (nearby === undefined) continue;
      const id = regionAtPlanePoint(nearby, [x, y], plane.width);
      if (id === null) continue;
      tally(tallies, rankOf.get(id) * TALLIES, rasters, lon, lat, code, weight);
    }
  }

  const shares = new Map();
  regions.forEach((region, rank) => {
    const at = rank * TALLIES;
    const sampled = tallies[at + WEIGHT] > 0;
    if (!sampled) {
      const [lon, lat] = region.point;
      tally(tallies, at, rasters, lon, lat, landCodeNear(climate, lon, lat), 1);
    }
    const share = (field) => tallies[at + field] / tallies[at + WEIGHT];
    shares.set(region.id, {
      mountain: share(MOUNTAIN),
      dry: share(DRY),
      cold: share(COLD),
      hot: share(HOT),
      other: share(OTHER),
      forest: share(FOREST),
      sampled,
    });
  });
  return shares;
}

export function classifyRegions(regions, rasters, plane) {
  const types = new Map();
  for (const [id, shares] of measureRegions(regions, rasters, plane)) {
    types.set(id, terrainOf(shares));
  }
  return types;
}

/** The codes `classifyCells` writes, by index: the client's type map maps them by name. */
export const CELL_TYPES = ['plain', 'forest', 'jungle', 'mountain', 'desert', 'tundra'];
/** A patch of one type smaller than this, in cells, is no massif: it takes its surroundings'
 *  type, so the map is not sown salt and pepper. @a-mesurer */
const MIN_MASSIF_CELLS = 6;

/**
 * **The terrain by cell** (#220): the regions' tallies and `terrainOf`, but over the cells of a
 * `width × height` grid of `perUnit` cells a plane unit, so that a massif follows the relief and
 * not a region's outline. A cell no land sample falls in is plain. Returns one `CELL_TYPES`
 * index a cell, rows from the plane's top.
 */
export function classifyCells(rasters, { project, width, height, perUnit }) {
  const tallies = new Float64Array(width * height * TALLIES);
  const { climate } = rasters;
  for (let row = 0; row < climate.height; row += 1) {
    const lat = climate.north - row * climate.step;
    const weight = Math.cos((lat * Math.PI) / 180);
    for (let column = 0; column < climate.width; column += 1) {
      const code = climate.values[row * climate.width + column];
      if (code === 0) continue;
      const lon = climate.west + column * climate.step;
      const [x, y] = project(lon, lat);
      const [cx, cy] = [Math.floor(x * perUnit), Math.floor(y * perUnit)];
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
      tally(tallies, (cy * width + cx) * TALLIES, rasters, lon, lat, code, weight);
    }
  }
  const codes = new Uint8Array(width * height);
  for (let cell = 0; cell < codes.length; cell += 1) {
    const at = cell * TALLIES;
    if (tallies[at + WEIGHT] === 0) continue;
    const share = (field) => tallies[at + field] / tallies[at + WEIGHT];
    const type = terrainOf({
      mountain: share(MOUNTAIN),
      dry: share(DRY),
      cold: share(COLD),
      hot: share(HOT),
      other: share(OTHER),
      forest: share(FOREST),
    });
    codes[cell] = CELL_TYPES.indexOf(type);
  }
  return withoutSpecks(codes, width, height);
}

/** Each patch of one code (4-connected) under `MIN_MASSIF_CELLS` takes the code most of its
 *  neighbours bear. */
function withoutSpecks(codes, width, height) {
  const seen = new Uint8Array(codes.length);
  for (let start = 0; start < codes.length; start += 1) {
    if (seen[start]) continue;
    const code = codes[start];
    const patch = [start];
    const around = new Map();
    seen[start] = 1;
    for (let k = 0; k < patch.length; k += 1) {
      const cell = patch[k];
      const x = cell % width;
      for (const next of [
        x > 0 ? cell - 1 : -1,
        x < width - 1 ? cell + 1 : -1,
        cell - width,
        cell + width < codes.length ? cell + width : -1,
      ]) {
        if (next < 0) continue;
        if (codes[next] !== code) around.set(codes[next], (around.get(codes[next]) ?? 0) + 1);
        else if (!seen[next]) {
          seen[next] = 1;
          patch.push(next);
        }
      }
    }
    if (patch.length >= MIN_MASSIF_CELLS || around.size === 0) continue;
    const [replacement] = [...around].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
    for (const cell of patch) codes[cell] = replacement;
  }
  return codes;
}

export function valueAt(raster, lon, lat) {
  const row = Math.round((raster.north - lat) / raster.step);
  if (row < 0 || row >= raster.height) return NaN;
  const column = Math.round((lon - raster.west) / raster.step);
  const wrapped = ((column % raster.width) + raster.width) % raster.width;
  return raster.values[row * raster.width + wrapped];
}

export function readEsriAscii(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const header = {};
  let at = 0;
  while (/^[a-z_]+$/i.test(tokens[at])) {
    header[tokens[at].toLowerCase()] = Number(tokens[at + 1]);
    at += 2;
  }
  const width = header.ncols;
  const height = header.nrows;
  const step = header.cellsize;
  const half = header.xllcorner === undefined ? 0 : step / 2;
  const values = new Float32Array(width * height);
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(tokens[at + i]);
    values[i] = value === header.nodata_value ? NaN : value;
  }
  return {
    width,
    height,
    step,
    west: (header.xllcenter ?? header.xllcorner) + half,
    north: (header.yllcenter ?? header.yllcorner) + half + (height - 1) * step,
    values,
  };
}

/** ERDDAP refuses an ESRI grid that crosses 180°: ETOPO comes in two halves, joined here. */
export function sideBySide(west, east) {
  const width = west.width + east.width;
  const values = new Float32Array(width * west.height);
  for (let row = 0; row < west.height; row += 1) {
    values.set(west.values.subarray(row * west.width, (row + 1) * west.width), row * width);
    values.set(
      east.values.subarray(row * east.width, (row + 1) * east.width),
      row * width + west.width,
    );
  }
  return { ...west, width, values };
}

/** TIFF LZW: MSB-first codes, clear 256, end 257, width bumped one code early. */
function lzwDecode(input, expected) {
  const out = new Uint8Array(expected);
  let written = 0;
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const length = new Uint16Array(4096);
  for (let i = 0; i < 256; i += 1) {
    suffix[i] = i;
    length[i] = 1;
  }
  let next = 258;
  let width = 9;
  let previous = -1;
  let bitPosition = 0;
  const emit = (code) => {
    const size = length[code];
    let at = written + size - 1;
    for (let c = code; at >= written; c = prefix[c], at -= 1) {
      if (at < expected) out[at] = suffix[c];
    }
    written += size;
  };
  const firstOf = (code) => {
    while (length[code] > 1) code = prefix[code];
    return suffix[code];
  };
  while (bitPosition + width <= input.length * 8 && written < expected) {
    let code = 0;
    for (let b = 0; b < width; b += 1, bitPosition += 1) {
      code = (code << 1) | ((input[bitPosition >> 3] >> (7 - (bitPosition & 7))) & 1);
    }
    if (code === 257) break;
    if (code === 256) {
      next = 258;
      width = 9;
      previous = -1;
      continue;
    }
    if (previous === -1) {
      emit(code);
    } else {
      const known = code < next;
      prefix[next] = previous;
      suffix[next] = firstOf(known ? code : previous);
      length[next] = length[previous] + 1;
      next += 1;
      emit(code);
      if (next + 1 >= 1 << width && width < 12) width += 1;
    }
    previous = code;
  }
  return out;
}

function readTiff(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const little = view.getUint16(0) === 0x4949;
  const u16 = (at) => view.getUint16(at, little);
  const u32 = (at) => view.getUint32(at, little);
  const SIZE = { 3: 2, 4: 4, 12: 8 };
  const tags = new Map();
  const ifd = u32(4);
  for (let i = 0; i < u16(ifd); i += 1) {
    const at = ifd + 2 + i * 12;
    const type = u16(at + 2);
    const count = u32(at + 4);
    const read = {
      3: (p) => u16(p),
      4: (p) => u32(p),
      12: (p) => view.getFloat64(p, little),
    }[type];
    if (read === undefined) continue;
    const base = SIZE[type] * count > 4 ? u32(at + 8) : at + 8;
    tags.set(
      u16(at),
      Array.from({ length: count }, (_, k) => read(base + k * SIZE[type])),
    );
  }
  const [width] = tags.get(256);
  const [height] = tags.get(257);
  if (tags.get(258)[0] !== 8 || tags.get(259)[0] !== 5 || (tags.get(317)?.[0] ?? 1) !== 1) {
    throw new Error('Köppen TIFF: expected uint8, LZW, no predictor');
  }
  const tiled = tags.has(322);
  const tileWidth = tiled ? tags.get(322)[0] : width;
  const tileHeight = tiled ? tags.get(323)[0] : (tags.get(278)?.[0] ?? height);
  const offsets = tags.get(tiled ? 324 : 273);
  const counts = tags.get(tiled ? 325 : 279);
  const across = Math.ceil(width / tileWidth);
  const values = new Uint8Array(width * height);
  offsets.forEach((offset, tile) => {
    const pixels = lzwDecode(
      buffer.subarray(offset, offset + counts[tile]),
      tileWidth * tileHeight,
    );
    const left = (tile % across) * tileWidth;
    const top = Math.floor(tile / across) * tileHeight;
    for (let y = 0; y < tileHeight && top + y < height; y += 1) {
      const rowLength = Math.min(tileWidth, width - left);
      values.set(
        pixels.subarray(y * tileWidth, y * tileWidth + rowLength),
        (top + y) * width + left,
      );
    }
  });
  const [step] = tags.get(33550);
  const [, , , cornerX, cornerY] = tags.get(33922);
  return { width, height, step, west: cornerX + step / 2, north: cornerY - step / 2, values };
}

/** The member as the range request serves it: 30-byte local header, name, extra, deflate. */
export function readKoppenZipMember(buffer) {
  const start = 30 + buffer.readUInt16LE(26) + buffer.readUInt16LE(28);
  return readTiff(inflateRawSync(buffer.subarray(start)));
}

/** netCDF classic or 64-bit offset. `GeoTransform` inherited from the 30 m source is wrong: the
 *  frame comes from the `lat` and `lon` variables, and NaN (no data, north of 80°) is zero. */
export function readNetcdf3(buffer, name) {
  const version = buffer[3];
  let at = 8;
  const int = () => {
    const value = buffer.readInt32BE(at);
    at += 4;
    return value;
  };
  const text = () => {
    const size = int();
    const value = buffer.toString('latin1', at, at + size);
    at += Math.ceil(size / 4) * 4;
    return value;
  };
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 4, 6: 8 };
  const skipAttributes = () => {
    int();
    const count = int();
    for (let i = 0; i < count; i += 1) {
      text();
      const type = int();
      const bytes = int() * TYPE_SIZE[type];
      at += Math.ceil(bytes / 4) * 4;
    }
  };
  const dimensions = Array.from({ length: (int(), int()) }, () => (text(), int()));
  skipAttributes();
  int();
  const variables = new Map();
  const count = int();
  for (let i = 0; i < count; i += 1) {
    const varName = text();
    const dims = Array.from({ length: int() }, () => int());
    skipAttributes();
    const type = int();
    int();
    const begin = version === 2 ? Number(buffer.readBigInt64BE(at)) : buffer.readInt32BE(at);
    at += version === 2 ? 8 : 4;
    variables.set(varName, { dims, type, begin });
  }
  const read = (varName) => {
    const variable = variables.get(varName);
    const size = variable.dims.reduce((total, dim) => total * dimensions[dim], 1);
    const values = new Float64Array(size);
    const reader = { 5: 'readFloatBE', 6: 'readDoubleBE' }[variable.type];
    const bytes = TYPE_SIZE[variable.type];
    for (let i = 0; i < size; i += 1) values[i] = buffer[reader](variable.begin + i * bytes);
    return values;
  };
  const lat = read('lat');
  const lon = read('lon');
  const data = read(name);
  const width = lon.length;
  const height = lat.length;
  const ascending = lat[1] > lat[0];
  const values = new Float32Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const source = ascending ? height - 1 - row : row;
    for (let column = 0; column < width; column += 1) {
      const value = data[source * width + column];
      values[row * width + column] = Number.isNaN(value) ? 0 : value;
    }
  }
  return {
    width,
    height,
    step: Math.abs(lon[1] - lon[0]),
    west: lon[0],
    north: Math.max(lat[0], lat[height - 1]),
    values,
  };
}
