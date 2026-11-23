import { fr } from '@/i18n/fr';
import { briefOf } from '@/domain/nation-brief';
import { assetOf, type Asset } from '@/domain/nation-assets';
import type { Nation } from '@/domain/ids';
import type { SeasonMode } from '@/domain/season-mode';
import type { StrategicPointKey } from '@/domain/strategic-points';
import { WORLD_BOX, type Box, type NationTint, type PointMark } from '@/emblems/EngravedMap';
import { STRATEGIC_POINTS, STRATEGIC_POINT_KEYS } from '@/domain/strategic-points';

/**
 * **What the lobby sheet says of a nation** (the cartouche of the desk map): its capital, its
 * asset, the capitals around it and the drawn points near it. One function for every surface
 * that writes the sheet.
 */
export function sheetOf(
  nation: Nation,
  points: ReadonlyArray<StrategicPointKey>,
  mode: SeasonMode,
): {
  capital: string;
  asset: Asset | null;
  neighbours: Nation[];
  nearPoints: StrategicPointKey[];
} {
  const { neighbors, nearPoints } = briefOf(nation, points);
  return {
    capital: fr.table.capital[nation],
    asset: assetOf(nation, mode),
    neighbours: neighbors,
    nearPoints,
  };
}

/**
 * **Who is tinted, and how**: the taken nations hatched, mine and the one shown filled, the
 * neighbours of the one shown outlined in dashes. Nothing shown, nothing mine: only the taken.
 */
export function tintsOf({
  shown,
  me,
  taken,
  neighbours,
}: {
  shown: Nation | null;
  me: Nation | null;
  taken: ReadonlyArray<Nation>;
  neighbours: ReadonlyArray<Nation>;
}): Record<string, NationTint> {
  const out: Record<string, NationTint> = {};
  for (const nation of taken) out[nation] = { kind: 'taken' };
  if (me !== null) out[me] = { kind: 'chosen', mine: true };
  if (shown !== null) {
    out[shown] = taken.includes(shown)
      ? { kind: 'taken', shown: true }
      : { kind: 'chosen', mine: shown === me, shown: true };
  }
  for (const nation of neighbours) {
    out[nation] = out[nation] ? { ...out[nation], neighbour: true } : { kind: 'neighbour' };
  }
  return out;
}

/** @a-mesurer the longitude span the desk map keeps, centred on 20° E. */
const SALON_SPAN = 290;
const SALON_CENTRE = 20;

/**
 * **The desk map's own box**: the world without its southern ocean. The width in longitude is
 * fixed and the south follows the height of the frame, never below `WORLD_BOX`. `WORLD_BOX`
 * itself stays whole, `Found` reads it.
 */
export function salonBoxOf(size: { readonly width: number; readonly height: number }): Box {
  const [, south, , north] = WORLD_BOX;
  /** A frame not measured yet (or hidden) keeps the whole height. */
  const lat = size.width > 0 ? (SALON_SPAN * size.height) / size.width : north - south;
  return [
    SALON_CENTRE - SALON_SPAN / 2,
    Math.max(south, north - lat),
    SALON_CENTRE + SALON_SPAN / 2,
    north,
  ];
}

/** Where each point's name sits against its ring: anchor, then dx, dy in ring radii. */
const LABEL_AT: Record<StrategicPointKey, readonly ['start' | 'end', number, number]> = {
  tangier: ['end', -1.5, 1.6],
  istanbul: ['start', 1.5, 1.5],
  rangoon: ['end', -1.5, 1.4],
  hongKong: ['start', 1.5, 1.5],
  halifax: ['start', 1.6, 0.5],
  narvik: ['start', 1.6, 0.5],
  lisbon: ['end', -1.6, -0.3],
  baku: ['start', 1.5, 1.5],
  dakar: ['end', -1.5, 1.4],
  singapore: ['start', 1.5, 1.5],
};

/** The drawn points as the map ringed and named marks, in registry order. */
export function marksOf(points: ReadonlyArray<StrategicPointKey>): PointMark[] {
  return STRATEGIC_POINT_KEYS.filter((key) => points.includes(key)).map((key) => {
    const [anchor, dx, dy] = LABEL_AT[key];
    const [lon, lat] = STRATEGIC_POINTS[key];
    return { name: fr.points.names[key], lon, lat, anchor, dx, dy };
  });
}
