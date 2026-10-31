import { fr } from '@/i18n/fr';
import { anchorOf, type LabelAnchor, type LabelType, type MapMarker } from './labels';
import type { ArcView } from './player-view';

/** The id an outpost's marker, label and pin share on the board. */
export const outpostPinId = (outpostId: string): string => `outpost-${outpostId}`;

export type PinShape = 'pile' | 'building' | 'outpost';

/**
 * **Ce qu'une épingle dit au loin** (#234) : sa forme dit ce que c'est, son côté à qui. Elle ne
 * lit que ce que la vue sert déjà : l'encre de ma nation pour ce qui est à moi ; pour un relevé,
 * ni encre ni nation — sauf la nation que le serveur sert au seul teneur de Lisbonne (P11). Une
 * dernière position connue n'a jamais de nation, seulement son heure. La forme est la garantie :
 * `seen` et `lost` n'ont pas de champ `ink`.
 */
export type Pin =
  | {
      readonly id: string;
      readonly anchor: LabelAnchor;
      readonly shape: PinShape;
      readonly side: 'mine';
      readonly ink: string;
      readonly moving?: true;
      /** A building still under the crane: nothing stands there yet. */
      readonly works?: true;
    }
  | {
      readonly id: string;
      readonly anchor: LabelAnchor;
      readonly shape: PinShape;
      readonly side: 'seen';
      readonly nation?: string;
      /** Un neutre de la Blitz : public, et à personne. */
      readonly neutral?: true;
      readonly moving?: true;
    }
  | {
      readonly id: string;
      readonly anchor: LabelAnchor;
      readonly shape: PinShape;
      readonly side: 'lost';
      readonly seenAt: number;
    };

/** One pin per label the board puts down as a piece: my piles, buildings and outposts, what I
 *  surveyed, and the heads of the movements I see. Pins carry their label's id. */
export function pinsOf(
  markers: ReadonlyArray<MapMarker>,
  arcs: ReadonlyArray<ArcView>,
  ink: string,
): ReadonlyArray<Pin> {
  return [...markers.flatMap(markerPin), ...arcs.flatMap((arc) => arcPin(arc, ink))];
}

const nationOf = (nation: string | undefined) => (nation === undefined ? {} : { nation });

function markerPin(marker: MapMarker): ReadonlyArray<Pin> {
  const at = { id: marker.id, anchor: anchorOf(marker) };
  switch (marker.kind) {
    case 'stack':
      return [{ ...at, shape: 'pile', side: 'mine', ink: marker.ink }];
    case 'building':
      return [
        {
          ...at,
          shape: 'building',
          side: 'mine',
          ink: marker.ink,
          ...(marker.level === null ? { works: true } : {}),
        },
      ];
    case 'construction':
      return [{ ...at, shape: 'building', side: 'mine', ink: marker.ink, works: true }];
    case 'outpost':
      return [{ ...at, shape: 'outpost', side: 'mine', ink: marker.ink }];
    case 'installation':
      return [
        {
          ...at,
          shape: 'building',
          side: 'seen',
          ...(marker.neutral === null ? {} : { neutral: true }),
        },
      ];
    case 'camp':
      return [
        marker.lastKnown
          ? { ...at, shape: 'pile', side: 'lost', seenAt: marker.lastSeenAt ?? marker.since }
          : { ...at, shape: 'pile', side: 'seen', ...nationOf(marker.nation) },
      ];
    default:
      return [];
  }
}

function arcPin(arc: ArcView, ink: string): ReadonlyArray<Pin> {
  const at = {
    id: arc.id,
    anchor: { kind: 'movementHead', arc: arc.id } as const,
    shape: 'pile',
  } as const;
  switch (arc.state) {
    case 'mine':
      return [{ ...at, side: 'mine', ink, moving: true }];
    case 'enemyDetected':
      return [{ ...at, side: 'seen', ...nationOf(arc.nation), moving: true }];
    case 'lastKnown':
      return [{ ...at, side: 'lost', seenAt: arc.lastSeenAt }];
    default:
      return [];
  }
}

export type ClusterSheet = {
  readonly kicker: string;
  readonly lines: ReadonlyArray<string>;
  readonly note: string;
};

/**
 * **What an opened cluster says** (#234, maquette « épingles »), from its pieces' label types:
 * how many of each, and that it is approached rather than lifted. A survey is counted as a force
 * or a building, never named — the labels carry nothing more.
 */
export function clusterSheetOf(types: ReadonlyArray<LabelType>): ClusterSheet {
  const count = (...kinds: ReadonlyArray<LabelType>) =>
    types.filter((type) => kinds.includes(type)).length;
  const line = (n: number, say: (n: number) => string) => (n > 0 ? [say(n)] : []);
  const mine = count('stack', 'building', 'construction', 'outpost', 'my-movement') > 0;
  return {
    kicker: mine ? fr.cluster.mine(types.length) : fr.cluster.seen(types.length),
    lines: mine
      ? [
          ...line(count('stack', 'my-movement'), fr.cluster.piles),
          ...line(count('building', 'construction'), fr.cluster.buildings),
          ...line(count('outpost'), fr.cluster.outposts),
        ]
      : [
          ...line(count('camp', 'intel', 'inbound-movement'), fr.cluster.forces),
          ...line(count('installation'), fr.cluster.sites),
        ],
    note: fr.cluster.note,
  };
}
