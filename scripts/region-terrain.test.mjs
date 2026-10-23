import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { geoNaturalEarth1 } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import {
  CELL_TYPES,
  classifyCells,
  classifyRegions,
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

/**
 * Un monde de 6 × 6 cellules de 1°, une région carrée qui le couvre — la projection est
 * l'identité retournée. Chaque fait se fabrique par une fonction de (colonne, rang), rang 0 au
 * nord.
 */
function classifyWorld({ elevation = () => 100, climate = () => 15, forest = () => 0.1 }) {
  const raster = (valueOf) => ({
    width: 6,
    height: 6,
    west: 0.5,
    north: 5.5,
    step: 1,
    values: Float32Array.from({ length: 36 }, (_, i) => valueOf(i % 6, Math.floor(i / 6))),
  });
  const square = [
    [0, 4],
    [6, 4],
    [6, 10],
    [0, 10],
    [0, 4],
  ];
  const types = classifyRegions(
    [{ id: 'R', rings: [square], point: [3, 3] }],
    { relief: raster(elevation), climate: raster(climate), forest: raster(forest) },
    { project: (lon, lat) => [lon, 10 - lat], width: 360 },
  );
  return types.get('R');
}

describe('la règle de classification', () => {
  it('fait une montagne du dénivelé, jamais de la seule altitude', () => {
    expect(classifyWorld({ elevation: (column) => (column % 2) * 800 })).toBe('mountain');
    expect(classifyWorld({ elevation: () => 3000, climate: () => 30 })).toBe('tundra');
    expect(classifyWorld({ elevation: () => 2000 })).toBe('plain');
  });

  it("abaisse le seuil de dénivelé au-dessus de l'altitude des hauts plateaux", () => {
    expect(classifyWorld({ elevation: (column) => 1600 + (column % 2) * 400 })).toBe('mountain');
    expect(classifyWorld({ elevation: (column) => 200 + (column % 2) * 400 })).toBe('plain');
  });

  it("ne compte pas la profondeur de la mer dans le dénivelé d'une côte", () => {
    expect(
      classifyWorld({
        elevation: (column) => (column === 0 ? -3000 : 50),
        climate: (column) => (column === 0 ? 0 : 15),
      }),
    ).toBe('plain');
  });

  it('veut une majorité absolue de montagne, pas une pluralité', () => {
    const half = (column, row) => (row < 1 && column % 2 ? 900 : 0);
    expect(classifyWorld({ elevation: half, climate: () => 4 })).toBe('desert');
  });

  it("lit le désert et la toundra au climat dominant, la steppe n'est pas un désert", () => {
    expect(classifyWorld({ climate: (column) => (column < 4 ? 4 : 15) })).toBe('desert');
    expect(classifyWorld({ climate: () => 29 })).toBe('tundra');
    expect(classifyWorld({ climate: () => 7 })).toBe('plain');
  });

  it("range le subarctique avec le froid : toundra s'il est nu, forêt s'il porte la taïga", () => {
    expect(classifyWorld({ climate: (column) => (column < 2 ? 29 : 27) })).toBe('tundra');
    expect(classifyWorld({ climate: () => 27, forest: () => 0.35 })).toBe('forest');
    expect(classifyWorld({ climate: () => 27, forest: () => 0.25 })).toBe('tundra');
    expect(classifyWorld({ climate: () => 26 })).toBe('plain');
  });

  it('sépare la jungle de la savane, et la forêt de la plaine, par la part de forêt', () => {
    expect(classifyWorld({ climate: () => 1, forest: () => 0.8 })).toBe('jungle');
    expect(classifyWorld({ climate: () => 3, forest: () => 0.1 })).toBe('plain');
    expect(classifyWorld({ climate: () => 15, forest: () => 0.6 })).toBe('forest');
    expect(classifyWorld({ climate: () => 15, forest: () => 0.2 })).toBe('plain');
  });

  const islet = (climate) =>
    classifyRegions(
      [
        {
          id: 'islet',
          rings: [
            [
              [2.1, 9.6],
              [2.3, 9.6],
              [2.3, 9.8],
              [2.1, 9.6],
            ],
          ],
          point: [2.2, 0.3],
        },
      ],
      {
        relief: {
          width: 4,
          height: 1,
          west: 0.5,
          north: 0.5,
          step: 1,
          values: new Float32Array(4),
        },
        climate: { width: 4, height: 1, west: 0.5, north: 0.5, step: 1, values: climate },
        forest: {
          width: 4,
          height: 1,
          west: 0.5,
          north: 0.5,
          step: 1,
          values: new Float32Array(4),
        },
      },
      { project: (lon, lat) => [lon, 10 - lat], width: 360 },
    ).get('islet');

  it("lit au point intérieur la région qu'aucun échantillon ne touche", () => {
    expect(islet(Uint8Array.of(15, 15, 4, 15))).toBe('desert');
  });

  it('prend le climat de la terre la plus proche quand le point tombe en mer à 0,1°', () => {
    expect(islet(Uint8Array.of(15, 0, 0, 4))).toBe('desert');
  });
});

/**
 * Un monde de 10 × 10 échantillons de 1°, une cellule par échantillon (la projection est
 * l'identité retournée) : chaque fait se fabrique par une fonction de (colonne, rang).
 */
function cellWorld({ elevation = () => 100, climate = () => 15, forest = () => 0.1 }) {
  const raster = (valueOf) => ({
    width: 10,
    height: 10,
    west: 0.5,
    north: 9.5,
    step: 1,
    values: Float32Array.from({ length: 100 }, (_, i) => valueOf(i % 10, Math.floor(i / 10))),
  });
  const codes = classifyCells(
    { relief: raster(elevation), climate: raster(climate), forest: raster(forest) },
    { project: (lon, lat) => [lon, 10 - lat], width: 10, height: 10, perUnit: 1 },
  );
  return (column, row) => CELL_TYPES[codes[row * 10 + column]];
}

describe('le terrain par cellule', () => {
  it('décide chaque cellule sur ses seuls échantillons, aux seuils des régions', () => {
    const typeAt = cellWorld({
      climate: (column) => (column < 5 ? 4 : 15),
      forest: (column) => (column < 5 ? 0 : 0.6),
      elevation: (column, row) => (row >= 7 && column >= 5 ? (column % 2) * 900 : 100),
    });
    expect(typeAt(1, 1)).toBe('desert');
    expect(typeAt(8, 1)).toBe('forest');
    expect(typeAt(7, 8)).toBe('mountain');
  });

  it('laisse nue la cellule où ne tombe aucun échantillon de terre', () => {
    expect(cellWorld({ climate: (column) => (column < 5 ? 0 : 15) })(1, 1)).toBe('plain');
  });

  it("ne fait pas un massif d'une cellule isolée, mais garde un massif de neuf", () => {
    const typeAt = cellWorld({
      forest: () => 0.6,
      climate: (column, row) =>
        (column === 1 && row === 1) || (column >= 5 && column < 8 && row >= 5 && row < 8) ? 4 : 15,
    });
    expect(typeAt(1, 1)).toBe('forest');
    expect(typeAt(6, 6)).toBe('desert');
  });
});

describe('le relief des cellules', () => {
  it("ne fait pas une montagne d'un haut plateau : seul le dénivelé compte", () => {
    const plateau = (column) => 1600 + (column % 2) * 400;
    expect(classifyWorld({ elevation: plateau })).toBe('mountain');
    expect(cellWorld({ elevation: plateau })(4, 4)).toBe('plain');
    expect(cellWorld({ elevation: (column) => (column % 2) * 800 })(4, 4)).toBe('mountain');
  });
});

describe('les cellules cuites, aux points nommés', () => {
  const baked = JSON.parse(readFileSync('public/terrain-cells.json', 'utf8'));
  const codes = new Uint8Array(baked.width * baked.height);
  for (let i = 0, at = 0; i < baked.runs.length; at += baked.runs[i + 1], i += 2)
    codes.fill(baked.runs[i], at, at + baked.runs[i + 1]);
  const plane = geoNaturalEarth1().fitExtent(
    [
      [0, 0],
      [400, 208],
    ],
    { type: 'Sphere' },
  );
  const typeAt = (lon, lat) => {
    const [x, y] = plane([lon, lat]);
    const perUnit = baked.width / 400;
    return baked.types[codes[Math.floor(y * perUnit) * baked.width + Math.floor(x * perUnit)]];
  };

  it('laisse nus les fonds de bassin et les plaines', () => {
    for (const [lon, lat] of [
      [-113.5, 40.8], // désert du lac Salé
      [-118.5, 39.8], // Carson Sink
      [-115.8, 38.5], // Railroad Valley, à 1 500 m
      [-120.5, 37], // Central Valley
      [-103, 39], // Hautes Plaines du Colorado
    ])
      expect(['plain', 'desert']).toContain(typeAt(lon, lat));
  });

  it('dessine les chaînes en montagne', () => {
    for (const [lon, lat] of [
      [-111.6, 40.6], // Wasatch
      [-119.3, 37.5], // Sierra Nevada
      [-105.6, 40], // Front Range
      [7.9, 46.5], // Alpes bernoises
      [8, 61.6], // Jotunheimen
      [86.9, 28], // Himalaya
      [-70, -33], // Andes
    ])
      expect(typeAt(lon, lat)).toBe('mountain');
  });
});
