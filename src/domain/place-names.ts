import { boxesOverlap, type ScreenBox } from './label-groups';

/**
 * **Les noms du décor cèdent toujours** (#440) : une ville ou un fleuve ne s'écrit que là où rien
 * du jeu n'est déjà, ni pièce, ni étiquette, ni nom de gisement. A name has spots to try in
 * order; a city has its point too, drawn only where it is free.
 */
export type NameCandidate = {
  readonly anchor: ScreenBox | null;
  readonly spots: readonly ScreenBox[];
  /** Where the name may stand off when its point is covered: the name is then written alone,
   *  so a city under one's pieces is still named. */
  readonly aside?: readonly ScreenBox[];
};

/**
 * The names written, in the candidates' order (capitals, rivers, then cities by population: an
 * earlier one keeps its place), each against the occupied boxes and the names before it, until
 * `budget` names are written.
 */
export function placeNames(
  candidates: readonly NameCandidate[],
  occupied: readonly ScreenBox[],
  budget: number,
): { index: number; spot: number; point: boolean }[] {
  const taken = [...occupied];
  const free = (box: ScreenBox) => !taken.some((other) => boxesOverlap(other, box, 0));
  const placed: { index: number; spot: number; point: boolean }[] = [];
  for (let index = 0; index < candidates.length && placed.length < budget; index++) {
    const { anchor, spots, aside = [] } = candidates[index]!;
    const point = anchor !== null && free(anchor);
    const tried = anchor === null || point ? spots : [...spots, ...aside];
    const spot = tried.findIndex(free);
    if (spot < 0) continue;
    if (point) taken.push(anchor);
    taken.push(tried[spot]!);
    placed.push({ index, spot, point });
  }
  return placed;
}

/** Where a river's name can lie: a point of it, the direction there, and how far either side
 *  it runs straight, all in map units. */
export type RiverSpot = {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly half: number;
};

/** The middle first, then out towards the ends. */
const ALONG = [0.5, 0.4, 0.6, 0.3, 0.7];
/** A run is straight while no point strays from its chord by more than this share of it. */
const STRAIGHT = 0.12;

/**
 * The spots on the longest line of a river, each the longest straight run around a point:
 * straight as a share of its own length, so the name lies along the river at any zoom.
 */
export function riverSpots(lines: readonly Float32Array[]): RiverSpot[] {
  const lengthOf = (line: Float32Array) => {
    let sum = 0;
    for (let i = 2; i < line.length; i += 2)
      sum += Math.hypot(line[i]! - line[i - 2]!, line[i + 1]! - line[i - 1]!);
    return sum;
  };
  const line = lines.reduce<Float32Array | null>(
    (best, each) => (best === null || lengthOf(each) > lengthOf(best) ? each : best),
    null,
  );
  if (line === null) return [];
  const along = [0];
  for (let i = 2; i < line.length; i += 2)
    along.push(along.at(-1)! + Math.hypot(line[i]! - line[i - 2]!, line[i + 1]! - line[i - 1]!));
  const total = along.at(-1)!;
  if (total < 0.01) return [];
  const pointAt = (d: number): [number, number] => {
    let i = 1;
    while (i < along.length - 1 && along[i]! < d) i++;
    const t = (d - along[i - 1]!) / (along[i]! - along[i - 1]! || 1);
    return [
      line[2 * i - 2]! + (line[2 * i]! - line[2 * i - 2]!) * t,
      line[2 * i - 1]! + (line[2 * i + 1]! - line[2 * i - 1]!) * t,
    ];
  };
  const straight = (from: number, to: number) => {
    const [ax, ay] = pointAt(from);
    const [bx, by] = pointAt(to);
    const chord = Math.hypot(bx - ax, by - ay);
    if (chord === 0) return false;
    for (let k = 1; k < 16; k++) {
      const [x, y] = pointAt(from + ((to - from) * k) / 16);
      if (Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) / chord > STRAIGHT * chord)
        return false;
    }
    return true;
  };
  return ALONG.flatMap((share) => {
    const middle = share * total;
    let half = 0;
    for (const h of [0.03, 0.06, 0.1, 0.15, 0.2].map((part) => part * total))
      if (middle - h >= 0 && middle + h <= total && straight(middle - h, middle + h)) half = h;
    if (half === 0) return [];
    const [ax, ay] = pointAt(middle - half);
    const [bx, by] = pointAt(middle + half);
    const [x, y] = pointAt(middle);
    return [{ x, y, angle: Math.atan2(by - ay, bx - ax), half }];
  });
}

/**
 * **Les villes selon la distance** (#440) : au-delà de 65 rien, ni pendant un rejeu ; puis les
 * capitales ; sous 55 les villes de plus d'un million ; sous 34 toutes. Au doigt, un palier de
 * moins. Une capitale de moins de 300 000 habitants (Vaduz, Monaco) attend le palier de toutes.
 * @a-mesurer paliers lus sur les captures de la maquette A, aucune mesure de lisibilité
 */
const NAMES_GONE_DISTANCE = 65;
const CITY_TIERS = [NAMES_GONE_DISTANCE, 55, 34, 0];
const MILLION = 1_000_000;
const SMALL_CAPITAL = 300_000;

/** Whether the decor's names show at all: not far from the board, not during a replay. */
export function namesShown(distance: number, replaying: boolean): boolean {
  return !replaying && distance < NAMES_GONE_DISTANCE;
}

/** The continent's zoom: the capitals-only tier, where names are shown but no million-city yet
 *  (#466, the « Aucun accrochage » banner stands only here). */
export function continentZoom(distance: number): boolean {
  return distance >= CITY_TIERS[1]! && distance < NAMES_GONE_DISTANCE;
}

/** The cities to name at this distance, in their order. */
export function namedCities<
  City extends { readonly capital: boolean; readonly population: number },
>(
  cities: readonly City[],
  { distance, touch, replaying }: { distance: number; touch: boolean; replaying: boolean },
): City[] {
  if (!namesShown(distance, replaying)) return [];
  const tier = CITY_TIERS.findIndex((under) => distance >= under) - 1 - (touch ? 1 : 0);
  return cities.filter(
    ({ capital, population }) =>
      tier >= 2 ||
      (capital ? tier >= 0 && population >= SMALL_CAPITAL : tier >= 1 && population > MILLION),
  );
}

/**
 * **Les mers selon la distance** (#457, revue du 05/11) : au-delà de 65 rien, ni océan ni
 * pendant un rejeu ; puis les rangs 0 à 2 (océans, Méditerranée, mer du Nord, Baltique), ceux
 * que la maquette A écrit au continent ; sous 45 les rangs 3 et 4 (Manche, Égée). Au doigt, un
 * palier de moins. @a-mesurer paliers lus sur la maquette A, aucune capture des mers seules
 */
const SEA_TIERS = [NAMES_GONE_DISTANCE, 45, 0];
const SEA_RANKS = [2, 4];

/** The seas to name at this distance, in their order. */
export function namedSeas<Sea extends { readonly rank: number }>(
  seas: readonly Sea[],
  { distance, touch, replaying }: { distance: number; touch: boolean; replaying: boolean },
): Sea[] {
  if (!namesShown(distance, replaying)) return [];
  const tier = SEA_TIERS.findIndex((under) => distance >= under) - 1 - (touch ? 1 : 0);
  return tier < 0 ? [] : seas.filter(({ rank }) => rank <= SEA_RANKS[tier]!);
}

/** The seas have a budget of their own, after the cities: six at the desk, three on a phone.
 *  @a-mesurer lu sur la maquette A, qui en écrit onze sur l'Europe */
export const SEA_BUDGET = { desk: 6, touch: 3 };

/** Over sixteen letters, a sea's name goes on two lines, cut at the blank nearest its middle. */
export function seaLines(name: string): string[] {
  if (name.length <= 16) return [name];
  let cut = -1;
  for (let i = 0; i < name.length; i++)
    if (
      name[i] === ' ' &&
      (cut < 0 || Math.abs(i - name.length / 2) < Math.abs(cut - name.length / 2))
    )
      cut = i;
  return cut < 0 ? [name] : [name.slice(0, cut), name.slice(cut + 1)];
}

/**
 * **Le nom tient dans sa mer** (#457) : a spot is offered only where the disc that fits in the
 * sea there spans the name's width on the screen. The box is the name's, centred on the spot.
 */
export function seaSpots(
  spots: ReadonlyArray<{ readonly x: number; readonly y: number; readonly diameter: number }>,
  { width, height }: { width: number; height: number },
): ScreenBox[] {
  return spots
    .filter(({ diameter }) => diameter >= width)
    .map(({ x, y }) => ({
      left: x - width / 2,
      top: y - height / 2,
      right: x + width / 2,
      bottom: y + height / 2,
    }));
}
