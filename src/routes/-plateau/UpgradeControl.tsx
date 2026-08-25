import { useMutation } from 'convex/react';
import { useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { aBuilding, fr, noBuilding, upgradeHoldText } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { availabilityOf, upgradeHold, type UpgradeHold } from '@/domain/construction';
import { PRODUCER_OF } from '@/domain/economy';
import { asDuration } from '@/domain/duration';
import { DEPOSITS, RESOURCES } from '@/domain/ids';
import { currentStock, type Building, type Cost, type PlayerView } from '@/domain/player-view';
import { ResourcePlate } from '@/emblems/Plate';

/**
 * Raising a level, on the line of the building itself — in Industry, in Production and on the
 * nation sheet alike. A deliberate relaxation of "one verb per surface": raising is the most
 * frequent action of the game after recruiting, and sending the player to another window for
 * it would turn every upgrade into three clicks. **The map puts down, the window uses and
 * raises.**
 *
 * One component and not three: the acceptance is that raising from Industry and raising from
 * the nation sheet do exactly the same thing, and the surest way to hold that is to have one
 * caller of `constructions.start`.
 *
 * **The button is never absent, only prevented and explained.** A button that disappears
 * leaves the player looking for what he did wrong.
 */
export function UpgradeControl({
  building,
  view,
  token,
  now,
}: {
  building: Building;
  view: PlayerView;
  token: string;
  now: number;
}) {
  const start = useMutation(api.constructions.start);
  const [error, setError] = useState<string | null>(null);
  const hold = upgradeHold(building, view, now);
  const next = building.level + 1;

  const held = hold === null ? null : upgradeHoldText(hold);

  return (
    <div className="flex shrink-0 flex-col items-end gap-[3px]">
      <div className="flex items-center gap-[10px]">
        <CostLine cost={building.nextLevelCost} lacking={hold?.kind === 'materials'} />
        <span className="font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
          {asDuration(building.nextLevelMinutes)}
        </span>
        <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-quiet)]">
          {fr.upgrade.toLevel(next)}
        </span>
        <button
          type="button"
          disabled={held !== null}
          title={held ?? fr.upgrade.title(building.name, next)}
          onClick={() => {
            setError(null);
            start({ token, building: building.key, regionId: building.regionId }).catch(
              (problem: unknown) => handleError(problem, setError),
            );
          }}
          className="cursor-pointer border border-[var(--ink)] px-[10px] py-[5px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-[var(--ink)]"
        >
          {fr.upgrade.action}
        </button>
      </div>
      {held !== null && (
        <span className="max-w-[42ch] text-right text-[11px] leading-[1.35] text-[var(--ink-soft)]">
          {held}
        </span>
      )}
      {hold?.kind === 'materials' && <WhenAffordable hold={hold} view={view} now={now} />}
      {error !== null && (
        <span className="max-w-[42ch] text-right text-[11px] leading-[1.35] text-[var(--critical)]">
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * The line the borrowed idea buys (brief §5): a shortfall is followed by *when* it stops being
 * one — and, when nothing produces the matter, by the building that would. "Jamais : aucune
 * mine" is not a harder refusal than "il faut 72 de charbon", it is the only one that tells
 * the player what to do next.
 */
function WhenAffordable({
  hold,
  view,
  now,
}: {
  hold: Extract<UpgradeHold, { kind: 'materials' }>;
  view: PlayerView;
  now: number;
}) {
  const held = view.me.resources[hold.resource];
  const when = availabilityOf(hold.needed, held, currentStock(held, view.loadedAt, now));
  if (when.kind === 'now') return null;

  const producer = PRODUCER_OF[hold.resource];
  const deposit = DEPOSITS.find((key) => key === hold.resource) ?? null;

  return (
    <span
      className="max-w-[42ch] text-right text-[11px] leading-[1.35]"
      style={{ color: when.kind === 'never' ? 'var(--critical)' : 'var(--ink-soft)' }}
    >
      {when.kind === 'inMinutes' ? (
        fr.upgrade.availableIn(asDuration(when.minutes))
      ) : (
        <>
          <span className="font-semibold">
            {deposit === null
              ? fr.upgrade.never(noBuilding(producer))
              : fr.upgrade.neverOnDeposit(noBuilding(producer), fr.deposits[deposit])}
          </span>{' '}
          <span className="text-[var(--ink-soft)]">
            — {fr.upgrade.neverNote(aBuilding(producer))}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * The bill in the critical ink when it cannot be paid: the figures are the explanation.
 *
 * The **illustrated plates**, as the industry window prices everything else (`Quantity`) and
 * as the placement panel now bills a construction: the two verbs of building are read the same
 * way, and two objects on paper are told apart faster than two silhouettes at twelve pixels.
 * The vector stays where space is genuinely short — the banner, the production expenses, the
 * folded alerts of the reserves.
 *
 * A plate carries its own ink and takes no tint, so only the figure turns critical. That is
 * the half that has to: the resource is *what* is missing, the number is *how much*.
 */
function CostLine({ cost, lacking }: { cost: Cost; lacking: boolean }) {
  return (
    <span
      className="flex items-center justify-end gap-[10px] font-(family-name:--font-mono) text-[12.5px]"
      style={{ color: lacking ? 'var(--critical)' : 'var(--ink)' }}
    >
      {RESOURCES.filter((key) => (cost[key] ?? 0) > 0).map((key) => (
        <span key={key} className="flex items-center gap-[4px]">
          <ResourcePlate resource={key} height={20} />
          {cost[key]}
        </span>
      ))}
    </span>
  );
}
