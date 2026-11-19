import { heapBinOf, inboundHarvests, overflowingHeaps } from '@/domain/heap-reading';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { asSpan } from '@/domain/duration';
import { countdownLabel, fr } from '@/i18n/fr';

/**
 * **L'abrégé du tas dans la barre des stocks** (#578) : « tas 74 ⚑1 ▲ », sans le montant ni le
 * compte à rebours du ▲. Seul un tas au pied (`foot`) s'écrit en barre ; « aucun tas », l'arsenal et
 * la fondation seule sont l'affaire du volet.
 */
export function HeapBinBar({
  view,
  resource,
  now,
}: {
  view: PlayerView;
  resource: ResourceKey;
  now: number;
}) {
  const bin = heapBinOf(view, resource, now);
  if (bin === null || bin.kind !== 'foot') return null;
  return (
    <small
      aria-hidden
      className="font-(family-name:--font-body) text-[12px] leading-none font-semibold whitespace-nowrap"
    >
      <span className="@max-[70px]:hidden">{fr.heap.board.atFootShort} </span>
      {bin.amount}
      {bin.full > 0 && <span className="text-[var(--critical)]"> ⚑{bin.full}</span>}
      {bin.come !== null && <span className="text-[var(--valid)]"> ▲</span>}
    </small>
  );
}

/**
 * **Ce qui arrive, ce qui déborde** (ADR 0041, #548) : les transports qui ont une récolte à bord, et
 * les tas pleins, dont l'exploitation est arrêtée. Dans la colonne des chantiers du plateau personnel.
 */
export function HeapBoardNotes({ view, now }: { view: PlayerView; now: number }) {
  if (view.mode === 'blitz') return null;
  const inbound = inboundHarvests(view);
  const overflowing = overflowingHeaps(view, now);
  const row =
    'flex flex-wrap items-baseline justify-between gap-x-[8px] font-(family-name:--font-mono) text-[10.5px] leading-[1.3]';
  return (
    <>
      <span className="eyebrow">{fr.heap.board.onTheRoad}</span>
      {inbound.length === 0 && (
        <span className="text-[11px] text-[var(--ink-soft)]">{fr.heap.board.noTour}</span>
      )}
      {inbound.map((one) => (
        <span key={one.troopId} className={row}>
          <span className="min-w-0">{fr.roles[one.role].one}</span>
          <span className="shrink-0 text-[var(--valid)]">
            ▲{' '}
            {RESOURCES.filter((key) => one.harvest[key] > 0)
              .map((key) => `${Math.floor(one.harvest[key])} ${fr.resources[key]}`)
              .join(' · ')}
            {one.arrivesAt === null
              ? ''
              : ` · ${fr.heap.board.legEnds(countdownLabel(Math.max(0, one.arrivesAt - now)))}`}
          </span>
        </span>
      ))}
      <span className="eyebrow mt-[4px]">{fr.heap.board.overflow}</span>
      {overflowing.length === 0 && (
        <span className="text-[11px] text-[var(--ink-soft)]">{fr.heap.board.noOverflow}</span>
      )}
      {overflowing.map((one) => (
        <span key={one.buildingId} className={`${row} text-[var(--critical)]`}>
          <span className="min-w-0 truncate">{one.name}</span>
          <span className="shrink-0">
            {one.amount} ·{' '}
            {fr.heap.board.stoppedFor(asSpan(Math.max(0, now - one.stoppedSince) / 60_000))}
          </span>
        </span>
      ))}
    </>
  );
}
