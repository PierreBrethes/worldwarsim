/**
 * **Le même ciel pour tous** (décision de Pierre, 10/10/2026) : le vent est une fonction pure de
 * l'heure UTC et d'une graine fixe — ni aléa à l'exécution, ni état de partie. Deux joueurs voient
 * la même dépression au même instant, et le serveur pourra un jour lire ce module tel quel.
 *
 * The weather is accelerated: a system lives `SYSTEM_LIFE_MS`, so a session sees the sky change.
 */
export const SYSTEM_LIFE_MS = 45 * 60_000;
const SYSTEM_COUNT = 6;
const SEED = 0x1940;
const BACKGROUND_PERIOD_MS = 6 * 3_600_000;
/** Degrees of longitude a system travels over its life in a unit background wind. */
const DRIFT_DEG_PER_LIFE = 22;
const TROPICAL_POLEWARD_DEG = 4;

export type Wind = { readonly u: number; readonly v: number };

export type PressureSystem = {
  readonly lon: number;
  readonly lat: number;
  /** Degrees. */
  readonly radius: number;
  readonly kind: 'low' | 'high';
  readonly tropical: boolean;
  /** 0 → 1 → 0 over the system's life, smooth at both ends so nothing jumps. */
  readonly strength: number;
  /** Peak tangential wind at full strength. */
  readonly peak: number;
};

const RAD = Math.PI / 180;

const zonal = (lat: number): number => -Math.cos(3 * lat * RAD);

function random(a: number, b: number): () => number {
  let state = Math.imul(SEED ^ Math.imul(a + 1, 0x9e3779b1), 0x85ebca6b) ^ Math.imul(b, 0xc2b2ae35);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Each rank lives on its own staggered slots: one system per rank at any instant. */
export function pressureSystemsAt(epochMs: number): PressureSystem[] {
  const systems: PressureSystem[] = [];
  for (let rank = 0; rank < SYSTEM_COUNT; rank++) {
    const shifted = epochMs + (rank * SYSTEM_LIFE_MS) / SYSTEM_COUNT;
    const slot = Math.floor(shifted / SYSTEM_LIFE_MS);
    const age = shifted / SYSTEM_LIFE_MS - slot;
    const next = random(rank, slot);
    const tropical = next() < 0.3;
    const hemisphere = next() < 0.5 ? 1 : -1;
    const lat0 = tropical ? 12 + 10 * next() : 35 + 25 * next();
    const radius = tropical ? 3 + 2 * next() : 9 + 7 * next();
    const kind = tropical || next() < 0.75 ? 'low' : 'high';
    const lon0 = -180 + 360 * next();
    const peak = tropical ? 1.6 + 0.4 * next() : 0.8 + 0.5 * next();
    systems.push({
      lon: wrapLon(lon0 + DRIFT_DEG_PER_LIFE * zonal(lat0) * age),
      lat: hemisphere * (lat0 + (tropical ? TROPICAL_POLEWARD_DEG * age : 0)),
      radius,
      kind,
      tropical,
      strength: Math.sin(Math.PI * age) ** 2,
      peak,
    });
  }
  return systems;
}

/** East (`u`) and north (`v`) components, force ≈ 0 to 2. */
export function windAt(lon: number, lat: number, epochMs: number): Wind {
  const phase = (2 * Math.PI * epochMs) / BACKGROUND_PERIOD_MS;
  const cosLat = Math.cos(lat * RAD);
  let u = zonal(lat) + 0.15 * Math.sin(2 * lon * RAD - phase) * cosLat;
  let v = -0.25 * Math.sin(6 * lat * RAD) + 0.25 * Math.sin(3 * lon * RAD + phase) * cosLat;

  for (const s of pressureSystemsAt(epochMs)) {
    const dx = wrapLon(lon - s.lon) * Math.cos(s.lat * RAD);
    const dy = lat - s.lat;
    const d2 = (dx * dx + dy * dy) / (s.radius * s.radius);
    if (d2 > 16 || d2 === 0) continue;
    // Peaks at d = r/√2 with exactly `peak`: √2·e^½·(d/r)·e^(−d²/r²), divided by d for the unit tangent.
    const speed = (s.peak * s.strength * Math.SQRT2 * Math.exp(0.5 - d2)) / s.radius;
    const spin = (s.kind === 'low' ? 1 : -1) * Math.sign(s.lat);
    u -= spin * speed * dy;
    v += spin * speed * dx;
  }
  return { u, v };
}
