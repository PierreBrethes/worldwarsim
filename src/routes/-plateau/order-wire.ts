import { useMutation } from 'convex/react';
import { useCallback } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr } from '@/i18n/fr';
import type { MovementType } from '@/domain/ids';
import type { MovementAim } from '@/domain/movement-orders';
import type { MarchStation } from '@/domain/troops';
import { placeLabel } from '@/domain/station-name';
import type {
  CapturePreviewed,
  LootCollectionPreviewed,
  MovementPreviewed,
  PlunderPreviewed,
} from '@/data/serverView';
import type { Seat } from '@/data/session';

/** **Un seul aperçu pour quatre missions** : la même route et les mêmes heures ; ce qui les
 *  sépare — le relais, la charge, la présence sur site — se lit là où il existe. */
export type Previewed =
  MovementPreviewed | PlunderPreviewed | CapturePreviewed | LootCollectionPreviewed;

/** Ce que le fil demande à cet envoi-ci — la mutation, jamais un champ de plus sur `march`. */
type PreviewMission =
  /** `boardsOn` : lâchée sur un transport, la colonne y monte en arrivant (15/10). */
  | { readonly kind: 'march'; readonly boardsOn?: string }
  | { readonly kind: 'plunder'; readonly buildingId: string }
  | {
      readonly kind: 'capture';
      readonly target: { readonly kind: 'building' | 'outpost' | 'point'; readonly id: string };
    }
  | { readonly kind: 'collect'; readonly sightingId: string };

/**
 * **Un ordre que la carte a déjà décidé**, en attente de l'envoi. Trois missions et pas une de
 * plus : la marche ordinaire, l'expédition sur un site relevé, le ramassage d'une caisse relevée.
 * Le libellé et la conséquence sont ceux de la branche de la rose qui le portait — la feuille du
 * téléphone, qui les offre côte à côte, ne les réécrit pas.
 */
export type OrderChoice = {
  readonly aim: MovementAim;
  readonly type: MovementType;
  readonly label: string;
  readonly consequence: string;
  readonly mission: PreviewMission;
};

/** Ce qu'un envoi laisse derrière lui : de quoi suivre la colonne, dire où elle va et quand. */
export type Sent = {
  readonly movementId: string;
  readonly arrivesAt: number;
  readonly destination: string;
};

/**
 * The aim in the shape the mutations take. The point is passed through as it was named — the
 * client resolves nothing about it either (ADR 0019 §1).
 */
export const wireTarget = (aim: MovementAim) =>
  aim.kind === 'region'
    ? ({ kind: 'region', regionId: aim.regionId } as const)
    : aim.kind === 'outpost'
      ? ({ kind: 'outpost', outpostId: aim.outpostId as Id<'outposts'> } as const)
      : aim.kind === 'building'
        ? ({ kind: 'building', buildingId: aim.buildingId as Id<'buildings'> } as const)
        : /** **Le camp voyage par son relevé, jamais par son point** (ADR 0024 §4) : c'est le
           *  serveur qui le résout en position, sur la ligne que ce joueur-là possède. */
          aim.kind === 'camp'
          ? ({ kind: 'camp', campId: aim.campId as Id<'campSightings'> } as const)
          : /** **Une colonne en vue** (Blitz) voyage par son relevé : le serveur la poursuit. */
            aim.kind === 'track'
            ? ({ kind: 'track', movementId: aim.movementId as Id<'movements'> } as const)
            : /** **L'objectif voyage par son identité** : il est public, donc le serveur le lit dans
               *  la vérité du plateau — et c'est ce qui grave `movements.objectiveId`, sans quoi la
               *  colonne arriverait sans que rien dise ce qu'elle est venue prendre. */
              aim.kind === 'objective'
              ? ({ kind: 'objective', objectiveId: aim.objectiveId as Id<'objectives'> } as const)
              : ({ kind: 'point', point: { lon: aim.lon, lat: aim.lat } } as const);

export const wireCaptureTarget = (target: {
  readonly kind: 'building' | 'outpost' | 'point';
  readonly id: string;
}) =>
  target.kind === 'building'
    ? ({ kind: 'building', buildingId: target.id as Id<'buildings'> } as const)
    : target.kind === 'outpost'
      ? ({ kind: 'outpost', outpostId: target.id as Id<'outposts'> } as const)
      : ({ kind: 'point', pointId: target.id as Id<'strategicPoints'> } as const);

/**
 * Where a column stands, in the shape the mutations take — the branded ids go back on at the one
 * place that needs them, the call itself. It is the troop's own address (`MarchStation`) and not
 * a second vocabulary: since ADR 0019 the origin no longer says what may be asked for, it says
 * which address the order leaves from, and that is all.
 */
export const wireOrigin = (station: MarchStation) =>
  station.kind === 'outpost'
    ? ({ kind: 'outpost', outpostId: station.outpostId as Id<'outposts'> } as const)
    : station.kind === 'building'
      ? ({ kind: 'building', buildingId: station.buildingId as Id<'buildings'> } as const)
      : ({
          kind: 'point',
          point: { lon: station.lonLat[0], lat: station.lonLat[1] },
        } as const);

/**
 * What a sent order calls its destination. A region and an outpost are named by the server, which
 * holds the index; a **point** has no name to give — so it is written as what it is, a pair of
 * coordinates, rather than borrowed from the country it happens to fall in (ADR 0019 §1).
 */
export function destinationOf(aim: MovementAim, preview: Previewed | undefined): string {
  if (aim.kind === 'point') return fr.aim.pointAt(aim.lon, aim.lat);
  /** The building, then the region the server names — « Port · Nord », the address the journal
   *  will print when the column enters it (`station-name.ts` writes it the same way). */
  if (aim.kind === 'building') {
    const region = preview?.destinationName;
    return region === undefined ? fr.buildings[aim.key] : `${fr.buildings[aim.key]} · ${region}`;
  }
  /** Un camp ou un objectif se nomme par la région sous lui, ou par son pays en mer. */
  const named = preview?.destinationName;
  return named === undefined ? '—' : placeLabel(named);
}

/**
 * **L'ordre part au lâcher** (POC « Manipuler les pions », 16/10/2026) : plus de carte de
 * confirmation, la pastille sous la main a déjà tout dit. Une seule porte vers les huit mutations
 * qui font partir une colonne — **la mission décide de la mutation avant le type** : l'expédition
 * et le ramassage marchent tous deux, et c'est leur cible qui les sépare.
 */
export function useSendOrder(seat: Seat) {
  const marchTo = useMutation(api.movements.marchTo);
  const enterGarrison = useMutation(api.movements.enterGarrison);
  const enterOutpost = useMutation(api.movements.enterOutpost);
  const attack = useMutation(api.movements.attack);
  const raid = useMutation(api.movements.raid);
  const plunder = useMutation(api.movements.plunder);
  const capture = useMutation(api.movements.capture);
  const collectLoot = useMutation(api.movements.collectLoot);
  return useCallback(
    async (
      origin: MarchStation,
      troopIds: ReadonlyArray<string>,
      { aim, type, mission }: OrderChoice,
      preview?: Previewed,
    ): Promise<Sent> => {
      // `PlayerView` carries plain strings: the branded ids go back on at the call itself.
      const ids = troopIds.map((troopId) => troopId as Id<'troops'>);
      const from = wireOrigin(origin);
      const boarding =
        mission.kind === 'march' && mission.boardsOn !== undefined
          ? { boardsOn: mission.boardsOn as Id<'troops'> }
          : {};
      const sent =
        mission.kind === 'capture'
          ? await capture({
              ...seat,
              origin: from,
              troopIds: ids,
              target: wireCaptureTarget(mission.target),
            })
          : mission.kind === 'plunder'
            ? await plunder({
                ...seat,
                origin: from,
                troopIds: ids,
                buildingId: mission.buildingId as Id<'buildings'>,
              })
            : mission.kind === 'collect'
              ? await collectLoot({
                  ...seat,
                  origin: from,
                  troopIds: ids,
                  sightingId: mission.sightingId as Id<'lootCrateSightings'>,
                })
              : type === 'march' && aim.kind === 'point'
                ? await marchTo({
                    ...seat,
                    origin: from,
                    troopIds: ids,
                    point: { lon: aim.lon, lat: aim.lat },
                    ...boarding,
                  })
                : type === 'march' && aim.kind === 'building'
                  ? await enterGarrison({
                      ...seat,
                      origin: from,
                      troopIds: ids,
                      buildingId: aim.buildingId as Id<'buildings'>,
                      ...boarding,
                    })
                  : /** **Une marche sur un avant-poste ne vise que le sien** (décision du 16/09). */
                    type === 'march' && aim.kind === 'outpost'
                    ? await enterOutpost({
                        ...seat,
                        origin: from,
                        troopIds: ids,
                        outpostId: aim.outpostId as Id<'outposts'>,
                        ...boarding,
                      })
                    : type === 'raid' && aim.kind === 'outpost'
                      ? await raid({
                          ...seat,
                          origin: from,
                          troopIds: ids,
                          outpostId: aim.outpostId as Id<'outposts'>,
                        })
                      : await attack({
                          ...seat,
                          origin: from,
                          troopIds: ids,
                          target: wireTarget(aim),
                        });
      return {
        movementId: sent.movementId,
        arrivesAt: sent.arrivesAt,
        destination: destinationOf(aim, preview),
      };
    },
    [seat, marchTo, enterGarrison, enterOutpost, attack, raid, plunder, capture, collectLoot],
  );
}
