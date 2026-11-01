import type { MapMarker } from '@/domain/labels';
import { depositAt } from '@/domain/world';
import type { LonLat } from '@/domain/geo';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { objectiveMaquette } from '@/emblems/objectives/manifest';
import type { StandingMaquette } from '@/map/engine';
import { asClockTime } from '@/domain/duration';
import {
  buildingFootprint,
  buildingMetres,
  buildingSpan,
  objectiveSpan,
} from '@/domain/piece-size';
import { fr } from '@/i18n/fr';

/**
 * **What stands in maquettes up close, among the markers on the board** (ADR 0026 §1): what is
 * drawn today by its plate, and nothing more — my standing buildings, the installations I
 * surveyed, the neutral objectives. A site at work wears its works (mode chantier): a plan in
 * the queue, a first level rising, a raise scaffolded whole — what already stands is not raised
 * again.
 */
export function maquettesOf(
  markers: ReadonlyArray<MapMarker>,
  objectiveKey: (objectiveId: string) => string | undefined,
  /** My buildings that produce right now (`producingSites`): they smoke. */
  producing: ReadonlySet<string> = new Set(),
): StandingMaquette[] {
  return markers.flatMap((marker): StandingMaquette[] => {
    const standing = (
      at: StandingMaquette['at'],
      url: string | null,
      span: number,
      more: Partial<Omit<StandingMaquette, 'id' | 'at' | 'url' | 'span'>> = {},
    ): StandingMaquette[] =>
      url === null ? [] : [{ id: marker.id, at, url, span, washed: false, ...more }];
    switch (marker.kind) {
      case 'building':
        return standing(
          marker.lonLat === null ? { regionId: marker.regionId } : { lonLat: marker.lonLat },
          buildingMaquette(marker.key, depositUnder(marker.lonLat)),
          buildingSpan(marker.key),
          {
            metres: buildingMetres(marker.key),
            footprint: buildingFootprint(marker.key),
            ...(marker.works !== null && {
              works: {
                phase: marker.works.phase,
                level: marker.works.level,
                finishesAt:
                  marker.works.finishesAt === null ? null : Math.round(marker.works.finishesAt),
                minutes: marker.works.minutes,
                pennant:
                  marker.works.phase === 'raising' ? fr.labels.pennant(marker.works.level) : null,
                stamp:
                  marker.works.finishesAt === null
                    ? null
                    : { word: fr.stamps.finished, hour: asClockTime(marker.works.finishesAt) },
              },
            }),
            ...(marker.buildingId !== null &&
              producing.has(marker.buildingId) && { smoking: true }),
            side: 'mine',
            ink: marker.ink,
            // What stands: the level served, or the one before a raise; a first rise has none yet.
            level: marker.works?.phase === 'raising' ? marker.works.level - 1 : (marker.level ?? 1),
          },
        );
      case 'installation':
        return standing(
          { lonLat: marker.lonLat },
          buildingMaquette(marker.key, depositUnder(marker.lonLat)),
          buildingSpan(marker.key),
          {
            washed: marker.washed,
            metres: buildingMetres(marker.key),
            footprint: buildingFootprint(marker.key),
            side: marker.neutral === null ? 'seen' : 'neutral',
            // A survey serves neither level nor state: the first yard, never a works site.
            level: 1,
          },
        );
      case 'objective': {
        // Emptied, it stands whole as its plate does: the cartouche says it is empty.
        const key = objectiveKey(marker.objectiveId);
        return key === undefined
          ? []
          : standing({ lonLat: marker.lonLat }, objectiveMaquette(key), objectiveSpan(key));
      }
      default:
        return [];
    }
  });
}

/** Ce que le point tient (ADR 0029). */
const depositUnder = (lonLat: LonLat | null) =>
  lonLat === null ? null : (depositAt(lonLat)?.deposit ?? null);
