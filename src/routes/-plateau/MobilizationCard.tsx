import { fr } from '@/i18n/fr';
import type { BuildingKey } from '@/domain/ids';
import { EXPLOITED_DEPOSITS } from '@/domain/economy';
import type { Placement, PlacementCondition } from '@/domain/construction';
import type { PlayerView } from '@/domain/player-view';
import { BuildingPlate } from '@/emblems/Plate';

/**
 * **The debt of the nation, made visible.** A season opens owing its player one extractor per
 * resource his own ground holds, and he learns it nowhere: a playtest measured a *paid* mill
 * started before the *offered* mines, and the single-construction lock then held three
 * placements that cost nothing and waited for nothing. No rule was missing — `foundationOwed`
 * existed, the view already carried `me.foundation`. Nothing was visible.
 *
 * The gesture: **click a key, the board highlights the ground it accepts, click the region.**
 * The card carries no rule of its own — `placementOf` is the server's own placement refusal,
 * read twice — and it holds no state about what was placed: it is drawn from `me.foundation`,
 * so it empties as the season is paid off and **disappears with it**. There is no closed
 * state; its absence is the closed state.
 */
export function MobilizationCard({
  view,
  placements,
  armed,
  error,
  onArm,
}: {
  view: PlayerView;
  /** One entry per distinct owed key, in the order the foundation owes them. */
  placements: ReadonlyArray<Placement>;
  armed: BuildingKey | null;
  error: string | null;
  onArm: (key: BuildingKey | null) => void;
}) {
  const owed = view.me.foundation;
  if (owed.length === 0) return null;

  const chosen = placements.find((placement) => placement.key === armed) ?? null;

  return (
    <section className="hud paper-grain w-[296px] border border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]">
      <div className="border-b-2 border-[var(--ink)] px-[13px] pt-[9px] pb-2">
        <h2 className="font-(family-name:--font-display) text-[15px] leading-none font-extrabold tracking-[.06em] uppercase">
          {fr.mobilization.header}
        </h2>
        <div className="mt-[3px] flex items-baseline gap-2">
          <span className="text-[11.5px] text-[var(--ink-soft)]">{fr.mobilization.foundation}</span>
          <span className="h-px flex-1 bg-[rgba(42,33,24,.25)]" />
          <span className="font-(family-name:--font-mono) text-[11px]">
            {fr.mobilization.owed(owed.length)}
          </span>
        </div>
      </div>

      <div className="py-[4px]">
        {placements.map((placement) => (
          <KeyRow
            key={placement.key}
            placement={placement}
            count={owed.filter((key) => key === placement.key).length}
            armed={placement.key === armed}
            onArm={() => onArm(placement.key === armed ? null : placement.key)}
          />
        ))}
      </div>

      {chosen === null ? (
        <p className="border-t border-[var(--ink)] px-[13px] py-[9px] text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
          {fr.mobilization.pick}
        </p>
      ) : (
        <Aimed view={view} placement={chosen} onCancel={() => onArm(null)} />
      )}

      {error !== null && (
        <p className="border-t border-[var(--critical)] px-[13px] py-[7px] text-[11.5px] leading-[1.4] text-[var(--critical)]">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * One key of the foundation. It is a button whether or not it has ground to go down on — the
 * revised rule of ADR 0015 is *rien d'affiché sans sa condition*, not *rien d'affiché* : the
 * line that cannot be placed today still says what would open it, and clicking it is how the
 * player finds out that nothing lights up.
 */
function KeyRow({
  placement,
  count,
  armed,
  onArm,
}: {
  placement: Placement;
  count: number;
  armed: boolean;
  onArm: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onArm}
      className={`flex w-full cursor-pointer items-center gap-[9px] border-b border-[rgba(42,33,24,.18)] px-[13px] py-[8px] text-left last:border-b-0 ${
        armed
          ? 'bg-[var(--ink)] text-[var(--paper)]'
          : 'text-[var(--ink)] hover:bg-[rgba(42,33,24,.07)]'
      }`}
    >
      <BuildingPlate building={placement.key} height={26} />
      <span className="text-[14px] leading-none font-semibold tracking-[.02em]">
        {fr.buildings[placement.key]}
      </span>
      {count > 1 && (
        <span className="font-(family-name:--font-mono) text-[11px] opacity-70">
          {fr.mobilization.count(count)}
        </span>
      )}
      <span className="flex-1" />
      <span
        className="max-w-[46%] text-right text-[11px] leading-[1.35]"
        style={{ color: armed ? 'var(--notable)' : 'var(--ink-soft)' }}
      >
        {armed ? offerText(placement) : wantsText(placement)}
      </span>
    </button>
  );
}

/** What the region must be for this key to go down — said before it is chosen, never after. */
function wantsText(placement: Placement): string {
  const deposits = EXPLOITED_DEPOSITS[placement.key];
  if (deposits !== undefined) {
    return fr.mobilization.wants.deposit(deposits.map((deposit) => fr.deposits[deposit]));
  }
  return placement.key === 'port' ? fr.mobilization.wants.coastal : fr.mobilization.wants.any;
}

const offerText = (placement: Placement): string =>
  placement.regionIds.length === 0
    ? fr.mobilization.noneEligible
    : fr.mobilization.eligible(placement.regionIds.length);

/**
 * The foot of the card once a key is armed: what the board is now waiting for, the regions it
 * lit, and the way out. **A mode one cannot leave is a trap** — the same rule the aim banner
 * follows.
 */
function Aimed({
  view,
  placement,
  onCancel,
}: {
  view: PlayerView;
  placement: Placement;
  onCancel: () => void;
}) {
  const names = placement.regionIds.flatMap((regionId) => {
    const region = view.me.regions.find((candidate) => candidate.id === regionId);
    return region === undefined ? [] : [region.name];
  });

  return (
    <>
      <div className="border-t border-[var(--ink)] bg-[rgba(176,116,52,.16)] px-[13px] py-[9px]">
        {placement.condition === null ? (
          <>
            <p className="text-[12.5px] leading-[1.4] font-semibold">
              {fr.mobilization.chooseRegion(wantsText(placement))}
            </p>
            <p className="mt-[2px] text-[11px] leading-[1.4] text-[var(--ink-soft)]">
              {fr.mobilization.highlighted(names)}
            </p>
            <p className="mt-[2px] text-[11px] leading-[1.4] text-[var(--ink-quiet)] italic">
              {fr.mobilization.zoomIn}
            </p>
          </>
        ) : (
          <p className="text-[12.5px] leading-[1.4]">{conditionText(placement.condition)}</p>
        )}
      </div>
      <div className="border-t border-[rgba(42,33,24,.22)] px-[13px] py-[7px]">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer text-[11px] text-[var(--interaction)] underline decoration-[rgba(63,90,125,.45)] underline-offset-2 hover:text-[var(--ink)]"
        >
          {fr.mobilization.cancel}
        </button>
      </div>
    </>
  );
}

/**
 * The one sentence that would open a key nothing accepts. It reads the condition the shared
 * placement rule produced, so a screen and a server refusal can never name different things.
 */
export function conditionText(condition: PlacementCondition): string {
  const said = fr.economy.condition;
  switch (condition.kind) {
    case 'locked':
      return said.locked(condition.hqLevel);
    case 'deposit':
      return said.deposit(condition.deposits.map((deposit) => fr.deposits[deposit]));
    case 'coastal':
      return said.coastal;
    case 'cap':
      return said.cap;
    case 'regionsTaken':
      return said.regionsTaken;
  }
}
