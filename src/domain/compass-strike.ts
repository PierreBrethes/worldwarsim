import { slotCost } from './compass-fan';
import { fr } from '@/i18n/fr';
import { asDuration } from './duration';
import { notInBlitz } from './blitz';
import { bombardRefusalDetails, bombardRefusalOf, firesIndirect, gunsReach } from './indirect-fire';
import { playedTheatre } from './theatres';
import { captureDurationAt, type CaptureTarget } from './capture';
import { canonicalBuildingKey } from './ids';
import {
  lootCollectionOrderRefusalOf,
  captureOrderRefusalOf,
  plunderOrderRefusalOf,
  refusalDetails,
  type Column,
  type MovementAim,
  type PlunderAim,
} from './movement-orders';
import { carrierIn, marchingTroopIds, stationKeyOf, stationPointOf, troopsAt } from './troops';
import { distanceKm } from './geo';
import { type PlayerView, type TroopStation } from './player-view';
import type { Compass, CompassAction, CompassTarget } from './compass-rose';

/**
 * **L'expédition sur une installation relevée** (S8). Le libellé seul sépare la prise du sabotage
 * — un entrepôt rend du butin, un producteur ne rend que son arrêt — et c'est le même ordre sur
 * le fil (`movements.plunder`). Le refus vient de `plunderOrderRefusalOf`, la fonction que la
 * mutation relit : sans branche, la rose s'ouvre en motif et dit la phrase du serveur (ADR 0015).
 *
 * Rien ici ne lit un stock adverse : le relevé n'en porte aucun, et c'est le sujet.
 */
export function plunderFan(
  target: Extract<CompassTarget, { kind: 'installation' }>,
  view: PlayerView,
  column: Column,
): Compass {
  const aimed: PlunderAim = { kind: 'building', buildingId: target.id, key: target.key };
  const spared = view.surveyedInstallations.find(
    (installation) => installation.id === target.id,
  )?.spared;
  const isMine = view.me.buildings.some((standing) => standing.id === target.id);
  const refused = notInBlitz(view.mode) ?? plunderOrderRefusalOf(aimed, column, isMine);
  const label =
    canonicalBuildingKey(target.key) === 'warehouse' ? fr.compass.plunder : fr.compass.sabotage;
  const capture = captureBranch(
    { kind: 'building', key: target.key },
    { kind: 'building', id: target.id },
    aimed,
    view,
    column,
    isMine,
  );
  const actions: Array<CompassAction> = [
    ...(refused === null
      ? [
          {
            key: 'plunder' as const,
            pictogram: 'sabotage' as const,
            label,
            cost: slotCost(view),
            consequence: fr.compass.plunderConsequence(label, spared),
            buildingId: target.id,
            aim: aimed,
          },
        ]
      : []),
    ...(capture.action === null ? [] : [capture.action]),
  ];
  return {
    kicker: fr.compass.installation,
    name: target.name,
    actions,
    refusal:
      actions.length > 0
        ? null
        : (capture.refusal ??
          (refused === null ? null : fr.errors[refused](refusalDetails(aimed, column)))),
  };
}

/**
 * **La branche « capturer »**, ou le motif qui la retient — dans les mots du serveur. La durée est
 * celle de `captureDurationAt` au rythme de la pile (`Column.captureRate`), la règle que
 * l'aperçu du serveur lit aussi.
 */
export function captureBranch(
  site: CaptureTarget,
  target: { readonly kind: 'building' | 'outpost' | 'point'; readonly id: string },
  aimed: MovementAim,
  view: PlayerView,
  column: Column,
  isMine: boolean,
): { readonly action: CompassAction | null; readonly refusal: string | null } {
  const refused = captureOrderRefusalOf(aimed, column, isMine);
  if (refused !== null) {
    return { action: null, refusal: fr.errors[refused](refusalDetails(aimed, column)) };
  }
  return {
    action: {
      key: 'capture',
      pictogram: 'helmet',
      label: fr.compass.capture,
      cost: slotCost(view),
      consequence: fr.compass.captureConsequence(
        asDuration(
          captureDurationAt(view.mode, site, column.captureRate ?? 1, view.season.hqCaptureHours) /
            60_000,
        ),
        site.kind === 'building' && site.key === 'hq',
      ),
      target,
      aim: aimed,
    },
    refusal: null,
  };
}

/**
 * **Ramasser ce qu'on a relevé**, et jamais ce qui est là : la cible est le relevé possédé, même
 * périmé. La capacité libre est la seule condition propre à cet ordre — une pile pleine ne
 * rapporte rien — et elle passe par `lootCollectionOrderRefusalOf`, comme le serveur.
 */
export function collectFan(
  target: Extract<CompassTarget, { kind: 'loot' }>,
  column: Column,
  freeCapacity: number,
): Compass {
  const aimed = {
    kind: 'point',
    lon: target.point[0],
    lat: target.point[1],
    onLand: target.onLand ?? true,
    coastal: target.coastal ?? false,
    /** Un ramassage est une marche : ce qu'on a relevé du sol n'entre pas dans son refus. */
    surveyed: false,
  } as const;
  const refused = lootCollectionOrderRefusalOf(aimed, column, freeCapacity);
  return {
    kicker: target.current ? fr.loot.markerCurrent : fr.loot.markerStale,
    name: target.name ?? fr.loot.cardKicker,
    actions:
      refused === null
        ? [
            {
              key: 'collect',
              pictogram: 'crate',
              label: fr.compass.collect,
              cost: null,
              consequence: fr.compass.collectConsequence,
              sightingId: target.id,
              point: target.point,
            },
          ]
        : [],
    refusal: refused === null ? null : fr.errors[refused](refusalDetails(aimed, column)),
  };
}

/** Le milieu d'une cible relevée : celui du camp, ou du fil de la colonne — seul ce qui s'en voit. */
function mediumOf(
  target: Extract<CompassTarget, { kind: 'camp' | 'track' }>,
  view: PlayerView,
): 'land' | 'sea' | 'air' {
  if (target.kind === 'camp')
    return view.camps.find((camp) => camp.id === target.id)?.medium ?? 'land';
  const mode = view.arcs.find((arc) => arc.id === target.id)?.route.mode;
  return mode === 'air' ? 'air' : mode === 'naval' ? 'sea' : 'land';
}

/**
 * **La pièce en main tire, ou dit pourquoi elle se tait** (B20) : une seule branche, et la même
 * règle que le serveur. L'heure est celle du clic — batterie et rechargement s'égrènent.
 */
export function bombardFan(
  target: Extract<CompassTarget, { kind: 'camp' | 'track' }>,
  view: PlayerView,
  column: Column,
  origin: TroopStation | null,
  heldTroopIds: ReadonlyArray<string> | null,
  now: number,
): Compass | null {
  const from = origin === null ? null : stationPointOf(view.me, origin);
  const troop = view.me.troops.find(
    (candidate) => heldTroopIds?.includes(candidate.id) === true && firesIndirect(candidate.role),
  );
  if (origin === null || from === null || troop === undefined) return null;
  const marching = marchingTroopIds(view.arcs);
  const order = {
    roles: column.roles,
    from,
    to: target.point,
    theatre: playedTheatre(view),
    seen:
      target.kind === 'track' ||
      view.camps.some((camp) => camp.id === target.id && !camp.lastKnown),
    reachable: gunsReach(mediumOf(target, view)),
    emplacedAt: troop.emplacedAt ?? 0,
    reloadUntil: troop.reloadUntil ?? null,
    moving: marching.has(troop.id),
    aboard:
      (origin.kind === 'point' && origin.afloat) ||
      carrierIn(troop, troopsAt(view.me, stationKeyOf(origin), marching)) !== null,
    outOfRounds: column.outOfRounds === true,
    now,
  };
  const refused = bombardRefusalOf(order);
  return {
    kicker: fr.compass.aiming(column.roles.length),
    name: target.name,
    actions:
      refused !== null
        ? []
        : [
            {
              key: 'bombard',
              pictogram: 'shell',
              label: fr.compass.bombard,
              cost: null,
              consequence: fr.compass.bombardConsequence(
                Math.round(distanceKm(from, target.point)),
              ),
              troopId: troop.id,
              target:
                target.kind === 'camp'
                  ? { kind: 'camp', campId: target.id }
                  : { kind: 'track', movementId: target.id },
            },
          ],
    refusal: refused === null ? null : fr.errors[refused](bombardRefusalDetails(order)),
  };
}
