import type { MapMarker } from '@/domain/labels';
import { depositAt } from '@/domain/world';
import { inService } from '@/domain/loot';
import type { LonLat } from '@/domain/geo';
import {
  BUILDING_HEAP_SPOTS,
  BUILDING_SEALS,
  buildingMaquette,
  OUTPOST_GEAR,
  OUTPOST_MAQUETTE,
} from '@/emblems/buildings/manifest';
import { effectiveSpecialty } from '@/domain/outposts';
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
  OUTPOST_METRES,
  OUTPOST_ON_BOARD,
} from '@/domain/piece-size';
import { fr } from '@/i18n/fr';
import { heapReadingOf } from '@/domain/heap-reading';
import { useRef } from 'react';
import { useClockReading } from '@/shell/clock';

/**
 * **What stands in maquettes up close, among the markers on the board** (ADR 0026 §1): what is
 * drawn today by its plate, and nothing more — my standing buildings, the installations I
 * surveyed, the neutral objectives. A site at work wears its works (mode chantier): a plan in
 * the queue, a first level rising, a raise scaffolded whole — what already stands is not raised
 * again. My outposts stand on their round socle (#468), founded round their mast, the gear of the
 * trade they ply on show; an enemy's I surveyed stands hollow and bare, with no trade. My
 * exploitation lays its heap in its yard at the stack it reads at `now` (#707).
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
  /** **How long a founding lasts** (`outpostFoundation.minutes`): what an outpost at work rises
   *  over. The view serves it at today's HQ, not the one its order was paid at. */
  foundationMinutes = 0,
  now = 0,
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
                ...(marker.works.frozenMinutesLeft === undefined
                  ? {}
                  : { frozenMinutesLeft: marker.works.frozenMinutesLeft }),
                pennant:
                  marker.works.phase === 'raising' ? fr.labels.pennant(marker.works.level) : null,
                /** Figé, il n'a pas d'heure de fin à promettre. */
                stamp:
                  marker.works.finishesAt === null || marker.works.frozenMinutesLeft !== undefined
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
            ...heapIn(marker, now),
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
      case 'outpost':
        return standing({ lonLat: marker.lonLat }, OUTPOST_MAQUETTE, OUTPOST_ON_BOARD.span, {
          ...outpostSize,
          side: 'mine',
          ink: marker.ink,
          flag: marker.ink,
          // Its trade shows once it stands; a change of trade starts bare (ADR 0037 §7).
          gear: marker.standsAt === null ? OUTPOST_GEAR[effectiveSpecialty(marker)] : null,
          ...(marker.standsAt !== null && {
            works: {
              phase: 'rising',
              level: 1,
              finishesAt: Math.round(marker.standsAt),
              minutes: foundationMinutes,
              pennant: null,
              stamp: { word: fr.stamps.finished, hour: asClockTime(marker.standsAt) },
            },
          }),
        });
      case 'foreignOutpost':
        // A survey serves neither its trade nor its nation (ADR 0039 §3): bare, and no gear.
        return standing({ lonLat: marker.lonLat }, OUTPOST_MAQUETTE, OUTPOST_ON_BOARD.span, {
          ...outpostSize,
          washed: marker.washed,
          side: 'seen',
          gear: null,
        });
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

/** **Mon tas dans la cour** (#707) : rien sans tas (une fondation au niveau 1) ni point où le poser. */
const heapIn = (
  { heap, key }: Extract<MapMarker, { kind: 'building' }>,
  now: number,
): Pick<StandingMaquette, 'heap'> => {
  const at = BUILDING_HEAP_SPOTS[key];
  return heap === undefined || heap.cap === 0 || at === undefined
    ? {}
    : { heap: { resource: heap.resource, stack: heapReadingOf(heap, now).stack, at } };
};

/**
 * **L'heure à laquelle lire mes tas** (#707) : celle où l'un d'eux a changé de palier pour la
 * dernière fois. Le tas grandit sous les yeux, et la carte ne se reconstruit qu'à ce changement,
 * pas à chaque minute (CLAUDE.md, carte à la demande).
 */
export function useHeapInstant(markers: ReadonlyArray<MapMarker>): number {
  const last = useRef({ stacks: '', at: 0 });
  return useClockReading(60_000, (now) => {
    const stacks = heapStacksOf(markers, now);
    if (stacks !== last.current.stacks) last.current = { stacks, at: now };
    return last.current.at;
  });
}

const heapStacksOf = (markers: ReadonlyArray<MapMarker>, now: number): string =>
  JSON.stringify(
    markers.flatMap((marker) =>
      marker.kind === 'building' && marker.heap !== undefined
        ? [[marker.id, heapReadingOf(marker.heap, now).stack]]
        : [],
    ),
  );

/** **L'avant-poste en mètres sur son socle rond** (#468) : sa portée est son rayon. */
const outpostSize = {
  metres: OUTPOST_METRES.ring,
  footprint: OUTPOST_ON_BOARD.footprint,
  socle: true,
  reach: OUTPOST_ON_BOARD.reach,
} as const;

/** Ce que le point tient (ADR 0029). */
const depositUnder = (lonLat: LonLat | null) =>
  lonLat === null ? null : (depositAt(lonLat)?.deposit ?? null);

/** **Les sites hors service que je sais** (#279) : les miens (`integrity`), et ceux que j'ai mis
 *  hors service, lus dans mes propres rapports (`sealedUntil`) tant qu'ils le restent. */
export const sealedSites = (
  view: {
    readonly me: {
      readonly buildings: ReadonlyArray<{
        readonly id: string;
        readonly integrity?: 'damaged' | 'disabled';
      }>;
    };
    readonly surveyedInstallations: ReadonlyArray<{
      readonly id: string;
      readonly sealedUntil?: number;
    }>;
  },
  now: number,
): ReadonlySet<string> =>
  new Set([
    ...view.me.buildings
      .filter((building) => building.integrity === 'disabled')
      .map(({ id }) => id),
    ...view.surveyedInstallations
      .filter(({ sealedUntil }) => sealedUntil !== undefined && !inService(sealedUntil, now))
      .map(({ id }) => id),
  ]);
