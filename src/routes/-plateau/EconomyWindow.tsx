import { useMutation } from 'convex/react';
import { useMemo, useState, type ReactNode } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  MAX_HQ_LEVEL,
  REST_WINDOW_MINUTES,
  UPKEEP_UNSUPPLIED_MULTIPLIER,
  chainSpeed,
} from '../../../convex/constants';
import { aBuilding, fr, nationLabel } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { Gauge } from '@/shell/Gauge';
import { useClock } from '@/shell/clock';
import {
  BUILDINGS,
  DEPOSITS,
  type BuildingKey,
  type DepositKey,
  type ResourceKey,
} from '@/domain/ids';
import { PRODUCER_OF } from '@/domain/economy';
import { pledgedOn, placementOf, slotsOn, type Placement } from '@/domain/construction';
import { asDayAndTime, asDuration } from '@/domain/duration';
import type { Building, ChainView, PlayerView, QueuedWork, SiteRef } from '@/domain/player-view';
import { sameSite } from '@/domain/player-view';
import { currentMinutes } from '@/domain/player-view';
import { BuildingPlate, ResourcePlate } from '@/emblems/Plate';
import { conditionText } from './MobilizationCard';
import { FOCUS_MARK, useFocusRow } from './focus';
import { UpgradeControl } from './UpgradeControl';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';

/**
 * **Everything that goes down and everything that flows.** Industry absorbed the nation
 * sheet's census and became Economy: the census serves a decision — *what to raise, what to
 * put down next* — and that decision is taken here, so the census follows it
 * (`ordre-de-mobilisation-et-fenetre-economie.md` §2). The playtest had three windows open in
 * cascade to follow a single placement.
 *
 * **No figure of stock, anywhere.** The reserves panel carries them (top right). This window
 * keeps the *why* — which input is missing, which output spills — never the *how much*.
 *
 * **Nothing is greyed and nothing is hidden.** ADR 0015 wanted the construction screen
 * contextual and grey-free; its revision of 24/08/2026 keeps the contextual panel on the map
 * and replaces the rule here: *rien de caché ne se débloque, rien d'affiché sans sa condition*.
 * A missing link is drawn dotted **with the sentence that would open it** — and that sentence
 * is `placementOf`, the very refusal the server would raise, never a text written twice.
 */
export function EconomyWindow({
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
  // One reading of the placement rule for the whole window: the chart, the projection and the
  // works all ask the same question of the same fifteen keys.
  const placements = useMemo(() => placementsOf(view), [view]);
  const columns = useMemo(() => supplyColumns(view), [view]);

  return (
    <FloatingWindow name="economy" onClose={onClose} {...windowProps} alignment="top" width={920}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <DragHandle className="flex shrink-0 flex-wrap items-baseline gap-x-4 gap-y-2 border-b-2 border-[var(--ink)] px-4 py-[10px]">
          <h2 className="font-(family-name:--font-display) text-[19px] leading-none font-extrabold tracking-[.04em] text-[var(--ink)] uppercase">
            {fr.economy.header}
          </h2>
          <span className="text-[10.5px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
            {fr.economy.subtitle(nationLabel(view.me.nation), view.season.number)}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <RunningWork view={view} token={token} now={now} />

        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          <p className="shrink-0 px-4 py-[9px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)] italic">
            {fr.economy.lead}
          </p>

          <Header note={<ChartLegend />}>{fr.economy.chartHeader}</Header>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-4 py-4 @2xl:grid-cols-3 @4xl:grid-cols-5">
            {columns.map((column) => (
              <SupplyColumn
                key={column.id}
                column={column}
                view={view}
                placements={placements}
                now={now}
              />
            ))}
          </div>

          <Header>{fr.economy.sitesHeader}</Header>
          <UpkeepRow view={view} />
          {CHAIN_KEYS.map((key) => (
            <EstateRows
              key={key}
              building={key}
              view={view}
              token={token}
              now={now}
              focused={focused}
              placement={placements[key]}
            />
          ))}
          {view.me.chains
            .filter((chain) => chain.commanded && chain.level > 0)
            .map((chain) => (
              <LotControl key={chain.by} chain={chain} token={token} now={now} />
            ))}

          <Header>{fr.economy.projectionHeader}</Header>
          {PROJECTION_KEYS.map((key) => (
            <EstateRows
              key={key}
              building={key}
              view={view}
              token={token}
              now={now}
              focused={focused}
              placement={placements[key]}
            />
          ))}

          <Header
            note={
              <SiteBudget
                view={view}
                site={HOME_SITE}
                label={fr.economy.budgetHome}
                relief={true}
              />
            }
          >
            {fr.economy.worksHeader}
          </Header>
          <OutpostBudgets view={view} />
          <Headquarters view={view} token={token} now={now} focused={focused} />
          {WORK_KEYS.map((key) => (
            <EstateRows
              key={key}
              building={key}
              view={view}
              token={token}
              now={now}
              focused={focused}
              placement={placements[key]}
            />
          ))}
          <p className="px-4 pt-2 pb-5 text-[11px] leading-[1.45] text-[var(--ink-quiet)] italic">
            {fr.economy.listeningTemporary}
          </p>
        </div>
      </div>
    </FloatingWindow>
  );
}

/** The seven keys the chart draws — exploitation and transformation, in family order. */
const CHAIN_KEYS: ReadonlyArray<BuildingKey> = [
  'farm',
  'mill',
  'mine',
  'oilWell',
  'foundry',
  'arsenal',
  'quartermaster',
];

/** What arms: the section of the projection. */
const PROJECTION_KEYS: ReadonlyArray<BuildingKey> = ['barracks', 'billets', 'airfield', 'port'];

/** The rest of the census — command, storage, and the listening post until Espionage exists. */
const WORK_KEYS: ReadonlyArray<BuildingKey> = ['warehouse', 'depot', 'listening'];

const placementsOf = (view: PlayerView): Readonly<Record<BuildingKey, Placement>> =>
  Object.fromEntries(BUILDINGS.map((key) => [key, placementOf(view, key)])) as Record<
    BuildingKey,
    Placement
  >;

/**
 * **The construction, at the head and once for the whole window** — then the queue behind it.
 * Written under every line it turned inert, the same twelve words appeared four times over and
 * the most important datum of the surface became background noise. The banner keeps its watching
 * version; this is the acting one — what, where, how much is left, and what comes after.
 *
 * **The head has no cancel button, the queue has one per line.** That is the rule itself, not a
 * choice of layout: a site that started has consumed the queue's time, and giving it back would
 * open a free round trip between matter and time (`troops.cancel` refuses a started batch for
 * the same reason). Behind the head nothing has started, and a full refund costs the game
 * nothing.
 */
function RunningWork({ view, token, now }: { view: PlayerView; token: string; now: number }) {
  const running = view.me.construction;
  const queue = view.me.constructionQueue;
  if (running === null) {
    return (
      <p className="shrink-0 border-b border-[var(--ink)] px-4 py-[9px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
        {fr.economy.constructionNone}
      </p>
    );
  }
  const left = currentMinutes(running.minutesLeft, view.loadedAt, now);

  return (
    <div className="shrink-0 border-b border-[var(--ink)] bg-[rgba(42,33,24,.05)]">
      <div className="flex items-center gap-[14px] px-4 py-3">
        <span className="w-[58px] shrink-0 text-[9.5px] leading-[1.3] tracking-[.18em] text-[var(--ink-soft)] uppercase">
          {fr.economy.constructionHeader}
        </span>
        <BuildingPlate building={running.key} height={30} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-[10px]">
            <span className="text-[16px] font-semibold text-[var(--ink)]">{running.name}</span>
            <span className="text-[13px] text-[var(--ink-soft)]">{running.regionName}</span>
          </div>
          {/* No progress bar: the view serves what is *left*, never how long the site was given,
              and a bar drawn from the first would start empty at every reload. The countdown is
              the whole of what is actually known. */}
          <div className="mt-[4px] font-(family-name:--font-mono) text-[12.5px] text-[var(--ink)]">
            {fr.economy.constructionRemaining(asDuration(left))}
          </div>
        </div>
      </div>
      {queue.length > 0 && <QueuedWorks queue={queue} token={token} />}
    </div>
  );
}

/**
 * The queue, under the head and sober. **No countdown on a waiting line**: nothing behind the
 * head is dated in the database, precisely so a cancellation re-dates nothing — the rank is
 * what is true, a due time would be invented.
 */
function QueuedWorks({ queue, token }: { queue: ReadonlyArray<QueuedWork>; token: string }) {
  const cancel = useMutation(api.constructions.cancel);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="border-t border-[rgba(42,33,24,.28)] px-4 pt-[6px] pb-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[9.5px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
          {fr.economy.queueHeader(queue.length)}
        </span>
        <span className="text-[10px] text-[var(--ink-quiet)] italic">{fr.economy.queuePaid}</span>
      </div>
      {queue.map((entry, index) => (
        <div
          key={entry.id}
          className="flex items-center gap-[10px] border-b border-[rgba(42,33,24,.14)] py-[5px] last:border-0"
        >
          <span className="w-[22px] shrink-0 font-(family-name:--font-mono) text-[11px] text-[var(--ink-quiet)]">
            {fr.economy.queueRank(index + 2)}
          </span>
          <BuildingPlate building={entry.key} height={22} />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink)]">
            {entry.name}{' '}
            <span className="text-[11.5px] text-[var(--ink-soft)]">{entry.regionName}</span>
          </span>
          <span className="shrink-0 font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
            {fr.economy.queueLevel(entry.level)}
          </span>
          <button
            type="button"
            title={fr.economy.queueCancelTitle}
            onClick={() => {
              setError(null);
              cancel({ token, constructionId: entry.id as Id<'constructions'> }).catch(
                (problem: unknown) => handleError(problem, setError),
              );
            }}
            className="shrink-0 cursor-pointer border border-[var(--ink)] px-[7px] py-[2px] text-[9px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--critical)] hover:text-[var(--paper)]"
          >
            {fr.economy.queueCancel}
          </button>
        </div>
      ))}
      {error !== null && <p className="pt-1 text-[11px] text-[var(--critical)]">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------------------

/**
 * One filière, from the ground to what comes out of it. A column is assembled from the served
 * chains and from the two tables the domain already owns — `EXPLOITED_DEPOSITS` says which
 * ground a building works, `PRODUCER_OF` says which building brings a resource into the world.
 * Nothing here is a second list of the economy.
 */
type Column = {
  readonly id: string;
  readonly sources: ReadonlyArray<Source>;
  /** The exploitation buildings that work the deposits above — empty when the input is an
   *  output of another column, as the arsenal's alloy is. */
  readonly extraction: ReadonlyArray<BuildingKey>;
  readonly conversion: ChainView | null;
  readonly output: { readonly resource: ResourceKey; readonly perHour: number };
};

type Source =
  | { readonly kind: 'deposit'; readonly deposit: DepositKey; readonly held: number }
  | { readonly kind: 'chain'; readonly resource: ResourceKey; readonly by: BuildingKey };

function supplyColumns(view: PlayerView): ReadonlyArray<Column> {
  const heldDeposits = (deposit: DepositKey) =>
    view.me.regions.filter((region) => region.deposit === deposit).length;
  const isDeposit = (resource: ResourceKey): resource is DepositKey =>
    (DEPOSITS as ReadonlyArray<string>).includes(resource);

  const chains = view.me.chains.map((chain) => {
    const sources = chain.inputs.map<Source>((input) =>
      isDeposit(input.resource)
        ? { kind: 'deposit', deposit: input.resource, held: heldDeposits(input.resource) }
        : { kind: 'chain', resource: input.resource, by: PRODUCER_OF[input.resource] },
    );
    return {
      id: chain.output,
      sources,
      extraction: [
        ...new Set(
          sources.flatMap((source) =>
            source.kind === 'deposit' ? [PRODUCER_OF[source.deposit]] : [],
          ),
        ),
      ],
      conversion: chain,
      output: { resource: chain.output, perHour: chain.perHour },
    } satisfies Column;
  });

  /** A deposit nothing converts is a filière all the same — it is what the food and the oil of
   *  a nation actually are, and leaving them out would make the chart say the ground is idle. */
  const converted = new Set(view.me.chains.flatMap((chain) => chain.inputs.map((i) => i.resource)));
  const raw = DEPOSITS.filter((deposit) => !converted.has(deposit)).map(
    (deposit) =>
      ({
        id: deposit,
        sources: [{ kind: 'deposit', deposit, held: heldDeposits(deposit) }],
        extraction: [PRODUCER_OF[deposit]],
        conversion: null,
        output: {
          resource: deposit,
          perHour: view.me.extraction
            .filter((site) => site.deposit === deposit)
            .reduce((total, site) => total + site.perHour, 0),
        },
      }) satisfies Column,
  );

  return [...chains, ...raw];
}

function SupplyColumn({
  column,
  view,
  placements,
  now,
}: {
  column: Column;
  view: PlayerView;
  placements: Readonly<Record<BuildingKey, Placement>>;
  now: number;
}) {
  const worked = column.sources.flatMap((source) =>
    source.kind === 'deposit' ? [source.deposit] : [],
  );

  return (
    <div className="flex min-w-0 flex-col">
      {column.sources.map((source, rank) => (
        <SourceBox
          key={source.kind === 'deposit' ? source.deposit : source.resource}
          source={source}
          first={rank === 0}
        />
      ))}
      {column.extraction.map((key) => (
        <StepBox
          key={key}
          building={key}
          state={stateOf(view, key)}
          placement={placements[key]}
          view={view}
          now={now}
          rate={extractionRate(view, key, worked)}
        />
      ))}
      {column.conversion !== null && (
        <ConversionBox
          chain={column.conversion}
          state={stateOf(view, column.conversion.by)}
          placement={placements[column.conversion.by]}
          view={view}
          now={now}
        />
      )}
      <Connector dotted />
      <OutputBox column={column} />
    </div>
  );
}

/** How much this exploitation actually pulls out of the deposits this column stands on — the
 *  mine works coal and ore, so the column, not the key, decides what counts. */
const extractionRate = (
  view: PlayerView,
  key: BuildingKey,
  worked: ReadonlyArray<DepositKey>,
): number =>
  view.me.extraction
    .filter((site) => site.key === key && site.deposit !== null && worked.includes(site.deposit))
    .reduce((total, site) => total + site.perHour, 0);

/**
 * The four states of a link. **A raise is not a state**: a foundry standing at level 2 while its
 * level 3 rises is *built*, and drawing it hatched would tell the player the alloy has stopped.
 * The site rows below carry the raise.
 *
 * `queued` exists because the queue is prepaid (25/08): a link the player has already bought and
 * that is waiting its turn is not *missing*, and offering him the sentence that would open it
 * would be the window telling him to buy it twice.
 */
type LinkState =
  | { readonly kind: 'built'; readonly level: number }
  | { readonly kind: 'underway'; readonly minutesLeft: number }
  | { readonly kind: 'queued' }
  | { readonly kind: 'missing' };

function stateOf(view: PlayerView, key: BuildingKey): LinkState {
  const standing = view.me.buildings.filter((building) => building.key === key);
  if (standing.length > 0) {
    return { kind: 'built', level: standing.reduce((total, one) => total + one.level, 0) };
  }
  const work = view.me.construction;
  if (work !== null && work.key === key) return { kind: 'underway', minutesLeft: work.minutesLeft };
  return view.me.constructionQueue.some((entry) => entry.key === key)
    ? { kind: 'queued' }
    : { kind: 'missing' };
}

/** The skins of a box, said once: solid ink for what stands, a hatch for what rises or waits, a
 *  dotted rule for what is not there — the legend at the head of the chart names them. */
const SKIN: Readonly<Record<LinkState['kind'], string>> = {
  built: 'border border-[var(--ink)] bg-[rgba(42,33,24,.06)]',
  underway: 'border border-[var(--ink)] chart-underway',
  queued: 'border border-[var(--ink)] chart-underway',
  missing: 'border border-dashed border-[rgba(42,33,24,.5)]',
};

/**
 * What a link says of itself on its right edge: its real rate once it stands, its countdown while
 * it rises, and the fact that it is bought while it waits. A queued link has **no** due time — it
 * is dated nowhere until it reaches the head — so saying so is the only honest thing to print.
 */
function noteOn(
  state: Exclude<LinkState, { kind: 'missing' }>,
  view: PlayerView,
  now: number,
  rate: number,
): string {
  if (state.kind === 'underway') {
    return asDuration(currentMinutes(state.minutesLeft, view.loadedAt, now));
  }
  return state.kind === 'queued' ? fr.economy.legendQueued : fr.economy.perHour(rate);
}

function ChartLegend() {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--ink-soft)]">
      <span className="flex items-center gap-[4px]">
        <span className="h-[9px] w-[12px] border border-[var(--ink)] bg-[rgba(42,33,24,.06)]" />
        {fr.economy.legendBuilt}
      </span>
      <span className="flex items-center gap-[4px]">
        <span className="chart-underway h-[9px] w-[12px] border border-[var(--ink)]" />
        {fr.economy.legendUnderway}
      </span>
      <span className="flex items-center gap-[4px]">
        <span className="chart-underway h-[9px] w-[12px] border border-dashed border-[var(--ink)]" />
        {fr.economy.legendQueued}
      </span>
      <span className="flex items-center gap-[4px]">
        <span className="h-[9px] w-[12px] border border-dashed border-[rgba(42,33,24,.5)]" />
        {fr.economy.legendMissing}
      </span>
    </span>
  );
}

function Connector({ dotted = false }: { dotted?: boolean }) {
  return (
    <span
      aria-hidden
      className="mx-auto h-[14px] w-px"
      style={{
        background: dotted
          ? 'repeating-linear-gradient(180deg, var(--ink) 0 3px, transparent 3px 6px)'
          : 'var(--ink)',
      }}
    />
  );
}

function BoxLabel({ children, ink = 'var(--ink-soft)' }: { children: string; ink?: string }) {
  return (
    <span className="block text-[9px] tracking-[.18em] uppercase" style={{ color: ink }}>
      {children}
    </span>
  );
}

/**
 * The ground, or the column upstream. A deposit the nation does not hold is the one line of the
 * chart that names an *elsewhere*: it is the ADR 0015 gap, and the honest sentence is the one
 * the nation sheet already uses — what is missing is taken abroad.
 */
function SourceBox({ source, first }: { source: Source; first: boolean }) {
  if (source.kind === 'chain') {
    return (
      <>
        {!first && <Connector />}
        <div className="border border-[var(--ink)] bg-[rgba(42,33,24,.06)] px-[10px] py-[7px]">
          <BoxLabel>{fr.economy.roleUpstream}</BoxLabel>
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-[5px] text-[14px] font-semibold text-[var(--ink)]">
              <ResourcePlate resource={source.resource} height={18} />
              {fr.resources[source.resource]}
            </span>
            <span className="text-[11px] text-[var(--ink-soft)]">
              {fr.economy.fromChain(fr.buildings[source.by])}
            </span>
          </div>
        </div>
        <Connector />
      </>
    );
  }

  const none = source.held === 0;
  return (
    <>
      {!first && <Connector />}
      <div
        className={
          none
            ? 'border border-dashed border-[var(--critical)] bg-[rgba(157,70,56,.08)] px-[10px] py-[7px]'
            : 'border border-[var(--ink)] bg-[var(--ink)] px-[10px] py-[7px]'
        }
      >
        <BoxLabel ink={none ? 'var(--critical)' : 'var(--paper-dim-2)'}>
          {none ? fr.economy.roleDepositNone : fr.economy.roleDeposit}
        </BoxLabel>
        <span
          className="block text-[14px] font-semibold"
          style={{ color: none ? 'var(--ink)' : 'var(--paper)' }}
        >
          {fr.deposits[source.deposit]}
        </span>
        {/* Under the name rather than beside it: the count says a whole sentence now, and a
            sentence in a right-hand column crushes the name it belongs to. */}
        {!none && (
          <p className="mt-[2px] font-(family-name:--font-mono) text-[11px] text-[var(--notable)]">
            {fr.economy.depositHeld(source.held)}
          </p>
        )}
        {none && (
          <p className="mt-[2px] text-[11px] leading-[1.4] text-[var(--ink-soft)]">
            {fr.economy.depositNoneHeld(fr.deposits[source.deposit])}
          </p>
        )}
      </div>
      <Connector dotted={none} />
    </>
  );
}

function StepBox({
  building,
  state,
  placement,
  view,
  now,
  rate,
}: {
  building: BuildingKey;
  state: LinkState;
  placement: Placement;
  view: PlayerView;
  now: number;
  rate: number;
}) {
  return (
    <div className={`${SKIN[state.kind]} px-[10px] py-[7px]`}>
      <BoxLabel>{fr.economy.roleExtraction}</BoxLabel>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="text-[14px] font-semibold"
          style={{ color: state.kind === 'missing' ? 'var(--ink-soft)' : 'var(--ink)' }}
        >
          {fr.buildings[building]}
        </span>
        {state.kind !== 'missing' && (
          <span className="shrink-0 font-(family-name:--font-mono) text-[12px] text-[var(--ink)]">
            {noteOn(state, view, now, rate)}
          </span>
        )}
      </div>
      {state.kind === 'missing' && <ConditionLine placement={placement} />}
    </div>
  );
}

/**
 * The transformation. A built link carries its **real** rate and the settlement's own verdict:
 * a starved foundry printing its nominal is the interface telling the player he is producing
 * when he is not, which is the lie this whole surface exists to stop.
 */
function ConversionBox({
  chain,
  state,
  placement,
  view,
  now,
}: {
  chain: ChainView;
  state: LinkState;
  placement: Placement;
  view: PlayerView;
  now: number;
}) {
  const role =
    state.kind === 'missing'
      ? fr.economy.roleConversionMissing
      : state.kind === 'underway'
        ? fr.economy.roleConversionUnderway
        : state.kind === 'queued'
          ? fr.economy.roleConversionQueued
          : fr.economy.roleConversion;

  return (
    <>
      <Connector dotted={state.kind !== 'built'} />
      <div className={`${SKIN[state.kind]} px-[10px] py-[7px]`}>
        <BoxLabel ink={state.kind === 'missing' ? 'var(--critical)' : 'var(--ink-soft)'}>
          {role}
        </BoxLabel>
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-[14px] font-semibold"
            style={{ color: state.kind === 'missing' ? 'var(--ink-soft)' : 'var(--ink)' }}
          >
            {fr.buildings[chain.by]}
          </span>
          {state.kind !== 'missing' && (
            <span className="font-(family-name:--font-mono) text-[12px] text-[var(--ink)]">
              {noteOn(state, view, now, chain.perHour)}
            </span>
          )}
        </div>
        {state.kind === 'built' && <ChainVerdict chain={chain} />}
        {state.kind === 'missing' && <ConditionLine placement={placement} />}
      </div>
    </>
  );
}

/**
 * `idle` is deliberately the quietest ink of the five. A chain awaiting an order is not a
 * failure — it is the state the commanded-chain rule produces on purpose, and dressing it in
 * the critical ink would put the player back to fixing what is not broken.
 */
const STATE_INK: Readonly<Record<ChainView['state'], string>> = {
  off: 'var(--ink-quiet)',
  idle: 'var(--ink-soft)',
  running: 'var(--valid)',
  starved: 'var(--critical)',
  overflowing: 'var(--notable-paper)',
};

function ChainVerdict({ chain }: { chain: ChainView }) {
  const badge =
    chain.state === 'starved' && chain.missing !== null
      ? fr.economy.starvedOn(fr.resources[chain.missing])
      : fr.economy.chainStates[chain.state];

  return (
    <span
      className="mt-[4px] inline-block border px-[6px] py-[1px] text-[9.5px] tracking-[.14em] uppercase"
      style={{ color: STATE_INK[chain.state], borderColor: STATE_INK[chain.state] }}
    >
      {badge}
    </span>
  );
}

function OutputBox({ column }: { column: Column }) {
  const dry = column.output.perHour <= 0;
  return (
    <div className="border border-dashed border-[rgba(42,33,24,.5)] px-[10px] py-[7px]">
      <BoxLabel>{fr.economy.roleOutput}</BoxLabel>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className="flex items-center gap-[5px] text-[14px] font-semibold"
          style={{ color: dry ? 'var(--ink-soft)' : 'var(--ink)' }}
        >
          <ResourcePlate resource={column.output.resource} height={18} />
          {fr.resources[column.output.resource]}
        </span>
        <span
          className="font-(family-name:--font-mono) text-[12px]"
          style={{ color: dry ? 'var(--critical)' : 'var(--ink)' }}
        >
          {dry ? fr.economy.noRate : fr.economy.perHour(column.output.perHour)}
        </span>
      </div>
    </div>
  );
}

/**
 * The condition, in clear. **Never a text of this window's own**: `placementOf` reads the
 * server's placement refusal, and the foundation debt outranks it — a key the season still
 * owes is not held back by anything, and reading a headquarters level first would send the
 * player raising for a building he is being given.
 */
const conditionOf = (placement: Placement): string =>
  placement.free && placement.condition === null
    ? fr.economy.condition.foundation
    : placement.condition !== null
      ? conditionText(placement.condition)
      : fr.economy.condition.free(placement.regionIds.length);

function ConditionLine({ placement }: { placement: Placement }) {
  const said = conditionOf(placement);

  return (
    <p
      className="mt-[2px] text-[11px] leading-[1.4]"
      style={{ color: placement.free ? 'var(--notable-paper)' : 'var(--ink-soft)' }}
    >
      {said}
    </p>
  );
}

// ---------------------------------------------------------------------------------------
// The census, absorbed
// ---------------------------------------------------------------------------------------

/**
 * One key of the census: every instance standing, each with the ground it stands on and the
 * button that raises it — or, when nothing stands, the single line that says what would open
 * it. **The same sentence as the chart above**, from the same function: a census that refused
 * for one reason while the chart named another would be two rules for one refusal.
 */
function EstateRows({
  building,
  view,
  token,
  now,
  focused,
  placement,
}: {
  building: BuildingKey;
  view: PlayerView;
  token: string;
  now: number;
  focused: string | null;
  placement: Placement;
}) {
  const standing = view.me.buildings.filter((candidate) => candidate.key === building);
  if (standing.length === 0) {
    return (
      <div className="flex items-baseline gap-3 border-b border-[rgba(42,33,24,.16)] px-4 py-[7px] opacity-70">
        <span className="w-[132px] shrink-0 text-[13px] font-semibold text-[var(--ink-soft)]">
          {fr.buildings[building]}
        </span>
        <span className="min-w-0 flex-1 border-b border-dashed border-[rgba(42,33,24,.5)] pb-[2px] text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
          {conditionOf(placement)}
        </span>
      </div>
    );
  }

  return (
    <>
      {standing.map((instance) => (
        <EstateRow
          key={instance.id}
          building={instance}
          region={regionName(view, instance.regionId)}
          view={view}
          token={token}
          now={now}
          focused={focused === instance.id}
        />
      ))}
    </>
  );
}

function EstateRow({
  building,
  region,
  view,
  token,
  now,
  focused,
}: {
  building: Building;
  region: string;
  view: PlayerView;
  token: string;
  now: number;
  focused: boolean;
}) {
  const row = useFocusRow<HTMLDivElement>(focused);
  return (
    <div
      ref={row}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[rgba(42,33,24,.16)] px-4 py-[7px] ${
        focused ? `${FOCUS_MARK} pl-2` : ''
      }`}
    >
      <BuildingPlate building={building.key} height={28} />
      <span className="w-[122px] shrink-0 truncate text-[13px] font-semibold text-[var(--ink)]">
        {fr.buildings[building.key]}
      </span>
      <span className="w-[100px] shrink-0 truncate text-[11.5px] text-[var(--ink-soft)]">
        {fr.economy.inRegion(region)}
      </span>
      <span className="w-[68px] shrink-0 font-(family-name:--font-mono) text-[11.5px] text-[var(--ink)]">
        {fr.economy.level(building.level)}
      </span>
      <span className="min-w-[160px] flex-1 truncate text-[11.5px] text-[var(--ink-soft)]">
        {building.key === 'listening'
          ? fr.economy.listeningUnfigured
          : fr.buildingEffects[building.key]}
      </span>
      {building.cappedByHq && (
        <span className="shrink-0 text-[10px] tracking-[.12em] text-[var(--critical)] uppercase">
          {fr.economy.cappedByHq}
        </span>
      )}
      <UpgradeControl building={building} view={view} token={token} now={now} />
    </div>
  );
}

/**
 * The headquarters and what it carries. It left the nation sheet with the rest of the census,
 * for the same reason and with its button: the sheet reads, this window acts. Nothing here is a
 * second implementation of a rule — the ceiling and the slots arrive served, the chain speed and
 * the tier-2 gate are read from `constants.ts` itself.
 */
function Headquarters({
  view,
  token,
  now,
  focused,
}: {
  view: PlayerView;
  token: string;
  now: number;
  focused: string | null;
}) {
  const hq = view.me.buildings.find((building) => building.key === 'hq') ?? null;
  const block = useFocusRow<HTMLDivElement>(hq !== null && focused === hq.id);
  const level = view.me.hqLevel;

  if (hq === null) {
    return (
      <p className="border-b border-[rgba(42,33,24,.16)] px-4 py-[9px] text-[12.5px] leading-[1.5] text-[var(--critical)]">
        {fr.economy.hqMissing}
      </p>
    );
  }

  return (
    <div
      ref={block}
      className={`border-b border-[rgba(42,33,24,.16)] px-4 py-[9px] ${
        hq.id === focused ? `${FOCUS_MARK} pl-2` : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <BuildingPlate building="hq" height={36} />
        <span className="text-[13px] font-semibold text-[var(--ink)]">{fr.buildings.hq}</span>
        <span className="font-(family-name:--font-mono) text-[12px] text-[var(--ink)]">
          {fr.economy.hqLevelLine(level, MAX_HQ_LEVEL)}
        </span>
        <span className="ml-auto">
          <UpgradeControl building={hq} view={view} token={token} now={now} />
        </span>
      </div>
      <p className="mt-[6px] text-[10px] tracking-[.16em] text-[var(--ink-quiet)] uppercase">
        {fr.economy.hqCarriesHeader}
      </p>
      <ul className="mt-[2px] flex flex-wrap gap-x-4 gap-y-[2px] text-[12px] text-[var(--ink-soft)]">
        <li>{fr.economy.hqSlots(view.me.slots.total)}</li>
        {/* Ce que le niveau porte vraiment depuis l'ADR 0020 §10 : les emplacements du sol
            national, et non un plafond de bâtiments. Le nombre est servi, jamais recalculé. */}
        <li>
          {fr.economy.hqPlacements(
            view.me.siteSlots.find((budget) => sameSite(budget.site, HOME_SITE))?.total ?? 0,
          )}
        </li>
        <li>{fr.economy.hqChainSpeed(chainSpeed(level).toFixed(2))}</li>
        <li>
          {level >= view.me.tier2HqLevel
            ? fr.economy.hqTier2
            : fr.economy.hqTier2Locked(view.me.tier2HqLevel)}
        </li>
      </ul>
    </div>
  );
}

/**
 * The budget of **one site**, as a reading rather than a figure. A bar and not "9 / 13": this is
 * the most structuring trade of a season, and a fraction has to be parsed before it is
 * understood.
 *
 * There is no national total any more (ADR 0020 §10): a full home ground holds nothing back at
 * an outpost, and one bar for both would say the opposite of the rule. The count comes served
 * for what stands and is completed by the prepaid queue (`slotsOn`) — the view deliberately
 * serves the standing half only, because two servings of one fact disagree.
 */
function SiteBudget({
  view,
  site,
  label,
  relief,
}: {
  view: PlayerView;
  site: SiteRef;
  label: string;
  relief: boolean;
}) {
  const held = view.me.siteSlots.find((budget) => sameSite(budget.site, site));
  const total = held?.total ?? 0;
  const taken = slotsOn(view, site).taken;
  const pledged = pledgedOn(view, site);
  const filled = total === 0 ? 0 : Math.min(1, taken / total);
  const free = total - taken;

  /**
   * **Le site plein dit son remède** (25/08). Annoncé quand il mord ou quand la file l'a entamé
   * — pas avant : une ligne permanente sur la décision la plus structurante de la saison redevient
   * du bruit de fond, et c'est la faute que le chantier en tête a déjà coûtée une fois.
   *
   * Les deux nombres arrivent servis (`me.homeSlotRelief`) : `homeSlots` est lu une fois, côté
   * serveur, par la phrase et par le refus qui la motive. Un avant-poste n'en a pas — ce qui
   * l'élargit est son propre niveau, et rien ne le monte encore.
   */
  const said =
    free > 0 && pledged === 0
      ? null
      : !relief
        ? fr.economy.budgetRaiseOutpost
        : view.me.homeSlotRelief === null
          ? fr.economy.budgetAtCeiling
          : fr.economy.budgetRelief(view.me.homeSlotRelief);

  return (
    <span className="flex min-w-[220px] flex-col items-end gap-[2px]">
      <span className="flex items-center gap-2">
        <span className="text-[10px] tracking-[.14em] text-[var(--ink-quiet)] uppercase">
          {label}
        </span>
        <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink)]">
          {fr.economy.budgetTaken(taken, total)}
        </span>
        <span className="h-[8px] w-[70px] border border-[var(--ink)]">
          <span
            className="block h-full"
            style={{
              width: `${filled * 100}%`,
              background: free <= 0 ? 'var(--critical)' : 'var(--ink)',
            }}
          />
        </span>
        <span
          className="text-[11px] normal-case"
          style={{ color: free <= 0 ? 'var(--critical)' : 'var(--ink-soft)' }}
        >
          {fr.economy.budgetFree(free)}
        </span>
      </span>
      {said !== null && (
        <span className="text-[10px] normal-case text-[var(--ink-quiet)]">{said}</span>
      )}
    </span>
  );
}

/** One line per outpost, under the works header. A point is a site like the home ground, and
 *  what it carries is its level — which is what makes raising one a legible decision. */
function OutpostBudgets({ view }: { view: PlayerView }) {
  if (view.me.outposts.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-[2px] border-b border-[rgba(42,33,24,.16)] px-4 py-[7px]">
      {view.me.outposts.map((outpost, rank) => (
        <SiteBudget
          key={outpost.id}
          view={view}
          site={{ outpostId: outpost.id }}
          label={fr.economy.budgetOutpost(rank + 1, outpost.level)}
          relief={false}
        />
      ))}
    </div>
  );
}

/** National soil, as the view names it: the one site nobody founds. */
const HOME_SITE: SiteRef = { outpostId: null };

const regionName = (view: PlayerView, regionId: string): string =>
  view.me.regions.find((region) => region.id === regionId)?.name ?? regionId;

function Header({ children, note }: { children: string; note?: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-y border-[rgba(42,33,24,.35)] bg-[var(--paper)] px-4 py-[5px]">
      <span className="eyebrow">{children}</span>
      {note !== undefined && <span className="ml-auto">{note}</span>}
    </div>
  );
}

/**
 * **What the army eats, beside what the nation makes.** The food rate served on the strip is
 * already net of it (`economyOf`), so this row adds no figure of its own: it says how many
 * troops, how much they take, and how many of them stand where nobody feeds them — the three
 * halves of a number the player otherwise reads as one and cannot explain.
 */
function UpkeepRow({ view }: { view: PlayerView }) {
  const { troops, unsupplied, foodPerHour, outposts, outpostFoodPerHour, outpostCoalPerHour } =
    view.me.upkeep;
  if (troops === 0 && outposts === 0) return null;

  return (
    <div className="flex flex-col gap-[3px] border-b border-[rgba(42,33,24,.35)] px-4 py-[9px]">
      {/* **Deux lignes, deux remèdes opposés** : l'armée se nourrit ou rentre, l'empire se
          replie. Un seul chiffre ne dirait ni l'un ni l'autre (ADR 0020 §10). */}
      {outposts > 0 && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] text-[var(--ink)]">
            {fr.economy.upkeepOutposts(outposts)}
          </span>
          <span className="font-(family-name:--font-mono) text-[12px] text-[var(--critical)]">
            {fr.economy.upkeepOutpostDrain(outpostFoodPerHour, outpostCoalPerHour)}
          </span>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-[var(--ink)]">{fr.economy.upkeepTroops(troops)}</span>
        <span className="font-(family-name:--font-mono) text-[12px] text-[var(--critical)]">
          {fr.economy.upkeepDrain(foodPerHour)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-[var(--ink-quiet)] italic">
          {unsupplied === 0
            ? fr.economy.upkeepAllSupplied
            : fr.economy.upkeepUnsupplied(unsupplied, UPKEEP_UNSUPPLIED_MULTIPLIER)}
        </span>
        <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
          {fr.economy.upkeepBalance(view.me.resources.food.ratePerHour)}
        </span>
      </div>
      {view.me.starving ? (
        <p className="pt-1 text-[11px] leading-[1.45] text-[var(--critical)] italic">
          {fr.economy.upkeepStarving}
        </p>
      ) : null}
    </div>
  );
}

/**
 * **A chain that eats a matter spent elsewhere waits to be told how much.** The arsenal turned
 * alloy into ammunition three an hour per level, forever, with no way to stop it: a player
 * saving 430 alloy for a carrier lost 216 a day to it, and no screen ever said so. The lot
 * fixes it without adding a knob — exactly this many units, once, then silence.
 *
 * **There is deliberately no rate control.** The rate belongs to the building's level; a slider
 * on it would only ever let a player slow his own works down. The quantity is the decision, and
 * the duration is the answer he is actually after: it says whether the lot covers a night.
 */
function LotControl({ chain, token, now }: { chain: ChainView; token: string; now: number }) {
  const place = useMutation(api.industry.order);
  const drop = useMutation(api.industry.cancelOrder);
  const [error, setError] = useState<string | null>(null);
  const [sizing, setSizing] = useState(false);
  const [asked, setAsked] = useState<number | null>(null);

  const input = chain.inputs[0];
  if (input === undefined) return null;

  const { order, maxOrder } = chain;
  const running = order !== null && order.produced < order.ordered;
  const delivered = order !== null && order.produced >= order.ordered;
  const inputLabel = fr.resources[input.resource];
  const outputLabel = fr.resources[chain.output];

  // Half the reserve is a lot a player can place without arithmetic, and leaves him the other
  // half for his buildings — the point of commanding the chain in the first place.
  const wanted = Math.max(0, Math.min(asked ?? Math.floor(maxOrder / 2), maxOrder));
  const hours = chain.nominalPerHour > 0 ? wanted / chain.nominalPerHour : 0;
  const coversNight = hours * 60 >= REST_WINDOW_MINUTES;

  /**
   * A lot in flight is dated at the rate it will actually hold. `perHour` is the settled rate
   * over the next hour, and the end of a lot clamps it — three left on a line that does three
   * an hour reads one an hour, and the countdown would triple. A running line runs at nominal;
   * only a throttled one is dated by what it managed.
   */
  const rate = chain.state === 'running' ? chain.nominalPerHour : chain.perHour;
  const owed = order === null ? 0 : order.ordered - order.produced;

  const send = (action: Promise<unknown>) => {
    setError(null);
    void action
      .then(() => setSizing(false))
      .catch((problem: unknown) => handleError(problem, setError));
  };

  return (
    <div className="border-b border-[rgba(42,33,24,.28)] bg-[rgba(42,33,24,.035)] px-4 py-[10px]">
      <p className="mb-[6px] text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
        {fr.buildings[chain.by]} — {fr.economy.lot.commandsItself}
      </p>
      {running ? (
        <>
          <Gauge filled={order.produced / order.ordered} height={12} />
          <div className="mt-[7px] flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
            <span className="text-[var(--ink)]">
              {fr.economy.lot.progress(order.produced, order.ordered, outputLabel)}
            </span>
            <span className="font-(family-name:--font-mono) text-[var(--ink-soft)]">
              {rate > 0
                ? fr.economy.lot.remaining(asDuration((owed / rate) * 60))
                : fr.economy.lot.remainingUnknown}
            </span>
            {rate > 0 && (
              <span className="font-(family-name:--font-mono) text-[var(--ink-soft)]">
                {fr.economy.lot.endsAt(asDayAndTime(now + (owed / rate) * 3_600_000))}
              </span>
            )}
            <button
              type="button"
              onClick={() => send(drop({ token, chain: chain.by }))}
              className="ml-auto cursor-pointer border border-[var(--critical)] px-[11px] py-[5px] text-[9px] tracking-[.16em] text-[var(--critical)] uppercase hover:bg-[var(--critical)] hover:text-[var(--paper)]"
            >
              {fr.economy.lot.cancel}
            </button>
          </div>
          <p className="mt-[6px] max-w-[70ch] text-[11px] leading-[1.45] text-[var(--ink-soft)]">
            {fr.economy.lot.cancelNote}
          </p>
        </>
      ) : sizing ? (
        <>
          <input
            type="range"
            min={0}
            max={Math.max(1, maxOrder)}
            step={1}
            value={wanted}
            disabled={maxOrder <= 0}
            onChange={(event) => setAsked(Number(event.target.value))}
            className="w-full cursor-pointer accent-[var(--ink)]"
          />
          <div className="mt-[6px] flex flex-wrap items-baseline gap-x-3">
            <span className="font-(family-name:--font-display) text-[28px] leading-none font-extrabold text-[var(--ink)]">
              {wanted}
            </span>
            <span className="text-[12.5px] text-[var(--ink-soft)]">{outputLabel}</span>
            <span className="ml-auto text-[11.5px] text-[var(--ink-soft)]">
              {fr.economy.lot.maxOf(maxOrder, inputLabel)}
            </span>
          </div>

          <div className="mt-[10px] flex flex-wrap items-stretch border-y border-[var(--ink)]">
            <Reading label={fr.economy.lot.costs}>
              {fr.economy.lot.costOf(wanted * input.quantity, inputLabel)}
            </Reading>
            <Reading label={fr.economy.lot.duration}>{asDuration(hours * 60)}</Reading>
            <Reading label={fr.economy.lot.ends}>
              {wanted === 0 ? fr.common.dash : asDayAndTime(now + hours * 3_600_000)}
            </Reading>
            <Reading
              label={fr.economy.lot.coversNight}
              ink={coversNight ? 'var(--ink)' : 'var(--critical)'}
            >
              {wanted === 0
                ? fr.economy.lot.coversNone
                : coversNight
                  ? fr.economy.lot.coversYes
                  : fr.economy.lot.coversNo(asDuration(hours * 60))}
            </Reading>
          </div>

          <div className="mt-[10px] flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={wanted <= 0}
              onClick={() => send(place({ token, chain: chain.by, quantity: wanted }))}
              className="cursor-pointer bg-[var(--ink)] px-[15px] py-[8px] text-[9px] tracking-[.18em] text-[var(--paper)] uppercase disabled:cursor-not-allowed disabled:opacity-35"
            >
              {fr.economy.lot.launch}
            </button>
            <button
              type="button"
              onClick={() => setSizing(false)}
              className="cursor-pointer border border-[var(--ink)] px-[11px] py-[6px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.economy.lot.close}
            </button>
            <span className="max-w-[46ch] text-[11px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.economy.lot.once}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {delivered && (
            <>
              <span className="border border-[var(--ink)] px-[7px] py-[2px] text-[10px] tracking-[.14em] text-[var(--ink)] uppercase">
                {fr.economy.lot.done}
              </span>
              <span className="text-[12.5px] font-semibold text-[var(--ink)]">
                {fr.economy.lot.delivered(order.ordered, outputLabel)}
              </span>
            </>
          )}
          <span className="text-[12px] text-[var(--ink-soft)]">
            {maxOrder <= 0
              ? fr.economy.lot.impossible(inputLabel)
              : delivered
                ? fr.economy.lot.doneNote(fr.buildings[chain.by], inputLabel)
                : fr.economy.lot.keepsAvailable(inputLabel)}
          </span>
          {maxOrder > 0 ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSizing(true);
              }}
              className="ml-auto cursor-pointer bg-[var(--ink)] px-[15px] py-[8px] text-[9px] tracking-[.18em] text-[var(--paper)] uppercase"
            >
              {fr.economy.lot.order}
            </button>
          ) : (
            <span className="ml-auto max-w-[46ch] text-right text-[11px] leading-[1.45] text-[var(--critical)]">
              {fr.economy.lot.bottleneck(aBuilding(PRODUCER_OF[input.resource]), inputLabel)}
            </span>
          )}
        </div>
      )}
      {error !== null && <p className="mt-[6px] text-[11.5px] text-[var(--critical)]">{error}</p>}
    </div>
  );
}

/** One cell of the lot's readout — the four figures the player weighs before committing. */
function Reading({
  label,
  ink = 'var(--ink)',
  children,
}: {
  label: string;
  ink?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-[110px] flex-1 border-l border-[rgba(42,33,24,.3)] py-[9px] pl-3 first:border-l-0 first:pl-0">
      <div className="eyebrow">{label}</div>
      <div className="mt-[3px] font-(family-name:--font-mono) text-[14px]" style={{ color: ink }}>
        {children}
      </div>
    </div>
  );
}
