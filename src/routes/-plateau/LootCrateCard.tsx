import { asDayAndTime, asDuration } from '@/domain/duration';
import type { PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { ResourceAmounts } from './CargoReadout';
import { MapCard } from './MapCard';

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
  const age = Math.max(0, now - sighting.seenAt) / 60_000;

  return (
    <MapCard
      kicker={fr.loot.cardKicker}
      aside={
        <span
          className={`border px-[5px] py-[1px] text-[8px] tracking-[.14em] uppercase ${
            sighting.current
              ? 'border-[var(--ink-soft)] text-[var(--ink-soft)]'
              : 'border-dashed border-[var(--ink-quiet)] text-[var(--ink-quiet)]'
          }`}
        >
          {sighting.current ? fr.loot.current : fr.loot.stale}
        </span>
      }
      at={at}
      gap={{ x: 18, y: 18 }}
      width={248}
      onClose={onClose}
    >
      <ResourceAmounts amounts={sighting.loot} />
      <div className="mt-[8px] border-t border-(color:--ink)/24 pt-[6px] text-[10.5px] leading-[1.45] text-[var(--ink-soft)]">
        <p>{fr.loot.seenAt(asDayAndTime(sighting.seenAt))}</p>
        <p>{fr.loot.seenAgo(asDuration(age))}</p>
      </div>
    </MapCard>
  );
}
