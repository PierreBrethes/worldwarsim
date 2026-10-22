import { anchorOf, type LabelAnchor, type MapMarker } from './labels';
import type { ArcView } from './player-view';

/**
 * **Ce qu'une épingle dit au loin** (#234) : sa forme dit ce que c'est, son côté à qui. Elle ne
 * lit que ce que la vue sert déjà : l'encre de ma nation pour ce qui est à moi ; pour un relevé,
 * ni encre ni nation — sauf la nation que le serveur sert au seul teneur de Lisbonne (P11). Une
 * dernière position connue n'a jamais de nation, seulement son heure. La forme est la garantie :
 * `seen` et `lost` n'ont pas de champ `ink`.
 */
export type PinShape = 'pile' | 'building' | 'outpost';

export type Pin =
  | {
      readonly id: string;
      readonly anchor: LabelAnchor;
      readonly shape: PinShape;
      readonly side: 'mine';
      readonly ink: string;
      readonly moving?: true;
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
  return [
    ...markers.flatMap((marker) => markerPin(marker, ink)),
    ...arcs.flatMap((arc) => arcPin(arc, ink)),
  ];
}

const nationOf = (nation: string | undefined) => (nation === undefined ? {} : { nation });

function markerPin(marker: MapMarker, ink: string): ReadonlyArray<Pin> {
  const at = { id: marker.id, anchor: anchorOf(marker) };
  switch (marker.kind) {
    case 'stack':
      return [{ ...at, shape: 'pile', side: 'mine', ink: marker.ink }];
    case 'building':
    case 'construction':
      return [{ ...at, shape: 'building', side: 'mine', ink: marker.ink }];
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
