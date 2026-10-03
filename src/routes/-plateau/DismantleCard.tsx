import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr } from '@/i18n/fr';
import { pledgedWork } from '@/domain/construction';
import { RESOURCES } from '@/domain/ids';
import type { OutpostView, PlayerView } from '@/domain/player-view';
import { handleError } from '@/data/errors';
import type { Seat } from '@/data/session';

/**
 * **Ce qu'un point emporte avec lui, dit avant de le perdre** (décision de Pierre, 16/09). Jumelle
 * de `DemolitionCard`, et elle a plus à énumérer : un avant-poste n'est pas une bâtisse, c'est un
 * site — il colore un sol, il ancre des mâts, il héberge une garnison. Trois pertes qu'aucune
 * bulle de la rose n'aurait la place de dire, et dont deux ne se lisent nulle part ailleurs.
 *
 * **Rien n'est inventé ici** : le nombre de régions perdues vient de `outposts.soleHold`, la même
 * soustraction qui hachure la zone d'un point hors service (`soleHoldOf`) ; les bâtiments ancrés
 * se comptent sur `me.buildings`, la garnison sur `me.troops`, et la file sur la vue. Le serveur
 * refera la même lecture, il ne fera pas une autre.
 *
 * Elle se pose au bout du geste, comme la carte de visée, et finit par le même mot :
 * *irréversible*.
 */
export function DismantleCard({
  seat,
  view,
  outpost,
  at,
  onClose,
}: {
  seat: Seat;
  view: PlayerView;
  outpost: OutpostView;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [razing, setRazing] = useState(false);
  const dismantle = useMutation(api.outposts.dismantle);
  /** **La couleur perdue, comptée par le serveur** — le client n'a ni les polygones ni les points
   *  des 4 589 régions, et une estimation d'ici serait une seconde règle. Tant qu'elle n'a pas
   *  répondu, la ligne manque plutôt que d'annoncer zéro. */
  const colour = useQuery(api.outposts.soleHold, {
    ...seat,
    outpostId: outpost.id as Id<'outposts'>,
  });

  const regionName =
    view.me.regions.find((region) => region.id === outpost.regionId)?.name ?? outpost.hostCountry;
  /** Ce que ce point ancre, tel que la vue rattache les régions à leur site : les mâts d'avant
   *  le champ se replacent côté serveur par le sol, donc la carte peut en annoncer un de moins —
   *  jamais un de trop, et c'est le sens de la précaution. */
  const anchored = view.me.buildings.filter(
    (building) =>
      view.me.regions.find((region) => region.id === building.regionId)?.site?.outpostId ===
      outpost.id,
  );
  const queued = pledgedWork(view).find((work) => work.outpostId === outpost.id);
  const head = view.me.construction;
  /** Une entrée qui court a déjà consommé son tour : c'est la règle de la file, et le
   *  démantèlement ne l'assouplit pas (`constructions.cancel`). */
  const running = head !== null && head.outpostId === outpost.id;
  const garrison = view.me.troops.filter(
    (troop) => troop.stationedAt.kind === 'outpost' && troop.stationedAt.outpostId === outpost.id,
  ).length;

  const raze = () => {
    setError(null);
    setRazing(true);
    dismantle({ ...seat, outpostId: outpost.id as Id<'outposts'> }).then(onClose, (problem) => {
      setRazing(false);
      handleError(problem, setError);
    });
  };

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  return (
    <div
      className="absolute z-[var(--z-popin)] w-[268px] max-w-full"
      style={{
        left: fromRight ? undefined : at.x + 18,
        right: fromRight ? `calc(100% - ${at.x - 18}px)` : undefined,
        top: fromBottom ? undefined : at.y + 18,
        bottom: fromBottom ? `calc(100% - ${at.y - 18}px)` : undefined,
      }}
    >
      <div className="paper-grain border border-[var(--ink)] p-[3px]">
        <div className="border border-(color:--ink)/40 px-[11px] pt-[9px] pb-[11px] text-[var(--ink)]">
          <div className="text-[9px] tracking-[.2em] text-[var(--critical)] uppercase">
            {fr.dismantle.kicker}
          </div>
          <h3 className="mt-[3px] font-(family-name:--font-display) text-[18px] leading-[1.15] font-extrabold">
            {fr.dismantle.heading(regionName, outpost.level)}
          </h3>
          <div className="my-[9px] h-px bg-[var(--ink)] opacity-55" />

          <ul className="font-(family-name:--font-mono) text-[11.5px] leading-[1.7]">
            {colour !== undefined && <li>{fr.dismantle.colour(colour.regions)}</li>}
            {anchored.length > 0 && (
              <li>
                {fr.dismantle.anchored(anchored.length)} —{' '}
                {anchored.map((building) => building.name).join(', ')}
              </li>
            )}
            {queued !== undefined && (
              <li>
                {fr.demolition.queueCancelled} —{' '}
                {running
                  ? fr.demolition.queueRunning
                  : fr.demolition.queueRefund(priceOf(outpost.nextLevelCost))}
              </li>
            )}
            {garrison > 0 && <li>{fr.dismantle.garrison(garrison)}</li>}
            {outpost.standsAt !== null && <li>{fr.dismantle.underConstruction}</li>}
          </ul>

          {/* La phrase de la décision 5a, à part et en dernier : c'est ce qu'on lit juste avant
              d'appuyer. Un avant-poste a coûté une fondation et des élévations, et rien de tout
              cela ne revient. */}
          <p className="mt-[8px] border-t border-(color:--ink)/40 pt-[6px] text-[11px] leading-[1.4] text-[var(--critical)]">
            {fr.dismantle.noRefund}
          </p>

          {error && (
            <p className="mt-[9px] border border-[var(--critical)] px-2 py-[5px] text-[11.5px] text-[var(--ink)]">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={razing}
            onClick={raze}
            className="mt-[10px] w-full cursor-pointer border border-[var(--critical)] bg-[var(--critical)] px-[10px] py-[8px] text-[11px] tracking-[.18em] text-[var(--paper)] uppercase hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {fr.dismantle.submit}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-[6px] w-full cursor-pointer border border-(color:--ink)/40 px-[10px] py-[5px] text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase hover:bg-(--ink)/7"
          >
            {fr.demolition.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** La facture d'une entrée de file, en une phrase — les mêmes chiffres que la branche
 *  « élever » de la rose annonçait. */
const priceOf = (cost: OutpostView['nextLevelCost']): string =>
  RESOURCES.filter((key) => (cost[key] ?? 0) > 0)
    .map((key) => `${cost[key]} ${fr.resources[key]}`)
    .join(' · ');
