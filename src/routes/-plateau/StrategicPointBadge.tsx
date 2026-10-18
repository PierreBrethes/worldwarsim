import { fr, nationLabel } from '@/i18n/fr';
import { asLocalTime } from '@/domain/duration';
import type { StrategicPointView } from '@/domain/player-view';
import { Flag } from '@/emblems/Flag';
import { MapCard } from './MapCard';

const since = (at: number | null) => (at === null ? '—' : asLocalTime(at));

/**
 * **La fiche d'un point stratégique** (P2) : son nom, la règle qu'il casse pour qui le tient, et
 * son état public — neutre, tenu par qui et depuis quand, ou contesté sans dire par qui. Comme
 * toute popin, elle lit ; la capture se donne au clic droit sur le même mât.
 */
export function StrategicPointBadge({
  point,
  mine,
  at,
  onClose,
}: {
  point: StrategicPointView;
  mine: boolean;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const rule = fr.points.rules[point.key];
  const state = point.contested
    ? fr.points.contested
    : point.holder === null
      ? fr.points.neutral
      : mine
        ? fr.points.yoursSince(since(point.heldSince))
        : fr.points.heldBy(nationLabel(point.holder.nation), since(point.heldSince));
  return (
    <MapCard kicker={fr.points.kicker} at={at} gap={{ x: 64, y: 14 }} width={248} onClose={onClose}>
      <div className="mt-[7px] flex items-center gap-[9px]">
        {point.holder !== null && <Flag nation={point.holder.nation} width={26} />}
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--ink)]">
          {fr.points.names[point.key]}
        </span>
      </div>
      <p className="mt-[6px] font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
        {state}
      </p>
      <p className="mt-[6px] text-[11.5px] leading-[1.4] text-[var(--ink)] italic">
        {rule ?? fr.points.ruleToCome}
      </p>
      <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--ink-quiet)]">
        {fr.points.how}
      </p>
    </MapCard>
  );
}
