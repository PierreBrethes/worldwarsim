import { SEASON_FORMATS, chainSpeed } from '../../../convex/constants';
import { fr, doctrineLabel, nationLabel, stackLabel } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { DEPOSITS } from '@/domain/ids';
import type { Building, PlayerView } from '@/domain/player-view';
import { currentMinutes } from '@/domain/player-view';
import { Flag } from '@/emblems/Flag';
import { BuildingPlate } from '@/emblems/Plate';
import { asHoursMinutes } from '@/domain/duration';
import { FOCUS_MARK, useFocusRow } from './focus';
import { UpgradeControl } from './UpgradeControl';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';

/**
 * What the nation holds, and what the headquarters lets it hold. **One verb per surface**: a
 * building is raised where it is used — Industry or Production — so no cost and no button
 * appear in the census below. The headquarters is the exception because it is the exception:
 * this window is its only surface (`WINDOW_OF_BUILDING`), so its line carries the button.
 *
 * What this sheet owns alone is the **building budget**: `buildingCap` is the game's central
 * throttle (ADR 0015 — nothing is ever counted in regions, the headquarters is the only
 * bottleneck), and a number buried in a fifteen-line list is not a home for it.
 */
export function NationWindow({
  view,
  token,
  focused,
  onClose,
  ...windowProps
}: WindowProps & {
  view: PlayerView;
  token: string;
  /** The building whose line the window was opened on, `null` when it was opened bare. */
  focused: string | null;
}) {
  const now = useClock();
  const hq = view.me.buildings.find((building) => building.key === 'hq') ?? null;
  /**
   * **The headquarters is counted in.** It used to sit in its block above and out of the list,
   * so "3 sur 5" surmounted two lines and the two contradicted each other at a glance — and it
   * is the figure the player stops believing, not the list. The census is the only place the
   * fifteen are read at once, and a whole reading may not be missing one of them.
   */
  const census = view.me.buildings;

  return (
    <FloatingWindow name="nation" onClose={onClose} {...windowProps} alignment="top" width={880}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)] px-[26px] pt-[18px] pb-6">
        <DragHandle className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>{fr.nationSheet.kicker}</span>
          <span>{fr.nationSheet.season(view.season.number)}</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <div className="mt-2 flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-1 border-t-2 border-b border-[var(--ink)] py-3">
          <span className="self-center">
            <Flag nation={view.me.nation} width={36} onPaper />
          </span>
          <h1 className="font-[var(--font-display)] text-[clamp(22px,4cqi,34px)] leading-none font-extrabold tracking-[.02em] text-[var(--ink)] uppercase">
            {nationLabel(view.me.nation)}
          </h1>
          <span className="text-[11px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            {fr.nationSheet.doctrineLine(doctrineLabel(view.me.doctrine) ?? view.me.doctrine)}
          </span>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-5 overflow-auto @2xl:flex-row @2xl:items-start @2xl:gap-[26px]">
          <section className="min-w-0 flex-1">
            <HeadquartersBlock
              hq={hq}
              view={view}
              token={token}
              now={now}
              focused={hq !== null && focused === hq.id}
            />

            <BuildingBudget taken={view.me.buildings.length} cap={view.me.buildingCap} />

            <h2 className="eyebrow mt-5 border-b border-[var(--ink)] pb-[6px]">
              {fr.nationSheet.buildingsHeader}
            </h2>
            {census.length === 0 ? (
              <p className="mt-3 text-[12.5px] leading-[1.5] text-[var(--ink-soft)]">
                {fr.nationSheet.nothingBuilt}
              </p>
            ) : (
              <>
                {census.map((building) => (
                  <BuildingRow
                    key={`${building.key}-${building.regionId}`}
                    building={building}
                    regionName={regionName(view, building.regionId)}
                  />
                ))}
                <p className="mt-2 text-[11px] leading-[1.4] text-[var(--ink-quiet)] italic">
                  {fr.nationSheet.buildingsNote}
                </p>
              </>
            )}
            {view.me.construction && (
              <p className="mt-3 border border-[var(--ink)] px-3 py-2 text-[12.5px] text-[var(--ink)]">
                {fr.nationSheet.constructionRunning}
                <strong>{view.me.construction.name}</strong>{' '}
                {fr.nationSheet.inRegion(view.me.construction.regionName)}
                {fr.nationSheet.remains}
                <span className="font-[var(--font-mono)]">
                  {asHoursMinutes(
                    currentMinutes(view.me.construction.minutesLeft, view.loadedAt, now),
                  )}
                </span>
              </p>
            )}
          </section>

          <aside className="w-full @2xl:w-[280px] @2xl:shrink-0">
            <h2 className="eyebrow border-b border-[var(--ink)] pb-[6px]">
              {fr.nationSheet.powerHeader}
            </h2>
            <p className="mt-2 text-[13px] leading-[1.5] text-[var(--ink)]">{view.me.power}</p>

            <NationalGap regions={view.me.regions} />

            <h2 className="eyebrow mt-5 border-b border-[var(--ink)] pb-[6px]">
              {fr.nationSheet.armyHeader}
            </h2>
            <div className="mt-2 flex flex-col gap-[5px] text-[12.5px]">
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">{fr.nationSheet.present}</span>
                <span className="text-right text-[var(--ink)]">
                  {stackLabel(view.me.armyPresent)}
                </span>
              </span>
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">{fr.nationSheet.inTransit}</span>
                <span className="text-right text-[var(--ink)]">
                  {stackLabel(view.me.armyInTransit)}
                </span>
              </span>
            </div>

            {/* The eight stocks are **not** here. No decision taken on this sheet spends
                anything, so the column was eight lines and eight ceilings repeating the
                banner — and, without a warehouse, repeating the same 400 eight times. A datum
                has one home; the banner is the exception, because it watches. */}

            <h2 className="eyebrow mt-5 border-b border-[var(--ink)] pb-[6px]">
              {fr.nationSheet.restHeader}
            </h2>
            <p className="mt-2 text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.nationSheet.restNote}
            </p>
            <p className="mt-2 font-[var(--font-mono)] text-[14px] text-[var(--ink)]">
              {view.me.restWindow}
            </p>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--ink-quiet)] italic">
              {fr.nationSheet.restFrozen}
            </p>
          </aside>
        </div>
      </div>
    </FloatingWindow>
  );
}

const regionName = (view: PlayerView, regionId: string): string =>
  view.me.regions.find((region) => region.id === regionId)?.name ?? regionId;

/**
 * The headquarters and what it carries. Nothing here is a second implementation of a rule:
 * the ceiling and the slots arrive served, the chain speed and the tier-2 gate are read from
 * `constants.ts` itself — a formula copied into a caption is a formula that drifts.
 */
function HeadquartersBlock({
  hq,
  view,
  token,
  now,
  focused,
}: {
  hq: Building | null;
  view: PlayerView;
  token: string;
  now: number;
  focused: boolean;
}) {
  const block = useFocusRow<HTMLElement>(focused);
  const level = view.me.hqLevel;

  return (
    <section
      ref={block}
      className={`border border-[var(--ink)] px-3 py-[10px] ${focused ? FOCUS_MARK : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {hq !== null && <BuildingPlate building="hq" height={44} />}
        <h2 className="eyebrow">{fr.nationSheet.hqHeader}</h2>
        {hq !== null && (
          <>
            {/* No region here: a nation has one capital and does not choose it (ADR 0015), so
                the line said the same thing every season — and the census below already names
                the ground of every building, that one included. */}
            <span className="font-[var(--font-mono)] text-[12px] text-[var(--ink)]">
              {fr.nationSheet.hqLevelLine(level, SEASON_FORMATS[view.season.format].maxHqLevel)}
            </span>
            <span className="ml-auto">
              <UpgradeControl building={hq} view={view} token={token} now={now} />
            </span>
          </>
        )}
      </div>

      {hq === null ? (
        <p className="mt-2 text-[12.5px] leading-[1.5] text-[var(--critical)]">
          {fr.nationSheet.hqMissing}
        </p>
      ) : (
        <>
          <p className="mt-[10px] text-[10px] tracking-[.16em] text-[var(--ink-quiet)] uppercase">
            {fr.nationSheet.hqCarriesHeader}
          </p>
          {/* The building ceiling is deliberately absent: it is written three centimetres
              below, as a bar, and a figure and a bar for one fact make the player doubt the
              figure. The bar wins — it is a reading, where "5 au plus" has to be parsed. */}
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-[2px] text-[12px] text-[var(--ink-soft)]">
            <li>{fr.nationSheet.hqSlots(view.me.slots.total)}</li>
            <li>{fr.nationSheet.hqChainSpeed(chainSpeed(level).toFixed(2))}</li>
            <li>
              {level >= view.me.tier2HqLevel
                ? fr.nationSheet.hqTier2
                : fr.nationSheet.hqTier2Locked(view.me.tier2HqLevel)}
            </li>
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * The resource the nation holds no deposit of — beside the power, because it is its
 * counterpart: the ADR 0015 gap is what forces a nation out of its own ground, and the power
 * is what it goes out with. Two nations have none, and one has two: the sentence counts.
 *
 * **Derived, never tabulated.** The deposits held are the ones under the ground the player
 * may build on; the gap is the rest of `DEPOSITS`. A hard-coded table would go on saying
 * "pétrole" the day `generate-deposits.mjs` hands France an oil field — and it would go on
 * saying it after an outpost has won one abroad, which is the same lie in the other
 * direction.
 */
function NationalGap({ regions }: { regions: PlayerView['me']['regions'] }) {
  const held = new Set(regions.map((region) => region.deposit));
  const missing = DEPOSITS.filter((deposit) => !held.has(deposit));

  return (
    <>
      <h2 className="eyebrow mt-5 border-b border-[var(--ink)] pb-[6px]">
        {fr.nationSheet.gapHeader}
      </h2>
      <p
        className="mt-2 text-[13px] leading-[1.5]"
        style={{ color: missing.length === 0 ? 'var(--ink-soft)' : 'var(--ink)' }}
      >
        {missing.length === 0
          ? fr.nationSheet.gapNone
          : fr.nationSheet.gap(missing.map((deposit) => fr.deposits[deposit]))}
      </p>
    </>
  );
}

/**
 * The budget, as a reading rather than a figure. A bar and not "9 / 13": this is the most
 * structuring trade of a season, and a fraction has to be parsed before it is understood.
 *
 * The count comes from the list itself — `buildings.length` — because the view deliberately
 * does not serve it a second time (`view.ts`): two numbers for one fact can disagree.
 */
function BuildingBudget({ taken, cap }: { taken: number; cap: number }) {
  const filled = cap === 0 ? 0 : Math.min(1, taken / cap);
  const free = cap - taken;

  return (
    <section className="mt-4">
      <h2 className="eyebrow flex items-baseline gap-3 border-b border-[var(--ink)] pb-[6px]">
        {fr.nationSheet.budgetHeader}
        <span className="ml-auto font-[var(--font-mono)] text-[12px] normal-case tracking-normal text-[var(--ink)]">
          {fr.nationSheet.budgetTaken(taken, cap)}
        </span>
      </h2>
      <div className="mt-2 h-[10px] w-full border border-[var(--ink)]">
        <div
          className="h-full"
          style={{
            width: `${filled * 100}%`,
            background: free <= 0 ? 'var(--critical)' : 'var(--ink)',
          }}
        />
      </div>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 text-[11.5px] leading-[1.4]">
        <span style={{ color: free <= 0 ? 'var(--critical)' : 'var(--ink-soft)' }}>
          {fr.nationSheet.budgetFree(free)}
        </span>
        <span className="text-[var(--ink-quiet)] italic">{fr.nationSheet.budgetNote}</span>
      </p>
    </section>
  );
}

/**
 * One line, on one line: what I hold, never what I may do with it. Dense on purpose — this is
 * the only reading of the whole estate, and it is used to compare levels, which wants a column
 * that scans rather than a card that reads.
 */
function BuildingRow({ building, regionName }: { building: Building; regionName: string }) {
  return (
    <div className="flex items-center gap-x-[10px] border-b border-[rgba(42,33,24,.16)] py-[5px]">
      <BuildingPlate building={building.key} height={24} />
      <span className="w-[132px] shrink-0 truncate text-[13px] font-semibold text-[var(--ink)]">
        {fr.buildings[building.key]}
      </span>
      <span className="w-[94px] shrink-0 truncate text-[11.5px] text-[var(--ink-soft)]">
        {fr.nationSheet.inRegion(regionName)}
      </span>
      <span className="w-[52px] shrink-0 font-[var(--font-mono)] text-[11.5px] text-[var(--ink)]">
        {fr.nationSheet.level(building.level)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--ink-soft)]">
        {fr.buildingEffects[building.key]}
      </span>
      {building.cappedByHq && (
        <span className="shrink-0 text-[10px] tracking-[.12em] text-[var(--critical)] uppercase">
          {fr.nationSheet.cappedByHq}
        </span>
      )}
    </div>
  );
}
