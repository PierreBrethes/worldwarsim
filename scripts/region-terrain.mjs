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
