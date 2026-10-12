/**
 * **La même mer pour tous** (décision de Pierre, 10/10/2026) : les courants sont une fonction pure
 * de l'heure UTC, sans aléa ni état de partie, comme le vent (`weather.ts`). Des courants
 * océaniques réels et jamais des routes commerciales : une voie maritime se lirait comme un
 * conseil de route.
 *
 * Each subtropical gyre is a stream function, so its flow closes on itself; the Stommel-like
 * profile across the basin squeezes the return flow against the western coast.
 */
import type { Wind } from './weather';

export type Current = Wind;

const RAD = Math.PI / 180;
const MEANDER_PERIOD_MS = 3 * 3_600_000;
const MEANDER_DEG = 1.5;
const DERIVATIVE_STEP_DEG = 0.05;
/** Share of the basin's width the western boundary current fits in. */
const WESTERN_WIDTH = 0.06;

type Gyre = {
  readonly south: number;
  readonly north: number;
  /** Western edge at `south`, and its drift per degree of latitude: coasts are not meridians. */
  readonly west: number;
  readonly westSlope: number;
  readonly east: number;
  /** Positive turns clockwise seen from above. */
  readonly strength: number;
};

const GYRES: ReadonlyArray<Gyre> = [
  { south: 10, north: 50, west: -84, westSlope: 0.32, east: -15, strength: 5 },
  { south: 10, north: 50, west: 118, westSlope: 0.6, east: -115, strength: 6 },
  { south: -45, north: -10, west: -63, westSlope: 0.73, east: 12, strength: -4 },
  { south: -45, north: -10, west: 149, westSlope: 0.3, east: -75, strength: -4 },
  { south: -40, north: -10, west: 25, westSlope: 0.55, east: 114, strength: -4.5 },
];

const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360;

function streamOf(lon: number, lat: number): number {
  let psi = 0;
  for (const g of GYRES) {
    if (lat <= g.south || lat >= g.north) continue;
    const west = g.west + g.westSlope * (lat - g.south);
    const width = wrap360(g.east - west);
    const across = wrap360(lon - west) / width;
    if (across >= 1) continue;
    const up = Math.sin((Math.PI * (lat - g.south)) / (g.north - g.south)) ** 2;
    psi += g.strength * up * (1 - Math.exp(-across / WESTERN_WIDTH)) * (1 - across);
  }
  return psi;
}

const bell = (lat: number, center: number, width: number) =>
  Math.exp(-(((lat - center) / width) ** 2));

/** Equatorial currents westward, the countercurrent between them eastward, the circumpolar east. */
const zonalOf = (lat: number): number =>
  -0.6 * bell(lat, 2, 4) - 0.3 * bell(lat, -4, 3) + 0.4 * bell(lat, 7, 2) + 0.8 * bell(lat, -53, 7);

/** East (`u`) and north (`v`) components, force ≈ 0 to 1 (western jets), the gyre interiors a tenth of that. */
export function currentAt(lon: number, lat: number, epochMs: number): Current {
  const phase = (2 * Math.PI * epochMs) / MEANDER_PERIOD_MS;
  // The meander moves where the climatology is read, so the currents themselves wander.
  const x = lon + MEANDER_DEG * Math.sin(6 * lat * RAD + phase);
  const y = lat + MEANDER_DEG * Math.sin(18 * lon * RAD - phase);
  const h = DERIVATIVE_STEP_DEG;
  const cosLat = Math.max(0.2, Math.cos(y * RAD));
  const u = -(streamOf(x, y + h) - streamOf(x, y - h)) / (2 * h) + zonalOf(y);
  const v = (streamOf(x + h, y) - streamOf(x - h, y)) / (2 * h * cosLat);
  return { u, v };
}
