import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  readEsriAscii,
  readKoppenZipMember,
  readNetcdf3,
  sideBySide,
  valueAt,
} from './region-terrain.mjs';

describe('lecteur ESRI ASCII', () => {
  const text = [
    'ncols 3',
    'nrows 2',
    'xllcenter 10.0',
    'yllcenter 40.0',
    'cellsize 0.5',
    'nodata_value -99999',
    '1 2 3',
    '4 -99999 6',
    '',
  ].join('\n');

  it('range les rangs du nord au sud et place le centre de la première cellule', () => {
    const raster = readEsriAscii(text);
    expect(raster).toMatchObject({ width: 3, height: 2, west: 10, north: 40.5, step: 0.5 });
    expect(valueAt(raster, 10, 40.5)).toBe(1);
    expect(valueAt(raster, 11, 40)).toBe(6);
    expect(valueAt(raster, 10.5, 40)).toBeNaN();
  });

  it("met la moitié ouest à gauche de l'est sans décaler une longitude", () => {
    const west = readEsriAscii(text.replace('xllcenter 10.0', 'xllcenter 8.5'));
    const east = readEsriAscii(text);
    const both = sideBySide(west, east);
    expect(both.width).toBe(6);
    expect(valueAt(both, 9.5, 40.5)).toBe(3);
    expect(valueAt(both, 10, 40.5)).toBe(1);
  });
});

/** Un encodeur LZW de TIFF (MSB d'abord, changement de largeur anticipé d'un code) — la
 *  référence indépendante du décodeur, au plus court. */
function lzwEncode(bytes) {
  const codes = [256];
  const table = new Map();
  for (let i = 0; i < 256; i += 1) table.set(String.fromCharCode(i), i);
  let next = 258;
  let widths = [9];
  let width = 9;
  let word = '';
  for (const byte of bytes) {
    const extended = word + String.fromCharCode(byte);
    if (table.has(extended)) {
      word = extended;
      continue;
    }
    codes.push(table.get(word));
    widths.push(width);
    table.set(extended, next);
    next += 1;
    if (next + 1 === 1 << width) width += 1;
    word = String.fromCharCode(byte);
  }
  codes.push(table.get(word), 257);
  widths.push(width, width);
  let bits = '';
  codes.forEach((code, i) => (bits += code.toString(2).padStart(widths[i], '0')));
  bits = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0');
  return Uint8Array.from(bits.match(/.{8}/g), (octet) => parseInt(octet, 2));
}

/** Un GeoTIFF à une tuile 4 × 4, petit-boutiste, puis son membre de zip comme le sert la requête
 *  de plage : en-tête local, nom, flux deflate. */
function koppenMember(pixels) {
  const strip = lzwEncode(pixels);
  const entries = [
    [256, 3, 1, 4],
    [257, 3, 1, 4],
    [258, 3, 1, 8],
    [259, 3, 1, 5],
    [322, 3, 1, 4],
    [323, 3, 1, 4],
    [324, 4, 1, 0],
    [325, 4, 1, strip.length],
    [33550, 12, 3, 0],
    [33922, 12, 6, 0],
  ];
  const ifdAt = 8;
  const extraAt = ifdAt + 2 + entries.length * 12 + 4;
  const scaleAt = extraAt;
  const tieAt = scaleAt + 24;
  const stripAt = tieAt + 48;
  entries[6][3] = stripAt;
  entries[8][3] = scaleAt;
  entries[9][3] = tieAt;
  const tiff = new DataView(new ArrayBuffer(stripAt + strip.length));
  tiff.setUint16(0, 0x4949, true);
  tiff.setUint16(2, 42, true);
  tiff.setUint32(4, ifdAt, true);
  tiff.setUint16(ifdAt, entries.length, true);
  entries.forEach(([tag, type, count, value], i) => {
    const at = ifdAt + 2 + i * 12;
    tiff.setUint16(at, tag, true);
    tiff.setUint16(at + 2, type, true);
    tiff.setUint32(at + 4, count, true);
    if (type === 3) tiff.setUint16(at + 8, value, true);
    else tiff.setUint32(at + 8, value, true);
  });
  [1, 1, 0].forEach((v, i) => tiff.setFloat64(scaleAt + i * 8, v, true));
  [0, 0, 0, -2, 2, 0].forEach((v, i) => tiff.setFloat64(tieAt + i * 8, v, true));
  new Uint8Array(tiff.buffer).set(strip, stripAt);

  const name = Buffer.from('k.tif');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(name.length, 26);
  return Buffer.concat([header, name, deflateRawSync(new Uint8Array(tiff.buffer))]);
}

describe('lecteur Köppen (membre de zip, TIFF LZW à tuiles)', () => {
  it('rend les pixels décodés et le centre de la première cellule', () => {
    const pixels = [1, 1, 1, 1, 4, 4, 4, 4, 14, 14, 29, 30, 0, 0, 0, 3];
    const raster = readKoppenZipMember(koppenMember(pixels));
    expect(raster).toMatchObject({ width: 4, height: 4, west: -1.5, north: 1.5, step: 1 });
    expect([...raster.values]).toEqual(pixels);
    expect(valueAt(raster, 1.5, -1.5)).toBe(3);
  });
});

/** Un netCDF-3 à décalages 64 bits : lat montante, lon, et une variable double [lat][lon]. */
function netcdf({ lat, lon, data }) {
  const parts = [];
  const int = (v) => {
    const b = Buffer.alloc(4);
    b.writeInt32BE(v);
    parts.push(b);
  };
  const name = (s) => {
    int(s.length);
    parts.push(Buffer.from(s.padEnd(Math.ceil(s.length / 4) * 4, '\0')));
  };
  const doubles = (values) => {
    const b = Buffer.alloc(values.length * 8);
    values.forEach((v, i) => b.writeDoubleBE(v, i * 8));
    return b;
  };
  const variables = [
    ['lat', [0], doubles(lat)],
    ['lon', [1], doubles(lon)],
    ['band_data', [0, 1], doubles(data)],
  ];
  parts.push(Buffer.from('CDF\x02'));
  int(0);
  int(0x0a);
  int(2);
  name('lat');
  int(lat.length);
  name('lon');
  int(lon.length);
  int(0x0c);
  int(1);
  name('title');
  int(2);
  int(3);
  parts.push(Buffer.from('ab\0\0'));
  int(0x0b);
  int(variables.length);
  const begins = [];
  for (const [varName, dims, payload] of variables) {
    name(varName);
    int(dims.length);
    dims.forEach(int);
    int(0);
    int(0);
    int(6);
    int(payload.length);
    begins.push(parts.length);
    parts.push(Buffer.alloc(8));
  }
  let offset = Buffer.concat(parts).length;
  for (const [i, [, , payload]] of variables.entries()) {
    parts[begins[i]].writeBigInt64BE(BigInt(offset));
    offset += payload.length;
  }
  return Buffer.concat([...parts, ...variables.map(([, , payload]) => payload)]);
}

describe('lecteur netCDF-3 (Hansen)', () => {
  it('retourne les rangs au nord et vaut zéro là où la source ne dit rien', () => {
    const raster = readNetcdf3(
      netcdf({ lat: [-0.5, 0.5], lon: [10.5, 11.5, 12.5], data: [0.1, 0.2, NaN, 0.4, 0.5, 0.6] }),
      'band_data',
    );
    expect(raster).toMatchObject({ width: 3, height: 2, west: 10.5, north: 0.5, step: 1 });
    expect(valueAt(raster, 10.5, 0.5)).toBeCloseTo(0.4);
    expect(valueAt(raster, 12.5, -0.5)).toBe(0);
  });
});
