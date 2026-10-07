/**
 * Reads the Regierungsbezirke of the BKG's VG2500 (`VG2500_RBZ.shp`, licence dl-de/by-2-0,
 * © GeoBasis-DE / BKG) as lon/lat GeoJSON, for `generate-regions.mjs` to cut a Land into.
 *
 * Natural Earth stops at the sixteen Länder, the coarsest admin-1 of any playable nation —
 * Bavaria alone is twelve French departments, and one building stands per region. The
 * districts are the official tier just below, and the one Germany itself counts in.
 *
 * The shapefile is read by hand rather than through a dependency: polygons and a flat
 * attribute table are all VG2500 holds, and the inverse projection is the textbook series.
 */
import { readFileSync } from 'node:fs';

/**
 * The Länder cut, keyed by their BKG code, to the `adm1_code` Natural Earth gives them. The
 * five Länder that have districts and are left whole are left whole on purpose: Nordrhein-
 * Westfalen holds the Ruhr and Niedersachsen the Salzgitter ore, both keyed by their Land.
 */
export const SPLIT_LÄNDER = {
  '06': 'DEU-1574', // Hessen
  '08': 'DEU-1573', // Baden-Württemberg
  '09': 'DEU-1591', // Bayern
};

const attributesOf = (dbf) => {
  const count = dbf.readUInt32LE(4);
  const headerLength = dbf.readUInt16LE(8);
  const recordLength = dbf.readUInt16LE(10);
  const fields = [];
  for (let offset = 32; dbf[offset] !== 0x0d; offset += 32) {
    fields.push({
      name: dbf.toString('latin1', offset, offset + 11).replace(/\0.*$/, ''),
      length: dbf[offset + 16],
    });
  }
  return Array.from({ length: count }, (_, record) => {
    let offset = headerLength + record * recordLength + 1;
    const row = {};
    for (const field of fields) {
      row[field.name] = dbf.toString('utf8', offset, offset + field.length).trim();
      offset += field.length;
    }
    return row;
  });
};

const ringsOf = (shp) => {
  const shapes = [];
  for (let offset = 100; offset < shp.length;) {
    const contentLength = shp.readInt32BE(offset + 4) * 2;
    const content = offset + 8;
    if (shp.readInt32LE(content) !== 5) throw new Error('VG2500_RBZ: polygons expected');
    const partCount = shp.readInt32LE(content + 36);
    const pointCount = shp.readInt32LE(content + 40);
    const parts = Array.from({ length: partCount }, (_, i) =>
      shp.readInt32LE(content + 44 + 4 * i),
    );
    const points = content + 44 + 4 * partCount;
    shapes.push(
      parts.map((start, i) => {
        const end = i + 1 < partCount ? parts[i + 1] : pointCount;
        const ring = [];
        for (let p = start; p < end; p++) {
          ring.push([shp.readDoubleLE(points + 16 * p), shp.readDoubleLE(points + 16 * p + 8)]);
        }
        return ring;
      }),
    );
    offset = content + contentLength;
  }
  return shapes;
};

/** ETRS89 / UTM 32N (EPSG:25832) to lon/lat — Snyder's series, well under a metre here. */
const fromUtm32 = ([easting, northing]) => {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const x = easting - 500000;
  const mu = northing / k0 / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const sin = Math.sin(phi1);
  const cos = Math.cos(phi1);
  const c1 = ep2 * cos ** 2;
  const t1 = Math.tan(phi1) ** 2;
  const n1 = a / Math.sqrt(1 - e2 * sin ** 2);
  const r1 = (a * (1 - e2)) / (1 - e2 * sin ** 2) ** 1.5;
  const d = x / (n1 * k0);
  const latitude =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6) / 720);
  const longitude =
    9 * (Math.PI / 180) +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5) / 120) /
      cos;
  return [(longitude * 180) / Math.PI, (latitude * 180) / Math.PI];
};

const signedArea = (ring) => {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
};

const contains = (ring, [x, y]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * The shapefile winds an outer ring clockwise in a plane where north is up — the winding d3-geo
 * reads as "the small side" — and a hole the other way, without saying which outer ring holds
 * it. Freiburg has two outer rings — Büsingen, the German exclave inside Switzerland — so a
 * district is a MultiPolygon and every hole looks for its owner.
 */
const polygonsOf = (rings) => {
  const outers = rings.filter((ring) => signedArea(ring) < 0).map((ring) => [ring]);
  for (const hole of rings.filter((ring) => signedArea(ring) >= 0)) {
    const owner = outers.find(([outer]) => contains(outer, hole[0]));
    if (!owner) throw new Error('VG2500_RBZ: a hole outside every ring');
    owner.push(hole);
  }
  return outers;
};

/**
 * The id is the district's NUTS 2 code under the country prefix every admin-1 id carries:
 * stable, official, and readable in a test.
 */
export function germanDistricts(shpPath) {
  const shapes = ringsOf(readFileSync(shpPath));
  const rows = attributesOf(readFileSync(shpPath.replace(/\.shp$/i, '.dbf')));
  if (shapes.length !== rows.length) throw new Error('VG2500_RBZ: .shp and .dbf disagree');
  const features = rows.flatMap((row, i) => {
    const land = SPLIT_LÄNDER[row.SN_L];
    if (!land) return [];
    return [
      {
        type: 'Feature',
        properties: { id: `DEU-${row.NUTS}`, land, name: row.GEN },
        geometry: {
          type: 'MultiPolygon',
          coordinates: polygonsOf(shapes[i]).map((polygon) =>
            polygon.map((ring) => ring.map(fromUtm32)),
          ),
        },
      },
    ];
  });
  const found = new Set(features.map((feature) => feature.properties.land));
  const missing = Object.values(SPLIT_LÄNDER).filter((land) => !found.has(land));
  if (missing.length > 0) throw new Error(`VG2500_RBZ: no district for ${missing.join(', ')}`);
  return { type: 'FeatureCollection', features };
}
