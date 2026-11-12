import { heapBinOf, inboundHarvests, overflowingHeaps } from '@/domain/heap-reading';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { asSpan } from '@/domain/duration';
import { countdownLabel, fr } from '@/i18n/fr';

/**
 * **Sous chaque bac, ce qui attend au pied** (ADR 0041, #548, maquette « Au pied ») : le total des
 * tas, ceux qui sont pleins, ce qui revient à bord d'un transport. `short` : au téléphone, cinq
 * colonnes, sans l'étiquette longue.
 */
export function HeapBinLines({
  view,
  resource,
  now,
  short = false,
}: {
  view: PlayerView;
  resource: ResourceKey;
  now: number;
  short?: boolean;
}) {
  const bin = heapBinOf(view, resource, now);
  if (bin === null) return null;
  const line = 'block leading-[1.25]';
  if (bin.kind !== 'foot')
    return (
      <small
        className={`${line} max-w-full text-center font-(family-name:--font-text) text-[10px] text-[var(--ink-soft)] italic`}
      >
        {bin.kind === 'arsenal' ? fr.heap.board.fromArsenal : fr.heap.board.foundationOnly}
      </small>
    );
  return (
    <span className="grid justify-items-center gap-[1px] font-(family-name:--font-mono) text-[10px] whitespace-nowrap">
      <small className={line}>
        {short ? fr.heap.board.atFootShort : fr.heap.board.atFoot} {bin.amount}
      </small>
      {bin.full > 0 && (
        <small className={`${line} text-[var(--critical)]`}>
          ⚑ {fr.heap.board.fullCount(bin.full)}
        </small>
      )}
      {bin.come !== null && (
        <small className={`${line} text-[var(--valid)]`} title={fr.heap.board.coming}>
          ▲ {Math.floor(bin.come.amount)}
          {bin.come.arrivesAt === null
            ? ''
            : ` · ${countdownLabel(Math.max(0, bin.come.arrivesAt - now))}`}
        </small>
      )}
    </span>
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
            {one.arrivesAt === null ? '' : ` · ${countdownLabel(Math.max(0, one.arrivesAt - now))}`}
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
