import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Seat } from '@/data/session';
import { useClock } from '@/shell/clock';

export function useHeldRegions(seat: Seat, myInk: string) {
  // Nothing filters here: `me.buildings` is the player's own list and there is no other, so
  // the map cannot ink a region an opponent built on (ADR 0005).
  /**
   * **La couleur du sol, servie par sa propre query** (ADR 0020 §1) : elle ne bouge qu'à la
   * fondation ou à la perte d'un avant-poste, là où `PlayerView` se réinvalide au moindre pas
   * d'une colonne. Les coudre ensemble ferait recalculer 4 589 régions pour une troupe qui
   * marche. Le temps que la première réponse arrive, la carte est simplement sans teinte.
   */
  const heldRaw = useQuery(api.control.held, seat);
  const surveyClock = useClock(60_000);
  /** **Un relevé se lit à son contour, pâle et immobile** (ADR 0033) ; sa date est à la fiche. */
  const held = useMemo(
    () =>
      (heldRaw ?? []).map(({ ink, regions }) => ({
        ink,
        mine: ink === myInk,
        regions: regions.map(({ id, state }) => ({ id, state })),
      })),
    [heldRaw, myInk],
  );

  /**
   * **Ce que le survol lit du tenant d'une région — la même réponse que la carte peint**, indexée.
   * La nation vient de la revendication, jamais des avant-postes de la vue : `me.outposts` ne dit
   * que ce que le joueur a planté *dans ce pays-ci*, et une région tenue depuis le pays voisin s'y
   * lisait « avant-poste : aucun » pendant que la carte la peignait (correctif du 31/08).
   */
  const knownRegionById = useMemo(
    () =>
      new Map(
        (heldRaw ?? []).flatMap((claim) =>
          claim.regions.flatMap((region) =>
            region.state === 'suspended'
              ? []
              : [[region.id, { ...region, nation: claim.nation }] as const],
          ),
        ),
      ),
    [heldRaw],
  );

  /**
   * **L'heure du retour, par région suspendue** (ADR 0020 §7). À part du tenant et jamais fondue
   * dedans : une région disputée reprise par le voisin pendant la désactivation est *à lui* et
   * *suspendue chez moi* à la fois, et une seule ligne aurait obligé l'une des deux à mentir.
   * Le serveur ne la sert qu'au propriétaire (ADR 0005), donc rien ne filtre ici.
   */
  const suspendedUntilByRegion = useMemo(
    () =>
      new Map(
        (heldRaw ?? []).flatMap((claim) =>
          claim.regions.flatMap((region) =>
            region.state === 'suspended' ? [[region.id, region.until] as const] : [],
          ),
        ),
      ),
    [heldRaw],
  );

  return { held, knownRegionById, suspendedUntilByRegion, surveyClock };
}
