import { asDayAndTime, asDuration } from '@/domain/duration';
import type { PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { ResourceAmounts } from './CargoReadout';
import { Draggable, DragHandle } from './Draggable';

type LootSighting = PlayerView['lootSightings'][number];

/** The last private photograph only: no crate truth, owner, provenance or expiry is available. */
export function LootCrateCard({
  sighting,
  at,
  onClose,
}: {
  sighting: LootSighting;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const now = useClock(60_000);
  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;
  const age = Math.max(0, now - sighting.seenAt) / 60_000;

  return (
    <Draggable
      className="absolute z-20"
      style={{
        left: fromRight ? undefined : at.x + 18,
        right: fromRight ? `calc(100% - ${at.x - 18}px)` : undefined,
        top: fromBottom ? undefined : at.y + 18,
        bottom: fromBottom ? `calc(100% - ${at.y - 18}px)` : undefined,
      }}
    >
      <section className="hud paper-grain w-[248px] border border-[var(--ink)] bg-[var(--paper)] px-[10px] py-[8px]">
        <DragHandle className="flex items-baseline gap-2">
          <span className="text-[9px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
            {fr.loot.cardKicker}
          </span>
          <span
            className={`border px-[5px] py-[1px] text-[8px] tracking-[.14em] uppercase ${
              sighting.current
                ? 'border-[var(--ink-soft)] text-[var(--ink-soft)]'
                : 'border-dashed border-[var(--ink-quiet)] text-[var(--ink-quiet)]'
            }`}
          >
            {sighting.current ? fr.loot.current : fr.loot.stale}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto cursor-pointer border border-[var(--ink)] px-[6px] py-[1px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>
        <ResourceAmounts amounts={sighting.loot} />
        <div className="mt-[8px] border-t border-[rgba(42,33,24,.24)] pt-[6px] text-[10.5px] leading-[1.45] text-[var(--ink-soft)]">
          <p>{fr.loot.seenAt(asDayAndTime(sighting.seenAt))}</p>
          <p>{fr.loot.seenAgo(asDuration(age))}</p>
        </div>
      </section>
    </Draggable>
  );
}
