import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Price } from '@/shell/Price';
import { fr } from '@/i18n/fr';
import { demolitionClipping, pledgedWork } from '@/domain/construction';
import type { Building, PlayerView } from '@/domain/player-view';
import { handleError } from '@/data/errors';
import type { Seat } from '@/data/session';

/**
 * **Ce qu'on perd, dit avant de le perdre** (demande de Pierre, 15/09). C'est la seule
 * confirmation du plateau qui n'annonce aucun achat : il n'y a rien à payer et rien à recevoir,
 * donc la carte n'a qu'un travail — **énumérer les conséquences en clair**, y compris celles que
 * la carte ne montre pas (le chantier que la file portait, l'écrêtage d'un entrepôt).
 *
 * Elle ne calcule rien qu'elle invente : la facture de la file est le coût du niveau servi, la
 * garnison est celle de la vue, et l'écrêtage sort de `demolitionClipping` — la même
 * soustraction que `clipToStorage` applique côté serveur.
 *
 * Elle se pose au bout du geste, comme la carte de visée, et finit par le même mot : *
 * irréversible*.
 */
export function DemolitionCard({
  seat,
  view,
  building,
  at,
  onClose,
}: {
  seat: Seat;
  view: PlayerView;
  building: Building;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [razing, setRazing] = useState(false);
  const demolish = useMutation(api.buildings.demolish);

  const regionName =
    view.me.regions.find((region) => region.id === building.regionId)?.name ?? building.regionId;
  /** Une entrée par région (`convex/constructions.ts`), donc celle de cette région est
   *  l'élévation de ce mât-ci — l'élévation d'un avant-poste n'en prend aucune. */
  const queued = pledgedWork(view).find(
    (work) => work.outpostId === null && work.regionId === building.regionId,
  );
  /** Une entrée qui court a déjà consommé son tour : c'est la règle de la file, et la
   *  démolition ne l'assouplit pas (`constructions.cancel`). */
  const running = queued?.minutesLeft != null;
  const garrison = view.me.troops.filter(
    (troop) =>
      troop.stationedAt.kind === 'building' && troop.stationedAt.buildingId === building.id,
  ).length;
  /** La vue sert *qui* forme, jamais *quoi* (`me.recruiting`) : la phrase dit donc qu'une file
   *  s'arrête, et le détail se lit dans la modale du site — qui ne survivra pas au clic. */
  const recruiting = view.me.recruiting.includes(building.id);
  const clipping = demolitionClipping(building, view, view.loadedAt);

  const raze = () => {
    setError(null);
    setRazing(true);
    demolish({ ...seat, buildingId: building.id as Id<'buildings'> }).then(onClose, (problem) => {
      setRazing(false);
      handleError(problem, setError);
    });
  };

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  return (
    <div
      className="absolute z-[var(--z-popin)] w-[262px] max-w-full"
      style={{
        left: fromRight ? undefined : at.x + 18,
        right: fromRight ? `calc(100% - ${at.x - 18}px)` : undefined,
        top: fromBottom ? undefined : at.y + 18,
        bottom: fromBottom ? `calc(100% - ${at.y - 18}px)` : undefined,
      }}
    >
      <div className="float paper-grain border border-[var(--ink)] p-[3px]">
        <div className="border border-(color:--ink)/40 px-[11px] pt-[9px] pb-[11px] text-[var(--ink)]">
          <div className="text-[9px] tracking-[.2em] text-[var(--critical)] uppercase">
            {fr.demolition.kicker}
          </div>
          <h3 className="mt-[3px] font-(family-name:--font-display) text-[18px] leading-[1.15] font-extrabold">
            {fr.demolition.heading(building.name, building.level)}
          </h3>
          <div className="my-[9px] h-px bg-[var(--ink)] opacity-55" />

          <ul className="font-(family-name:--font-mono) text-[11.5px] leading-[1.7]">
            <li>{fr.demolition.freed(regionName)}</li>
            {queued !== undefined && (
              <li>
                {fr.demolition.queueCancelled} —{' '}
                {running ? (
                  fr.demolition.queueRunning
                ) : (
                  <>
                    {fr.demolition.queueRefund} <Price costs={building.nextLevelCost} size={11} />
                  </>
                )}
              </li>
            )}
            {garrison > 0 && <li>{fr.demolition.garrison(garrison)}</li>}
            {recruiting && <li>{fr.demolition.batches(1)}</li>}
          </ul>

          {/* L'écrêtage en chiffres : un plafond qui tombe est une perte sèche, et elle doit se
              lire avant le clic, pas se découvrir au bandeau. */}
          {clipping.length > 0 && (
            <div className="mt-[7px] border-t border-(color:--ink)/40 pt-[6px]">
              <div className="text-[10.5px] tracking-[.1em] text-[var(--critical)] uppercase">
                {fr.demolition.clipping}
              </div>
              <div className="mt-[3px] flex flex-wrap gap-x-[10px] font-(family-name:--font-mono) text-[11px]">
                {clipping.map((line) => (
                  <span key={line.resource}>
                    {fr.demolition.clippingLine(fr.resources[line.resource], Math.floor(line.lost))}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* La phrase de la décision 5a, à part et en dernier : c'est ce qu'on lit juste avant
              d'appuyer. */}
          <p className="mt-[8px] border-t border-(color:--ink)/40 pt-[6px] text-[11px] leading-[1.4] text-[var(--critical)]">
            {fr.demolition.noRefund}
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
            className="mt-[10px] w-full cursor-pointer border border-[var(--critical)] bg-[var(--critical)] px-[10px] py-[8px] text-[11px] tracking-[.18em] text-[var(--paper)] uppercase hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {fr.demolition.submit}
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
