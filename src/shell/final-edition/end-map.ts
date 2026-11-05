import { useEffect, useState } from 'react';
import type { Atlas } from '@/domain/atlas';
import { IRREGULAR } from '@/domain/final-edition';
import { nationInk } from '@/domain/nations';
import { loadAtlas } from '@/data/atlas';

/** Le sol que personne ne tenait, et celui des garnisons irrégulières. */
export const NEUTRAL_INK = '#d9caa6';
export const IRREGULAR_INK = '#8d8676';
export const SEA_INK = '#cfdbd2';

export const inkOf = (nation: string | null): string =>
  nation === null ? NEUTRAL_INK : nation === IRREGULAR ? IRREGULAR_INK : nationInk(nation);

/**
 * **La carte de la fin, en chemins SVG** (#455) : le sol de chaque teneur fusionné en une forme,
 * lu sur l'atlas (ADR 0034) par les paires région → nation de l'archive. Une région que l'atlas
 * ne connaît plus est absente des paires lues, une région absente des paires se dessine neutre.
 * Les mêmes chemins servent la page (`<path d>`) et l'image (`Path2D`).
 */
export type EndMap = {
  readonly lands: ReadonlyArray<{ readonly nation: string | null; readonly d: string }>;
  /** Le centre de la région de chaque point, en unités de carte. */
  readonly anchors: ReadonlyMap<string, readonly [number, number]>;
  readonly regionName: (regionId: string | null) => string;
};

const NEUTRAL = '';

const ring = (points: Float32Array): string => {
  let d = `M${points[0]!.toFixed(2)} ${points[1]!.toFixed(2)}`;
  for (let at = 2; at < points.length; at += 2)
    d += `L${points[at]!.toFixed(2)} ${points[at + 1]!.toFixed(2)}`;
  return `${d}Z`;
};

export function endMapOf(
  atlas: Atlas,
  regions: ReadonlyArray<{ readonly regionId: string; readonly nation: string }>,
  pointRegions: ReadonlyArray<string>,
): EndMap {
  const held = new Map(regions.map(({ regionId, nation }) => [regionId, nation]));
  const shapes = atlas.shapes((region) => held.get(region.id) ?? NEUTRAL, 'far');
  const lands = [...shapes].map(([key, polygons]) => ({
    nation: key === NEUTRAL ? null : key,
    d: polygons.map((shape) => [shape.outer, ...shape.holes].map(ring).join('')).join(''),
  }));
  /** Le neutre d'abord : les teneurs s'impriment par-dessus. */
  lands.sort((left, right) => Number(left.nation !== null) - Number(right.nation !== null));
  const anchors = new Map<string, readonly [number, number]>();
  for (const regionId of pointRegions) {
    let [west, north, east, south] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const { points } of atlas.outline(regionId, 'far'))
      for (let at = 0; at < points.length; at += 2) {
        west = Math.min(west, points[at]!);
        east = Math.max(east, points[at]!);
        north = Math.min(north, points[at + 1]!);
        south = Math.max(south, points[at + 1]!);
      }
    if (west !== Infinity) anchors.set(regionId, [(west + east) / 2, (north + south) / 2]);
  }
  const names = new Map(atlas.regions.map((region) => [region.id, region.name]));
  return { lands, anchors, regionName: (regionId) => names.get(regionId ?? '') ?? '' };
}

/** Sans atlas (il charge, ou il a échoué), la page se lit sans carte ni noms de lieux. */
const BLANK: EndMap = { lands: [], anchors: new Map(), regionName: () => '' };

export function useEndMap(
  regions: ReadonlyArray<{ readonly regionId: string; readonly nation: string }>,
  pointRegions: ReadonlyArray<string>,
): EndMap {
  const [map, setMap] = useState<EndMap>(BLANK);
  useEffect(() => {
    let live = true;
    loadAtlas()
      .then((atlas) => live && setMap(endMapOf(atlas, regions, pointRegions)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [regions, pointRegions]);
  return map;
}
