import type { MapMarker } from '@/domain/labels';
import { depositAt } from '@/domain/world';
import type { LonLat } from '@/domain/geo';
import { BUILDING_SEALS, buildingMaquette } from '@/emblems/buildings/manifest';
import type { CaptureView } from '@/domain/player-view';
import { objectiveMaquette } from '@/emblems/objectives/manifest';
import type { StandingMaquette } from '@/map/engine';
import { asClockTime } from '@/domain/duration';
import {
  buildingFootprint,
  buildingMetres,
  buildingReach,
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
  /** My buildings at work at rest (`workingSites`): their loop plays (#273). */
  working: ReadonlySet<string> = new Set(),
  /** **La prise** (#279) : les captures qui me regardent, et les sites hors service que je sais
   *  (`sealedSites`). */
  taking: {
    readonly captures: ReadonlyArray<CaptureView>;
    readonly sealed: ReadonlySet<string>;
  } = { captures: [], sealed: new Set() },
): StandingMaquette[] {
  /** What a site I hold or surveyed wears of a capture, and of its seals. */
  const taken = (buildingId: string, key: keyof typeof BUILDING_SEALS) => {
    const capture = taking.captures.find(
      ({ target }) => target.kind === 'building' && target.id === buildingId,
    );
    return {
      buildingId,
      buildingKey: key,
      ...(capture !== undefined && {
        capture: {
          clock: capture.clock,
          side: capture.side,
          stopped: capture.stoppedAt !== null,
        },
      }),
      ...(taking.sealed.has(buildingId) && { seal: BUILDING_SEALS[key] }),
    };
  };
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
            socle: true,
            reach: buildingReach(marker.key),
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
            ...(marker.buildingId !== null &&
              working.has(marker.buildingId) && {
                working: true,
                // A Centre that searches stands with its shutter open, at every motion (#273).
                ...(marker.key === 'researchCenter' &&
                  marker.works === null && { pose: 'observing' as const }),
              }),
            side: 'mine',
            ink: marker.ink,
            flag: marker.ink,
            ...(marker.buildingId !== null &&
              taken(marker.buildingId, marker.key === 'depot' ? 'warehouse' : marker.key)),
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
            socle: true,
            reach: buildingReach(marker.key),
            side: marker.neutral === null ? 'seen' : 'neutral',
            // A survey serves neither level nor state: the first yard, never a works site.
            level: 1,
            // Its pole stands bare: a survey serves no nation (#279, Q1).
            ...taken(marker.buildingId, marker.key),
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

/** **Les sites hors service que je sais** (#279) : les miens (`disabled`), et ceux que j'ai mis
 *  hors service, lus dans mes propres rapports (`sealedUntil`) tant qu'ils le restent. */
export const sealedSites = (
  view: {
    readonly me: {
      readonly buildings: ReadonlyArray<{ readonly id: string; readonly disabled?: true }>;
    };
    readonly surveyedInstallations: ReadonlyArray<{
      readonly id: string;
      readonly sealedUntil?: number;
    }>;
  },
  now: number,
): ReadonlySet<string> =>
  new Set([
    ...view.me.buildings.filter((building) => building.disabled).map(({ id }) => id),
    ...view.surveyedInstallations
      .filter(({ sealedUntil }) => sealedUntil !== undefined && sealedUntil > now)
      .map(({ id }) => id),
  ]);
