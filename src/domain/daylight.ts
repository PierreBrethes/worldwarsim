import type { LonLat } from './geo';

/**
 * **Le jour et la nuit suivent le vrai soleil** (décision de Pierre, 13/10/2026, qui remplace le
 * cycle de 5 h) : il fait nuit à Paris quand il fait nuit à Paris. Une fonction pure de l'heure et
 * du lieu, la même pour tous, comme le vent ; rien ne la lit pour une règle.
 */

/** Sun altitudes bounding the twilight: above, full day; below, full night (end of nautical dusk). */
export const DAY_ALTITUDE_DEG = 4;
export const NIGHT_ALTITUDE_DEG = -12;

const J2000_MS = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86_400_000;
const RAD = Math.PI / 180;

const wrap180 = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

/**
 * Where the sun stands at the zenith: the low-precision almanac formulas (a hundredth of a degree
 * over the century), declination and equation of time included through the right ascension.
 */
export function subsolarPoint(epochMs: number): LonLat {
  const days = (epochMs - J2000_MS) / DAY_MS;
  const anomaly = (357.529 + 0.98560028 * days) * RAD;
  const meanLongitude = 280.459 + 0.98564736 * days;
  const longitude =
    (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD;
  const obliquity = (23.439 - 0.00000036 * days) * RAD;
  const rightAscension =
    Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude)) / RAD;
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(longitude)) / RAD;
  const siderealTime = 280.46061837 + 360.98564736629 * days;
  return [wrap180(rightAscension - siderealTime), declination];
}

/** The sun's height above the horizon at `at`, in degrees. */
export function sunAltitude(sun: LonLat, at: LonLat): number {
  const [sunLon, sunLat] = sun;
  const [lon, lat] = at;
  const sine =
    Math.sin(lat * RAD) * Math.sin(sunLat * RAD) +
    Math.cos(lat * RAD) * Math.cos(sunLat * RAD) * Math.cos((lon - sunLon) * RAD);
  return Math.asin(Math.min(1, Math.max(-1, sine))) / RAD;
}

/** 0 in full day, 1 in full night, a smooth twilight between. The board's shader mirrors it. */
export function nightOfAltitude(altitude: number): number {
  const t = Math.min(
    1,
    Math.max(0, (DAY_ALTITUDE_DEG - altitude) / (DAY_ALTITUDE_DEG - NIGHT_ALTITUDE_DEG)),
  );
  return t * t * (3 - 2 * t);
}

export const nightAt = (epochMs: number, at: LonLat): number =>
  nightOfAltitude(sunAltitude(subsolarPoint(epochMs), at));

/** The lamp never lights from lower than this (choix de Pierre, #194) : un soleil rasant noie la
 *  carte sous les ombres. */
export const LAMP_FLOOR_DEG = 25;

export type SunLight = {
  /** Toward the subsolar point, in radians clockwise from north. */
  readonly azimuth: number;
  /** The sun's true height where one looks, in degrees. */
  readonly altitude: number;
  /** The height the lamp lights from: the altitude, never below `LAMP_FLOOR_DEG`. */
  readonly elevation: number;
};

/** **La lampe de la table est le soleil** (#195) : sa direction et sa hauteur là où l'on regarde. */
export function sunLightAt(epochMs: number, at: LonLat): SunLight {
  const sun = subsolarPoint(epochMs);
  const [lon, lat] = at;
  const phi = lat * RAD;
  const sunLat = sun[1] * RAD;
  const dLon = (sun[0] - lon) * RAD;
  const azimuth = Math.atan2(
    Math.sin(dLon) * Math.cos(sunLat),
    Math.cos(phi) * Math.sin(sunLat) - Math.sin(phi) * Math.cos(sunLat) * Math.cos(dLon),
  );
  const altitude = sunAltitude(sun, at);
  return {
    azimuth: (azimuth + 2 * Math.PI) % (2 * Math.PI),
    altitude,
    elevation: Math.max(altitude, LAMP_FLOOR_DEG),
  };
}

/**
 * **La lune est une lampe fixe** (#198) : l'azimut du soleil est singulier à l'antipode du point
 * subsolaire, et c'est là, de nuit, qu'on regarde — un degré de carte y faisait pivoter les ombres
 * de 90°, et chaque battement de l'horloge les tournait encore. La nuit, la lampe reste donc au
 * même endroit, comme dans la maquette (`carte-refonte`).
 * @a-mesurer posée à l'œil sur la maquette ; rien ne mesure d'où la lune éclaire le mieux les pièces
 */
export const MOON_AZIMUTH_DEG = 315;
export const MOON_ELEVATION_DEG = 53;

export type LampDirection = Pick<SunLight, 'azimuth' | 'elevation'>;

const toward = ({ azimuth, elevation }: LampDirection): [number, number, number] => [
  Math.sin(azimuth) * Math.cos(elevation * RAD),
  Math.sin(elevation * RAD),
  Math.cos(azimuth) * Math.cos(elevation * RAD),
];

/**
 * Where the lamp stands: the sun by day, the moon by night, and in the twilight the two blended as
 * directions — never as angles, whose short way round flips when the sun is opposite the moon.
 * `night` is the dark where one looks (`nightOfAltitude`), 0 to 1.
 */
export function lampDirection(sun: SunLight, night: number): LampDirection {
  const moon = toward({ azimuth: MOON_AZIMUTH_DEG * RAD, elevation: MOON_ELEVATION_DEG });
  const day = toward(sun);
  const [x, y, z] = day.map((component, k) => component + (moon[k]! - component) * night) as [
    number,
    number,
    number,
  ];
  return {
    azimuth: (Math.atan2(x, z) + 2 * Math.PI) % (2 * Math.PI),
    elevation: Math.asin(y / Math.hypot(x, y, z)) / RAD,
  };
}

export type DayCycle = 'twoHours' | 'hour' | 'real';
export const DAY_CYCLES: ReadonlyArray<DayCycle> = ['twoHours', 'hour', 'real'];
/** Deux heures (#193) : une partie du soir voit passer le jour et la nuit sans qu'ils filent. */
export const DEFAULT_DAY_CYCLE: DayCycle = 'twoHours';
export const isDayCycle = (value: unknown): value is DayCycle =>
  DAY_CYCLES.includes(value as DayCycle);

const HOUR_MS = 3_600_000;
const CYCLE_MS: Record<DayCycle, number> = { twoHours: 2 * HOUR_MS, hour: HOUR_MS, real: DAY_MS };

/**
 * The instant the board's sun is read at. Sped up, a whole day runs in each real cycle: the hour of
 * day is the time into the real cycle, set on the real date, so the declination stays the day's.
 * It only steps back at the cycle mark, by the day's drift of the sun (under a degree).
 */
export function boardInstant(epochMs: number, cycle: DayCycle): number {
  const period = CYCLE_MS[cycle];
  return epochMs - (epochMs % DAY_MS) + ((epochMs % period) / period) * DAY_MS;
}
