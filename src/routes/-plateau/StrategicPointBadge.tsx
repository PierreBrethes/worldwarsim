import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { countdownLabel, fr, nationLabel } from '@/i18n/fr';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import { TANGIER_LOT } from '@/domain/strategic-points';
import { errorMessage } from '@/data/errors';
import type { Seat } from '@/data/session';
import { useClock } from '@/shell/clock';
import { notify } from '@/shell/notifications';
import { asLocalTime } from '@/domain/duration';
import type { StrategicPointView } from '@/domain/player-view';
import { Flag } from '@/emblems/Flag';
import { MapCard } from './MapCard';

const since = (at: number | null) => (at === null ? '—' : asLocalTime(at));

/**
 * **La fiche d'un point stratégique** (P2) : son nom, la règle qu'il casse pour qui le tient, et
 * son état public — neutre, tenu par qui, depuis quand et combien en tout, ou contesté sans dire
 * par qui. Comme toute popin, elle lit ; la capture se donne au clic droit sur le même mât.
 */
export function StrategicPointBadge({
  point,
  mine,
  seat,
  nations,
  at,
  onClose,
}: {
  point: StrategicPointView;
  mine: boolean;
  seat: Seat;
  /** Les autres nations à la table, que lit Istanbul. */
  nations: ReadonlyArray<string>;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const now = useClock(60_000);
  const rule = fr.points.rules[point.key];
  const total =
    point.holder === null
      ? ''
      : countdownLabel(point.holder.heldMs + now - (point.heldSince ?? now));
  const state = point.contested
    ? fr.points.contested
    : point.holder === null
      ? fr.points.neutral
      : mine
        ? fr.points.yoursSince(since(point.heldSince), total)
        : fr.points.heldBy(nationLabel(point.holder.nation), since(point.heldSince), total);
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
      <p className="mt-[6px] text-[11.5px] leading-[1.4] text-[var(--ink)] italic">{rule}</p>
      {mine && point.key === 'istanbul' && <Listen seat={seat} nations={nations} />}
      {mine && point.key === 'tangier' && <Trade seat={seat} />}
      <p className="mt-[6px] text-[10.5px] leading-[1.4] text-[var(--ink-quiet)]">
        {fr.points.how}
      </p>
    </MapCard>
  );
}

const field = 'border border-[var(--ink)] bg-transparent px-1 py-[2px] text-[11px]';
const act =
  'mt-[6px] w-full cursor-pointer border border-[var(--ink)] px-2 py-[4px] text-[10px] font-semibold tracking-[.14em] uppercase';

/** **Istanbul** (P11) : deux nations, et le dernier télégramme privé entre elles. */
function Listen({ seat, nations }: { seat: Seat; nations: ReadonlyArray<string> }) {
  const listen = useMutation(api.strategicPoints.listen);
  const [pair, setPair] = useState<readonly [string, string]>([nations[0] ?? '', nations[1] ?? '']);
  const [said, setSaid] = useState<string | null>(null);
  const choose = (rank: 0 | 1) => (event: { target: { value: string } }) =>
    setPair(rank === 0 ? [event.target.value, pair[1]] : [pair[0], event.target.value]);
  const read = () =>
    void listen({ ...seat, between: [...pair] })
      .then((heard) =>
        setSaid(
          heard === null
            ? fr.points.istanbul.nothing
            : fr.points.istanbul.read(nationLabel(heard.from), nationLabel(heard.to), heard.text),
        ),
      )
      .catch((problem: unknown) => setSaid(errorMessage(problem) ?? fr.unexpectedError));
  return (
    <section className="mt-[8px] border-t border-(--ink)/30 pt-[6px]">
      <p className="text-[10px] font-bold tracking-[.16em] uppercase">{fr.points.istanbul.title}</p>
      <div className="mt-[4px] flex items-center gap-[6px] text-[11px]">
        {fr.points.istanbul.between}
        <select
          aria-label={fr.points.istanbul.between}
          className={field}
          value={pair[0]}
          onChange={choose(0)}
        >
          {nations.map((nation) => (
            <option key={nation} value={nation}>
              {nationLabel(nation)}
            </option>
          ))}
        </select>
        {fr.points.istanbul.and}
        <select
          aria-label={fr.points.istanbul.and}
          className={field}
          value={pair[1]}
          onChange={choose(1)}
        >
          {nations.map((nation) => (
            <option key={nation} value={nation}>
              {nationLabel(nation)}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className={act} onClick={read}>
        {fr.points.istanbul.act}
      </button>
      {said !== null && <p className="mt-[6px] text-[11px] leading-[1.35] italic">{said}</p>}
    </section>
  );
}

/** **Tanger** (P11) : le comptoir neutre, trois contre un, une fois par édition. */
function Trade({ seat }: { seat: Seat }) {
  const trade = useMutation(api.strategicPoints.trade);
  const [give, setGive] = useState<ResourceKey>('food');
  const [get, setGet] = useState<ResourceKey>('ammunition');
  const [said, setSaid] = useState<string | null>(null);
  const exchange = () =>
    void trade({ ...seat, give, get })
      .then(({ got }) => {
        setSaid(null);
        notify(fr.points.tangier.done(got), 'info');
      })
      .catch((problem: unknown) => setSaid(errorMessage(problem) ?? fr.unexpectedError));
  const pick = (value: ResourceKey, set: (key: ResourceKey) => void, label: string) => (
    <label className="flex items-center gap-[4px] text-[11px]">
      {label}
      <select
        className={field}
        value={value}
        onChange={(event) => set(event.target.value as ResourceKey)}
      >
        {RESOURCES.map((key) => (
          <option key={key} value={key}>
            {fr.resources[key]}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="mt-[8px] border-t border-(--ink)/30 pt-[6px]">
      <p className="text-[10px] font-bold tracking-[.16em] uppercase">{fr.points.tangier.title}</p>
      <div className="mt-[4px] flex flex-wrap gap-[8px]">
        {pick(give, setGive, fr.points.tangier.give)}
        {pick(get, setGet, fr.points.tangier.get)}
      </div>
      <button type="button" className={act} onClick={exchange}>
        {fr.points.tangier.act(TANGIER_LOT.give, TANGIER_LOT.get)}
      </button>
      {said !== null && <p className="mt-[6px] text-[11px] italic">{said}</p>}
    </section>
  );
}
