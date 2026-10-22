import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { outpostReachKm } from '../../../convex/constants';
import { aimVerdict, freeDeposits, placementOf, reachesOf } from '@/domain/construction';
import { EXPLOITED_DEPOSITS, type FoundationDebt } from '@/domain/economy';
import type { BuildingKey } from '@/domain/ids';
import type { MapMotion } from '@/domain/map-motion';
import type { PlayerView } from '@/domain/player-view';
import { DEPOSIT_POINTS } from '@/domain/world';
import { asDuration } from '@/domain/duration';
import { buildingSprite } from '@/emblems/buildings/manifest';
import { aimRefusalText, fr } from '@/i18n/fr';
import type { PlacingMagnet, PlacingSpot } from '@/map/engine';
import type { PlacingBuilding } from '@/map/WorldMap';
import { handleError } from '@/data/errors';
import type { Seat } from '@/data/session';
import { notify } from '@/shell/notifications';
import { spent as flySpent } from '@/shell/flights';
import { debtKey } from './FoundationRows';

/**
 * **Un bâtiment tenu en main** (ADR 0029) : la clé choisie, et la dette du socle qu'il vient
 * acquitter s'il a été pris dans l'ordre de mobilisation — c'est elle qui dit sur quel gisement
 * il s'aimante. Le lieu, c'est la carte qui le donne.
 */
export type HeldBuilding = {
  readonly key: BuildingKey;
  readonly debt: FoundationDebt | null;
  /** Ce que la carte dit avant que le fantôme ait trouvé un point : la région du panneau. */
  readonly title: string;
};

export function usePlacing(
  view: PlayerView,
  seat: Seat,
  motion: MapMotion,
  setOrderError: (error: string | null) => void,
) {
  const startConstruction = useMutation(api.constructions.start);
  /**
   * **Un bâtiment tenu en main, en attente du point où il se pose** (ADR 0029) : toute clé,
   * choisie au panneau de construction ou dans l'ordre de mobilisation. C'est le cousin de la
   * visée — même priorité sur les clics, Échap le lâche, aucune rose ne s'ouvre pendant — et il
   * vit ici parce que c'est un geste de carte.
   */
  const [placing, setPlacing] = useState<HeldBuilding | null>(null);
  /** Le point que le fantôme tient, et ce que la carte en sait : ce que le refus lit. */
  const [placingAim, setPlacingAim] = useState<PlacingSpot | null>(null);
  /**
   * **The mobilisation order, armed.** The season still owes free placements, the player has
   * clicked one of its keys, and the board is waiting for the ground. It lives here beside the
   * other two map gestures — a construction site and an aim — because it is one of them: a
   * click on the map that means something because of what is armed.
   */
  const [mobilizeError, setMobilizeError] = useState<string | null>(null);

  /** **Échap rend la carte intacte** : rien n'a été enfilé, il n'y a donc rien à défaire. */
  useEffect(() => {
    if (placing === null) return;
    const drop = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlacing(null);
    };
    document.addEventListener('keydown', drop);
    return () => document.removeEventListener('keydown', drop);
  }, [placing]);

  /** Ce que le fantôme lit : les gisements que personne n'exploite à sa connaissance, et la
   *  portée de ses avant-postes debout. */
  /** **Keyed on the free deposits themselves, not on the view**: every Convex update brings a
   *  new view, and a new list would re-arm the ghost under the pointer (`WorldMap`). */
  const freeIds = freeDeposits(view)
    .map((deposit) => deposit.id)
    .join(',');
  const freeDepositPoints = useMemo(() => {
    const free = new Set(freeIds.split(','));
    return DEPOSIT_POINTS.filter((deposit) => free.has(deposit.id));
  }, [freeIds]);
  const reaches = useMemo(() => reachesOf({ me: view.me }, outpostReachKm), [view.me]);

  /**
   * **L'aimant de la clé tenue** : un extracteur saute sur un gisement libre de son espèce — celui
   * que sa dette nomme, s'il en acquitte une —, un port sur un quai, le reste se pose sous le
   * pointeur. Mémoïsé sur la clé et la liste : la carte ne réarme le fantôme qu'à leur changement.
   */
  const magnet = useMemo<PlacingMagnet | null>(() => {
    if (placing === null) return null;
    const kinds =
      placing.debt?.deposit != null ? [placing.debt.deposit] : EXPLOITED_DEPOSITS[placing.key];
    if (kinds !== undefined) {
      return {
        kind: 'points',
        points: freeDepositPoints
          .filter((deposit) => kinds.includes(deposit.deposit))
          .map((deposit) => deposit.lonLat),
      };
    }
    return placing.key === 'port' ? { kind: 'coast' } : { kind: 'free' };
  }, [placing, freeDepositPoints]);

  const verdict =
    placing === null || placingAim === null
      ? null
      : aimVerdict(view, placing.key, placingAim, reaches);

  /** La carte du fantôme, écrite ici (ADR 0016) : le nom, la facture, et le refus du point visé
   *  dans les mots du serveur (`aimRefusalText`). */
  const placingCard = useMemo<PlacingBuilding | null>(() => {
    if (placing === null || magnet === null) return null;
    const spec = view.buildCatalog[placing.key];
    const free = verdict?.free ?? false;
    const widest = reaches.map((reach) => reach.reachKm);
    return {
      sprite: buildingSprite(placing.key),
      magnet,
      title: placingAim?.region?.name ?? placing.title,
      name: fr.buildings[placing.key],
      cost: spec.cost,
      free,
      duration: free ? fr.construction.immediate : asDuration(spec.minutes),
      refusal:
        verdict?.refusal == null
          ? null
          : aimRefusalText(
              verdict.refusal,
              placing.key,
              {
                widestKm: widest.length === 0 ? outpostReachKm(1) : Math.max(...widest),
                hasOutposts: widest.length > 0,
              },
              spec.lockedBy,
              placing.debt?.deposit != null
                ? [placing.debt.deposit]
                : (EXPLOITED_DEPOSITS[placing.key] ?? []),
            ),
    };
  }, [placing, magnet, placingAim, verdict, reaches, view]);

  const hold = useCallback((held: HeldBuilding | null) => {
    setPlacingAim(null);
    setPlacing(held);
  }, []);
  const dismissPlacing = useCallback(() => hold(null), [hold]);

  /**
   * **Le clic sur la carte commande le chantier**, par la mutation qui commande tous les
   * autres : le mode de pose n'a rien ajouté au flux, il a seulement retardé l'appel du temps
   * qu'un point soit nommé. **Un point refusé ne part pas** : la carte du fantôme dit déjà
   * pourquoi, et la main reste pleine pour viser ailleurs.
   */
  const placeAt = useCallback(
    (spot: PlacingSpot) => {
      if (placing === null || spot.region === null) return;
      if (aimVerdict(view, placing.key, spot, reaches).refusal !== null) return;
      const ordered = placing;
      const free = aimVerdict(view, placing.key, spot, reaches).free;
      hold(null);
      setOrderError(null);
      setMobilizeError(null);
      startConstruction({
        ...seat,
        building: ordered.key,
        regionId: spot.region.id,
        point: { lon: spot.lonLat[0], lat: spot.lonLat[1] },
      }).then(
        () => {
          flySpent(free ? {} : view.buildCatalog[ordered.key].cost, spot.lonLat, motion);
          if (!free) notify(fr.construction.queued(fr.buildings[ordered.key]), 'info');
        },
        (problem: unknown) =>
          handleError(problem, ordered.debt === null ? setOrderError : setMobilizeError),
      );
    },
    [placing, startConstruction, seat, view, reaches, hold, motion, setOrderError],
  );

  /** **La tuile prise sur le plateau personnel** arme le même fantôme qu'une clé choisie : la
   *  pose ne connaît qu'une main. */
  const holdTile = useCallback(
    (key: BuildingKey | null) =>
      hold(key === null ? null : { key, debt: null, title: fr.buildings[key] }),
    [hold],
  );

  /** La tuile lâchée sur la carte se pose où le fantôme se tient, s'il y est accepté. */
  const placeTile = useCallback((): boolean => {
    if (placing === null || placingAim === null || placingAim.region === null) return false;
    if (aimVerdict(view, placing.key, placingAim, reaches).refusal !== null) return false;
    placeAt(placingAim);
    return true;
  }, [placing, placingAim, view, reaches, placeAt]);

  /**
   * **The keys the season still owes, and whether any point takes them.** The condition is
   * `placementOf` — what no point at all can take yet; where exactly, the ghost says.
   */
  const foundation = useMemo(
    () =>
      view.me.foundation.map((due) => ({
        ...placementOf(view, due.key, due.deposit === null ? undefined : [due.deposit]),
        deposit: due.deposit,
      })),
    [view],
  );

  // The order disarms itself when its debt is paid off: `me.foundation` is what draws the card,
  // so a couple that has left it has no line left to be armed on.
  const armed =
    placing?.debt != null &&
    view.me.foundation.some((due) => debtKey(due) === debtKey(placing.debt!))
      ? debtKey(placing.debt)
      : null;

  return {
    placing,
    placingCard,
    setPlacingAim,
    hold,
    dismissPlacing,
    placeAt,
    holdTile,
    placeTile,
    foundation,
    armed,
    mobilizeError,
    setMobilizeError,
  };
}
