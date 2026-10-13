import { useMutation } from 'convex/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { Stamp } from '@/shell/Stamp';
import { useClock } from '@/shell/clock';
import { useNarrowScreen } from '@/shell/viewport';
import {
  BUILDINGS,
  DEPOSITS,
  isOutpostWork,
  type BuildingKey,
  type DepositKey,
  type ResourceKey,
} from '@/domain/ids';
import { PRODUCER_OF } from '@/domain/economy';
import { unlinkedProducers } from '@/domain/next-actions';
import { pledgedOn, placementOf, slotsOn, type Placement } from '@/domain/construction';
import { asDayAndTime, asDuration } from '@/domain/duration';
import type { Building, ChainView, PlayerView, QueuedWork, SiteRef } from '@/domain/player-view';
import { sameSite } from '@/domain/player-view';
import { currentMinutes, lotFinishesAt } from '@/domain/player-view';
import { BuildingPlate, ResourcePlate } from '@/emblems/Plate';
import { conditionText } from './FoundationRows';
import { FOCUS_MARK, useFocusRow } from './focus';
import { UpgradeControl } from './UpgradeControl';
import { RaiseControl, type Queued } from './RaiseControl';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';
import { HelpMark } from './HelpMark';
import type { Seat } from '@/data/session';

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
 *
 * **The plate reads as a page, not as a stack of sections** (planches du 01/09) : the masthead
 * carries the one budget that governs the season, the works band carries the one countdown,
 * the chart runs the eight filières side by side, and the headquarters — the thing every
 * ceiling of this window points back to — stands in its own column on the right rather than
 * buried a scroll below the chart it explains.
 */
export function EconomyWindow({
  view,
  seat,
  focused,
  onClose,
  onRaiseOutpost,
  ...windowProps
}: WindowProps & {
  view: PlayerView;
  seat: Seat;
  /** The building whose line the window was opened on, `null` when it was opened bare. */
  focused: string | null;
  /** **Le remède d'un point plein mène à sa porte** (précision du 15/09) : la fenêtre se ferme
   *  et le panneau du point s'ouvre, où l'élévation se commande. */
  onRaiseOutpost: (outpostId: string) => void;
}) {
  const narrow = useNarrowScreen();
  const now = useClock();
  // One reading of the placement rule for the whole window: the chart, the projection and the
  // works all ask the same question of the same fifteen keys.
  const placements = useMemo(() => placementsOf(view), [view]);
  const columns = useMemo(() => supplyColumns(view), [view]);
  /** **Le remède d'un point plein mène à sa porte** : la fenêtre se ferme, le panneau s'ouvre. */
  const raiseOutpost = (outpostId: string) => {
    onClose();
    onRaiseOutpost(outpostId);
  };

  if (narrow)
    return (
      <FloatingWindow name="economy" onClose={onClose} {...windowProps} width={1280}>
        <WorksSheet
          view={view}
          seat={seat}
          now={now}
          focused={focused}
          placements={placements}
          columns={columns}
          onRaiseOutpost={raiseOutpost}
          onClose={onClose}
        />
      </FloatingWindow>
    );

  return (
    <FloatingWindow name="economy" onClose={onClose} {...windowProps} alignment="top" width={1280}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <DragHandle className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-[var(--ink)] px-4 py-[10px]">
          <h2 className="font-(family-name:--font-display) text-[26px] leading-none font-bold text-[var(--ink)] first-letter:uppercase">
            {fr.economy.header}
          </h2>
          <span className="eyebrow">
            {fr.economy.subtitle(nationLabel(view.me.nation), view.season.number)}
          </span>
          <span className="flex-1" />
          {/* L'arbitrage le plus structurant de la saison (ADR 0020 §10) monte au bandeau-titre :
              plus bas, il se lisait après la décision qu'il gouverne. */}
          <SiteBudget view={view} site={HOME_SITE} label={fr.economy.budgetHome} relief={true} />
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <RunningWork view={view} seat={seat} now={now} />

        {/* Deux colonnes côte à côte tant qu'il y a de la place ; l'une sous l'autre sous le
            seuil, et **un seul défileur** alors — imbriqués, la colonne du QG prenait toute la
            largeur et la filière se lisait dans vingt pixels (`md` = le seuil de
            `shell/viewport.ts`). */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto md:flex-row md:items-stretch md:overflow-visible">
          <div className="flex min-h-0 min-w-0 shrink-0 flex-col md:flex-1 md:shrink md:overflow-auto">
            <Header
              note={
                <div className="flex items-center gap-3">
                  <ChartLegend />
                  <HelpMark>{fr.economy.lead}</HelpMark>
                </div>
              }
            >
              {fr.economy.chartHeader}
            </Header>
            <div className="grid shrink-0 grid-cols-2 gap-x-[7px] gap-y-5 px-4 py-4 @xl:grid-cols-4 @5xl:grid-cols-8">
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

            {view.me.chains
              .filter((chain) => chain.commanded && chain.level > 0)
              .map((chain) => (
                <LotControl
                  key={chain.by}
                  chain={chain}
                  seat={seat}
                  loadedAt={view.loadedAt}
                  now={now}
                  observing={view.me.defeated}
                />
              ))}

            <CensusSection
              title={fr.economy.sitesHeader}
              keys={CHAIN_KEYS}
              view={view}
              seat={seat}
              now={now}
              focused={focused}
            />
            <CensusSection
              title={fr.economy.projectionHeader}
              keys={PROJECTION_KEYS}
              view={view}
              seat={seat}
              now={now}
              focused={focused}
            />
            <CensusSection
              title={fr.economy.worksHeader}
              keys={WORK_KEYS}
              view={view}
              seat={seat}
              now={now}
              focused={focused}
            />

            <AbsentKeys view={view} placements={placements} />

            <UpkeepFoot view={view} />
          </div>

          <HeadquartersColumn
            view={view}
            seat={seat}
            now={now}
            focused={focused}
            onRaiseOutpost={raiseOutpost}
          />
        </div>
      </div>
    </FloatingWindow>
  );
}

const EXTRACTION_KEYS: ReadonlyArray<BuildingKey> = ['farm', 'mill', 'mine', 'oilWell'];

const TRANSFORMATION_KEYS: ReadonlyArray<BuildingKey> = ['foundry', 'arsenal', 'quartermaster'];

/** The seven keys the chart draws — exploitation and transformation, in family order. */
const CHAIN_KEYS: ReadonlyArray<BuildingKey> = [...EXTRACTION_KEYS, ...TRANSFORMATION_KEYS];

/** What arms: the section of the projection. */
const PROJECTION_KEYS: ReadonlyArray<BuildingKey> = ['barracks', 'billets', 'airfield', 'port'];

/** The rest of the census — command, storage, and the listening post until Espionage exists. */
const WORK_KEYS: ReadonlyArray<BuildingKey> = ['warehouse', 'listening'];

/** The census in reading order, which is also the order the absent keys are gathered in. */
const CENSUS_KEYS: ReadonlyArray<BuildingKey> = [...CHAIN_KEYS, ...PROJECTION_KEYS, ...WORK_KEYS];

const placementsOf = (view: PlayerView): Readonly<Record<BuildingKey, Placement>> =>
  Object.fromEntries(BUILDINGS.map((key) => [key, placementOf(view, key)])) as Record<
    BuildingKey,
    Placement
  >;

/**
 * **The construction, at the head and once for the whole window** — then the queue beside it.
 * Written under every line it turned inert, the same twelve words appeared four times over and
 * the most important datum of the surface became background noise. The banner keeps its watching
 * version; this is the acting one — what, where, how much is left, and what comes after.
 *
 * **The queue sits to its right, not under it.** The countdown is the P1 of the surface and a
 * list stacked below it pushed it up into the masthead's shadow; side by side, the one figure
 * that is dated and the ranks that are not read as two different things, which they are.
 *
 * **The head has no cancel button, the queue has one per line.** That is the rule itself, not a
 * choice of layout: a site that started has consumed the queue's time, and giving it back would
 * open a free round trip between matter and time (`troops.cancel` refuses a started batch for
 * the same reason). Behind the head nothing has started, and a full refund costs the game
 * nothing.
 */
function RunningWork({ view, seat, now }: { view: PlayerView; seat: Seat; now: number }) {
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
    <div className="flex shrink-0 flex-wrap items-stretch border-b-2 border-[var(--ink)] bg-(--ink)/5">
      <div className="flex min-w-[380px] flex-1 items-center gap-[14px] px-4 py-3">
        {/* Une élévation d'avant-poste n'a pas de planche : ce n'est pas un bâtiment, et lui en
            prêter une le rangerait dans une famille où il n'est pas (précision du 15/09). */}
        {isOutpostWork(running.key) ? null : <BuildingPlate building={running.key} height={38} />}
        <div className="min-w-0 flex-1">
          <span className="eyebrow block">{fr.economy.constructionHeader}</span>
          <div className="mt-[3px] flex flex-wrap items-baseline gap-x-[10px]">
            <span className="font-(family-name:--font-display) text-[20px] leading-tight font-extrabold text-[var(--ink)]">
              {running.name}
            </span>
            <span className="text-[13px] text-[var(--ink-soft)]">
              {fr.economy.inRegion(running.regionName)}
            </span>
          </div>
        </div>
        {/* No progress bar: the view serves what is *left*, never how long the site was given,
            and a bar drawn from the first would start empty at every reload. The countdown is
            the whole of what is actually known — and it is the one figure this surface owes. */}
        <span className="shrink-0 font-(family-name:--font-display) text-[28px] leading-none font-extrabold whitespace-nowrap text-[var(--ink)]">
          {fr.economy.constructionRemaining(asDuration(left))}
        </span>
      </div>
      {queue.length > 0 && (
        <div className="min-w-[300px] flex-1 border-l border-(color:--ink)/35">
          <QueuedWorks queue={queue} seat={seat} observing={view.me.defeated} />
        </div>
      )}
    </div>
  );
}

/**
 * The queue, beside the head and sober. **No countdown on a waiting line**: nothing behind the
 * head is dated in the database, precisely so a cancellation re-dates nothing — the rank is
 * what is true, a due time would be invented.
 */
function QueuedWorks({
  queue,
  seat,
  observing,
}: {
  queue: ReadonlyArray<QueuedWork>;
  seat: Seat;
  /** Un observateur lit sa file — elle continue de se bâtir — et n'en retire plus rien. */
  observing: boolean;
}) {
  const { cancel, error } = useQueueCancel(seat);

  return (
    <div className="px-4 pt-[8px] pb-2">
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">{fr.economy.queueHeader(queue.length)}</span>
        <span className="text-[10px] text-[var(--ink-quiet)] italic">{fr.economy.queuePaid}</span>
      </div>
      {queue.map((entry, index) => (
        <div
          key={entry.id}
          className="flex items-center gap-[10px] border-b border-(color:--ink)/14 py-[5px] last:border-0"
        >
          <span className="w-[22px] shrink-0 font-(family-name:--font-mono) text-[11px] text-[var(--ink-quiet)]">
            {fr.economy.queueRank(index + 2)}
          </span>
          {isOutpostWork(entry.key) ? null : <BuildingPlate building={entry.key} height={22} />}
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink)]">
            {entry.name}{' '}
            <span className="text-[11.5px] text-[var(--ink-soft)]">{entry.regionName}</span>
          </span>
          <span className="shrink-0 font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
            {fr.economy.queueLevel(entry.level)}
          </span>
          {!observing && (
            <button
              type="button"
              title={fr.economy.queueCancelTitle}
              onClick={() => cancel(entry.id)}
              className="shrink-0 cursor-pointer border border-[var(--ink)] px-[7px] py-[2px] text-[9px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--critical)] hover:text-[var(--paper)]"
            >
              {fr.economy.queueCancel}
            </button>
          )}
        </div>
      ))}
      {error !== null && <p className="pt-1 text-[11px] text-[var(--critical)]">{error}</p>}
    </div>
  );
}

/**
 * **Retirer une entrée de la file, et la rembourser** : ce qui n'a pas commencé n'a rien coûté au
 * jeu. Le refus n'a qu'un cas — l'entrée est passée en tête entre-temps — et il se dit sous la
 * ligne.
 */
function useQueueCancel(seat: Seat) {
  const drop = useMutation(api.constructions.cancel);
  const [error, setError] = useState<string | null>(null);
  const cancel = (constructionId: string, then?: () => void) => {
    setError(null);
    drop({ ...seat, constructionId: constructionId as Id<'constructions'> }).then(
      then,
      (problem: unknown) => handleError(problem, setError),
    );
  };
  return { cancel, error };
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
export type Column = {
  readonly id: string;
  readonly sources: ReadonlyArray<Source>;
  /** The exploitation buildings that work the deposits above — empty when the input is an
   *  output of another column, as the arsenal's alloy is. */
  readonly extraction: ReadonlyArray<BuildingKey>;
  readonly conversion: ChainView | null;
  readonly output: { readonly resource: ResourceKey; readonly perHour: number };
};

export type Source =
  | { readonly kind: 'deposit'; readonly deposit: DepositKey; readonly held: number }
  | { readonly kind: 'chain'; readonly resource: ResourceKey; readonly by: BuildingKey };

/**
 * **Every deposit is a filière of its own, converted or not.** The ore a foundry eats is still
 * ore the nation pulls out and spends on its buildings: folding its column into the alloy's
 * hid the only place the mine's real rate was ever printed. The ground first, in the domain's
 * own order, then the three transformations — the page reads left to right from what is dug
 * to what is made.
 */
function supplyColumns(view: PlayerView): ReadonlyArray<Column> {
  const heldDeposits = (deposit: DepositKey) =>
    view.me.regions.filter((region) => region.deposit === deposit).length;
  const isDeposit = (resource: ResourceKey): resource is DepositKey =>
    (DEPOSITS as ReadonlyArray<string>).includes(resource);

  const raw = DEPOSITS.map(
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

  return [...raw, ...chains];
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
      <ColumnHead
        column={column}
        cut={isCut(view, column, worked)}
        raw={rawVerdictOf(view, column)}
      />
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

/**
 * The head of a filière: the one badge and the one figure the surface promises at a glance
 * (contrat 02, P1). **A raw column carries no state of its own** — `chains[].state` exists for the
 * three conversions and nowhere else, and stamping "tourne" on a mine would invent a settlement
 * the server never ran; at zero it says what is missing, or « à sec » (`rawVerdictOf`). The name
 * of the resource is not repeated here: the sortie box at the foot of the column is where the
 * filière ends, and the plate identifies the head well enough.
 */
function ColumnHead({ column, cut, raw }: { column: Column; cut: boolean; raw: RawVerdict }) {
  const dry = column.output.perHour <= 0;
  return (
    <div className="mb-[7px] border-b border-[var(--ink)] pb-[5px]">
      {/* Le libellé sur sa propre ligne : à huit colonnes, l'intitulé et le chiffre côte à côte
          se disputent cent pixels et c'est l'intitulé qui se fait couper. */}
      <span className="eyebrow block">{fr.economy.realRate}</span>
      <div className="mt-[3px] flex min-w-0 items-center gap-[5px]">
        <ResourcePlate resource={column.output.resource} height={17} />
        <span
          className="ml-auto shrink-0 font-(family-name:--font-mono) text-[15px] leading-none"
          style={{ color: dry ? 'var(--ink-soft)' : 'var(--ink)' }}
        >
          {fr.economy.perHour(column.output.perHour)}
        </span>
      </div>
      {/* **Une seule alerte par colonne, et c'est ce tampon** (table d'état-major). Le chiffre en
          rouge, la sortie « ne produit rien » et le gisement manquant en rouge disaient trois fois
          la même chose sur la même colonne, et huit colonnes en criaient vingt.
          **Hors réseau passe avant tout** (ADR 0020 §6) : sur une colonne convertie il l'emporte
          sur « à sec » et sur « tourne » — un site coupé n'est pas à sec. Une filière brute n'a
          pas d'état servi : à zéro, elle dit le manque ou « à sec » (`rawVerdictOf`). */}
      {cut ? (
        <StateBadge state="unlinked" label={fr.economy.chainStates.unlinked} />
      ) : column.conversion !== null ? (
        <ChainVerdict chain={column.conversion} />
      ) : (
        raw !== null && (
          <StateBadge
            state={raw === 'dry' ? 'starved' : 'idle'}
            label={
              raw === 'dry'
                ? fr.economy.chainStates.starved
                : raw === 'noDeposit'
                  ? fr.economy.roleDepositNone
                  : fr.economy.legendMissing
            }
          />
        )
      )}
    </div>
  );
}

/**
 * **Ce que dit la tête d'une filière brute à zéro** (décision du 13/10). « À sec » est réservé à
 * une filière qui a de quoi produire et ne produit pas ; une filière à zéro parce que rien n'y est
 * posé — aucun gisement sur son sol, aucun extracteur debout ni en chantier — dit le manque, à
 * l'encre et non en rouge : ce n'est pas une panne, c'est ce qui reste à bâtir. `null` pour une
 * filière qui coule, ou convertie (la chaîne répond d'elle-même).
 */
export type RawVerdict = 'noDeposit' | 'missing' | 'dry' | null;

export function rawVerdictOf(view: PlayerView, column: Column): RawVerdict {
  if (column.conversion !== null || column.output.perHour > 0) return null;
  if (column.sources.every((source) => source.kind === 'deposit' && source.held === 0)) {
    return 'noDeposit';
  }
  return column.extraction.every((key) => stateOf(view, key).kind === 'missing')
    ? 'missing'
    : 'dry';
}

/**
 * **La filière est-elle coupée** (ADR 0020 §6) : elle l'est quand elle a des sites et qu'aucun
 * n'est relié. Un extracteur relié et un autre coupé n'est pas une filière coupée — le débit
 * baisse, il ne s'éteint pas, et le tampon dirait le contraire de ce que le chiffre montre.
 *
 * La conversion répond d'elle-même : son état sort du règlement, jamais d'un second calcul ici.
 */
function isCut(view: PlayerView, column: Column, worked: ReadonlyArray<DepositKey>): boolean {
  if (column.conversion !== null) return column.conversion.state === 'unlinked';
  const sites = view.me.extraction.filter(
    (site) =>
      column.extraction.includes(site.key) &&
      site.deposit !== null &&
      worked.includes(site.deposit),
  );
  return sites.length > 0 && sites.every((site) => !site.linked);
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
  built: 'border border-[var(--ink)] bg-(--ink)/6',
  underway: 'border border-[var(--ink)] chart-underway',
  queued: 'border border-[var(--ink)] chart-underway',
  missing: 'border border-dashed border-(color:--ink)/50',
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
        <span className="h-[9px] w-[12px] border border-[var(--ink)] bg-(--ink)/6" />
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
        <span className="h-[9px] w-[12px] border border-dashed border-(color:--ink)/50" />
        {fr.economy.legendMissing}
      </span>
    </span>
  );
}

function Connector({ dotted = false }: { dotted?: boolean }) {
  return (
    <span
      aria-hidden
      className="mx-auto h-[12px] w-px"
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
    <span className="block text-[9px] tracking-[.14em] uppercase" style={{ color: ink }}>
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
        <div className="border border-[var(--ink)] bg-(--ink)/6 px-[8px] py-[6px]">
          <BoxLabel>{fr.economy.roleUpstream}</BoxLabel>
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
            <span className="flex min-w-0 items-center gap-[5px] text-[13px] font-semibold text-[var(--ink)]">
              <ResourcePlate resource={source.resource} height={17} />
              <span className="min-w-0 leading-[1.25]">{fr.resources[source.resource]}</span>
            </span>
            <span className="text-[10.5px] text-[var(--ink-soft)]">
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
        className={`${none ? SKIN.missing : 'border border-[var(--ink)] bg-[var(--ink)]'} px-[8px] py-[6px]`}
      >
        <BoxLabel ink={none ? 'var(--ink-soft)' : 'var(--paper-dim-2)'}>
          {none ? fr.economy.roleDepositNone : fr.economy.roleDeposit}
        </BoxLabel>
        <span
          className="block text-[13px] font-semibold"
          style={{ color: none ? 'var(--ink)' : 'var(--paper)' }}
        >
          {fr.deposits[source.deposit]}
        </span>
        {/* Under the name rather than beside it: the count says a whole sentence now, and a
            sentence in a right-hand column crushes the name it belongs to. */}
        {!none && (
          <p className="mt-[2px] font-(family-name:--font-mono) text-[10.5px] leading-[1.35] text-[var(--notable)]">
            {fr.economy.depositHeld(source.held)}
          </p>
        )}
        {none && (
          <p className="mt-[2px] text-[10.5px] leading-[1.35] text-[var(--ink-soft)]">
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
    <div className={`${SKIN[state.kind]} px-[8px] py-[6px]`}>
      <BoxLabel>{fr.economy.roleExtraction}</BoxLabel>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
        <span
          className="min-w-0 text-[13px] leading-[1.25] font-semibold"
          style={{ color: state.kind === 'missing' ? 'var(--ink-soft)' : 'var(--ink)' }}
        >
          {fr.buildings[building]}
        </span>
        {state.kind !== 'missing' && (
          <span className="shrink-0 font-(family-name:--font-mono) text-[11.5px] text-[var(--ink)]">
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
      <div className={`${SKIN[state.kind]} px-[8px] py-[6px]`}>
        <BoxLabel>{role}</BoxLabel>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
          <span
            className="min-w-0 text-[13px] leading-[1.25] font-semibold"
            style={{ color: state.kind === 'missing' ? 'var(--ink-soft)' : 'var(--ink)' }}
          >
            {fr.buildings[chain.by]}
          </span>
          {state.kind !== 'missing' && (
            <span className="shrink-0 font-(family-name:--font-mono) text-[11.5px] text-[var(--ink)]">
              {noteOn(state, view, now, chain.perHour)}
            </span>
          )}
        </div>
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
  /** **Hors réseau prend l'encre rouge** : rien n'est cassé sur le site, et pourtant le stock a
   *  cessé de monter sans que le joueur ait rien fait — c'est la définition même de ce qui exige
   *  une décision maintenant (règle 3 du tampon). */
  unlinked: 'var(--critical)',
  idle: 'var(--ink-soft)',
  running: 'var(--valid)',
  starved: 'var(--critical)',
  overflowing: 'var(--notable-paper)',
};

function ChainVerdict({ chain }: { chain: ChainView }) {
  return (
    <StateBadge
      state={chain.state}
      label={
        chain.state === 'starved' && chain.missing !== null
          ? fr.economy.starvedOn(fr.resources[chain.missing])
          : fr.economy.chainStates[chain.state]
      }
    />
  );
}

const StateBadge = ({ state, label }: { state: ChainView['state']; label: string }) => (
  <span
    className="mt-[5px] inline-block border px-[5px] py-[1px] text-[9px] tracking-[.1em] uppercase"
    style={{ color: STATE_INK[state], borderColor: STATE_INK[state] }}
  >
    {label}
  </span>
);

/** La sortie, sans filet pointillé : le pointillé dit « manquant », et une sortie ne manque pas —
 *  elle coule ou elle ne coule pas, et la tête de colonne le dit déjà. */
function OutputBox({ column }: { column: Column }) {
  const dry = column.output.perHour <= 0;
  return (
    <div className="border border-(color:--ink)/25 px-[8px] py-[6px]">
      <BoxLabel>{fr.economy.roleOutput}</BoxLabel>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2">
        <span
          className="flex min-w-0 items-center gap-[5px] text-[13px] font-semibold"
          style={{ color: dry ? 'var(--ink-soft)' : 'var(--ink)' }}
        >
          <ResourcePlate resource={column.output.resource} height={17} />
          <span className="min-w-0 leading-[1.25]">{fr.resources[column.output.resource]}</span>
        </span>
        <span
          className="shrink-0 font-(family-name:--font-mono) text-[11.5px]"
          style={{ color: dry ? 'var(--ink-soft)' : 'var(--ink)' }}
        >
          {fr.economy.perHour(column.output.perHour)}
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
      className="mt-[2px] text-[10.5px] leading-[1.35] hyphens-auto"
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
 * One section of the census: its rule, then every instance standing under it. **A section
 * nothing fills prints nothing at all** — a heading over a void is the surface promising a
 * list it does not have, and the keys it would have named are gathered in the box below with
 * the sentence that would open them.
 */
function CensusSection({
  title,
  keys,
  view,
  seat,
  now,
  focused,
}: {
  title: string;
  keys: ReadonlyArray<BuildingKey>;
  view: PlayerView;
  seat: Seat;
  now: number;
  focused: string | null;
}) {
  const standing = keys.flatMap((key) =>
    view.me.buildings.filter((candidate) => candidate.key === key),
  );
  if (standing.length === 0) return null;

  return (
    <>
      <Header>{title}</Header>
      {standing.map((instance) => (
        <EstateRow
          key={instance.id}
          building={instance}
          region={regionName(view, instance.regionId)}
          view={view}
          seat={seat}
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
  seat,
  now,
  focused,
}: {
  building: Building;
  region: string;
  view: PlayerView;
  seat: Seat;
  now: number;
  focused: boolean;
}) {
  const row = useFocusRow<HTMLDivElement>(focused);
  return (
    <div
      ref={row}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-(color:--ink)/16 px-4 py-[7px] ${
        focused ? `${FOCUS_MARK} pl-2` : ''
      }`}
    >
      <BuildingPlate building={building.key} height={28} />
      <span className="w-[126px] shrink-0 truncate text-[13px] font-semibold text-[var(--ink)]">
        {fr.buildings[building.key]}
      </span>
      {/* Assez large pour « en Alpes-de-Haute-Provence » : un département tronqué en son milieu
          ne désigne plus la région où l'on va cliquer. */}
      <span className="w-[176px] shrink-0 truncate text-[11.5px] text-[var(--ink-soft)]">
        {fr.economy.inRegion(region)}
      </span>
      <span className="w-[62px] shrink-0 font-(family-name:--font-mono) text-[11.5px] text-[var(--ink)]">
        {fr.economy.level(building.level)}
      </span>
      <div className="min-w-[150px] flex-1 text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
        {building.key === 'listening' ? (
          <>
            {fr.economy.listeningUnfigured} <HelpMark>{fr.economy.listeningTemporary}</HelpMark>
          </>
        ) : (
          fr.buildingEffects[building.key]
        )}
      </div>
      {building.cappedByHq && (
        <span className="shrink-0 text-[10px] tracking-[.12em] text-[var(--critical)] uppercase">
          {fr.economy.cappedByHq}
        </span>
      )}
      <UpgradeControl building={building} view={view} seat={seat} now={now} />
    </div>
  );
}

/**
 * **What is not there, in one place.** The same sentence as the chart above and from the same
 * function: a census that refused for one reason while the chart named another would be two
 * rules for one refusal. Gathered rather than scattered, the list is also the shortest reading
 * of what the season still owes — the offered foundations sit at the top of it in notable ink.
 */
function AbsentKeys({
  view,
  placements,
}: {
  view: PlayerView;
  placements: Readonly<Record<BuildingKey, Placement>>;
}) {
  const absent = CENSUS_KEYS.filter(
    (key) => !view.me.buildings.some((building) => building.key === key),
  );
  if (absent.length === 0) return null;

  return (
    <div className="mx-4 mt-3 border border-dashed border-(color:--ink)/50 px-3 py-[9px]">
      <span className="eyebrow">{fr.economy.absentKeys}</span>
      <div className="mt-[5px] grid gap-x-7 gap-y-[5px] @3xl:grid-cols-2">
        {absent.map((key) => (
          <div key={key} className="flex min-w-0 items-baseline gap-2">
            <span className="w-[118px] shrink-0 truncate text-[12.5px] font-semibold text-[var(--ink-soft)]">
              {fr.buildings[key]}
            </span>
            <span
              className="min-w-0 flex-1 text-[11px] leading-[1.4]"
              style={{
                color: placements[key].free ? 'var(--notable-paper)' : 'var(--ink-soft)',
              }}
            >
              {conditionOf(placements[key])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * **The headquarters in its own column.** Every ceiling this window names points back to it —
 * the placements of the home ground, the chain speed, the tier-2 gate — and it spent the last
 * revision buried under the census it explains. Nothing here is a second implementation of a
 * rule: the ceiling and the slots arrive served, the chain speed and the tier-2 gate are read
 * from `constants.ts` itself.
 */
function HeadquartersColumn({
  view,
  seat,
  now,
  focused,
  onRaiseOutpost,
}: {
  onRaiseOutpost: (outpostId: string) => void;
  view: PlayerView;
  seat: Seat;
  now: number;
  focused: string | null;
}) {
  const hq = view.me.buildings.find((building) => building.key === 'hq') ?? null;
  const block = useFocusRow<HTMLDivElement>(hq !== null && focused === hq.id);
  const level = view.me.hqLevel;

  return (
    <div className="flex w-full shrink-0 flex-col border-t-2 border-[var(--ink)] bg-(--ink)/3 md:w-[302px] md:overflow-auto md:border-t-0 md:border-l">
      <div className="sticky top-0 z-10 border-b border-(color:--ink)/35 bg-[var(--paper)] px-4 py-[5px]">
        <span className="eyebrow">{fr.buildings.hq}</span>
      </div>

      {hq === null ? (
        <p className="px-4 py-[9px] text-[12.5px] leading-[1.5] text-[var(--critical)]">
          {fr.economy.hqMissing}
        </p>
      ) : (
        <div
          ref={block}
          className={`px-4 py-[10px] ${hq.id === focused ? `${FOCUS_MARK} pl-2` : ''}`}
        >
          <div className="flex items-center gap-3">
            <BuildingPlate building="hq" height={44} />
            <span className="font-(family-name:--font-display) text-[17px] leading-tight font-extrabold text-[var(--ink)]">
              {fr.economy.hqLevelLine(level, MAX_HQ_LEVEL)}
            </span>
          </div>

          <p className="mt-[10px] text-[10px] tracking-[.16em] text-[var(--ink-quiet)] uppercase">
            {fr.economy.hqCarriesHeader}
          </p>
          <ul className="mt-[3px] flex flex-col gap-[3px] text-[12px] leading-[1.4] text-[var(--ink-soft)]">
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

          {!view.me.defeated && (
            <div className="mt-[10px] border-t border-(color:--ink)/22 pt-[9px]">
              <UpgradeControl building={hq} view={view} seat={seat} now={now} />
            </div>
          )}
        </div>
      )}

      <OutpostBudgets view={view} onRaiseOutpost={onRaiseOutpost} />

      <UnlinkedSites view={view} />
    </div>
  );
}

/**
 * **Ce que la carte a coupé, au pied de la colonne qui porte les plafonds** (ADR 0020 §6). Une
 * ligne, jamais une liste : les sites sont coupés par la même chose — une région qui a changé de
 * couleur — et ce qui se répare est la frontière, pas le bâtiment. La carte « à faire
 * maintenant » mène au premier ; ici on dit seulement combien.
 *
 * **À zéro elle n'existe pas.** Un « 0 site hors réseau » permanent redevient du bruit de fond,
 * et un grisé serait pire encore : il n'y a rien à faire ici, jamais.
 */
function UnlinkedSites({ view }: { view: PlayerView }) {
  const cut = unlinkedProducers(view);
  if (cut.length === 0) return null;

  return (
    <div className="border-t border-(color:--ink)/22 px-4 py-[9px]">
      <Stamp label={fr.stamps.unlinked} tone="critical" size="small" />
      <p className="mt-[5px] text-[11.5px] leading-[1.4] text-[var(--critical)]">
        {fr.economy.unlinkedSites(cut.length)}
      </p>
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
  onRaise = null,
}: {
  view: PlayerView;
  site: SiteRef;
  label: string;
  relief: boolean;
  /** `null` pour le sol national : ce qui l'élargit est le quartier général, qui a sa ligne
   *  ailleurs — seul un avant-poste a une porte à ouvrir ici. */
  onRaise?: (() => void) | null;
}) {
  const { taken, total, free, said } = budgetOf(view, site, relief);
  const filled = total === 0 ? 0 : Math.min(1, taken / total);

  return (
    <span className="flex min-w-[230px] flex-col items-end gap-[2px]">
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
      {said !== null &&
        (onRaise === null ? (
          <span className="max-w-[34ch] text-right text-[10px] leading-[1.35] normal-case text-[var(--ink-quiet)]">
            {said}
          </span>
        ) : (
          /* La phrase promettait un geste ; depuis le 15/09 il existe, donc elle y mène. */
          <button
            type="button"
            onClick={onRaise}
            className="max-w-[34ch] cursor-pointer text-right text-[10px] leading-[1.35] normal-case text-[var(--ink-quiet)] underline decoration-dotted underline-offset-2 hover:text-[var(--ink)]"
          >
            {said}
          </button>
        ))}
    </span>
  );
}

/**
 * **Le budget d'un site, lu une fois pour ses deux cadres** — la barre du bureau, les cases du
 * téléphone. Le compte est servi pour ce qui se tient et complété par la file prépayée
 * (`slotsOn`).
 *
 * **Le site plein dit son remède** (25/08). Annoncé quand il mord ou quand la file l'a entamé — pas
 * avant : une ligne permanente sur la décision la plus structurante de la saison redevient du
 * bruit de fond, et c'est la faute que le chantier en tête a déjà coûtée une fois. Les deux
 * nombres arrivent servis (`me.homeSlotRelief`) : `homeSlots` est lu une fois, côté serveur, par
 * la phrase et par le refus qui la motive. Un avant-poste n'en a pas — ce qui l'élargit est son
 * propre niveau.
 */
function budgetOf(view: PlayerView, site: SiteRef, relief: boolean) {
  const total = view.me.siteSlots.find((budget) => sameSite(budget.site, site))?.total ?? 0;
  const taken = slotsOn(view, site).taken;
  const free = total - taken;
  const said =
    free > 0 && pledgedOn(view, site) === 0
      ? null
      : !relief
        ? fr.economy.budgetRaiseOutpost
        : view.me.homeSlotRelief === null
          ? fr.economy.budgetAtCeiling
          : fr.economy.budgetRelief(view.me.homeSlotRelief);
  return { taken, total, free, said };
}

/** One line per outpost, in the headquarters column. A point is a site like the home ground, and
 *  what it carries is its level — which is what makes raising one a legible decision. */
function OutpostBudgets({
  view,
  onRaiseOutpost,
}: {
  view: PlayerView;
  onRaiseOutpost: (outpostId: string) => void;
}) {
  if (view.me.outposts.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-[4px] border-t border-(color:--ink)/35 px-4 py-[9px]">
      {view.me.outposts.map((outpost, rank) => (
        <SiteBudget
          key={outpost.id}
          view={view}
          site={{ outpostId: outpost.id }}
          label={fr.economy.budgetOutpost(rank + 1, outpost.level)}
          relief={false}
          onRaise={outpost.atMaxLevel ? null : () => onRaiseOutpost(outpost.id)}
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
    <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-y border-(color:--ink)/35 bg-[var(--paper)] px-4 py-[5px]">
      <span className="eyebrow">{children}</span>
      {note !== undefined && <div className="ml-auto">{note}</div>}
    </div>
  );
}

/**
 * **What the army eats, beside what the nation makes** — at the foot of the page, where a
 * running total belongs. The food rate served on the strip is already net of it (`economyOf`),
 * so this block adds no figure of its own: it says how many troops, how much they take, and how
 * many of them stand where nobody feeds them — the three halves of a number the player
 * otherwise reads as one and cannot explain.
 *
 * **The balance closes it, in its own line.** Critical when it runs backwards, and in a body
 * that stays a body: it is the second most important figure of the surface, and printed large
 * it would fight the one countdown that has to win.
 */
function UpkeepFoot({ view }: { view: PlayerView }) {
  const { troops, unsupplied, foodPerHour } = view.me.upkeep;
  if (troops === 0) return null;
  const balance = view.me.resources.food.ratePerHour;

  return (
    <div className="mt-auto flex shrink-0 flex-col gap-[3px] border-t-2 border-[var(--ink)] bg-(--ink)/5 px-4 py-[9px]">
      {/* **Une seule ligne** : l'empire ne mange plus. L'entretien d'avant-poste est retiré
          depuis le 15/09 (révision de l'ADR 0020 §10) — ce qui reste est ce que l'armée prend,
          et le remède est de la nourrir ou de la faire rentrer. */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-[var(--ink)]">{fr.economy.upkeepTroops(troops)}</span>
        <span className="font-(family-name:--font-mono) text-[12px] text-[var(--critical)]">
          {fr.economy.upkeepDrain(foodPerHour)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-[var(--ink-soft)]">
          {unsupplied === 0
            ? fr.economy.upkeepAllSupplied
            : fr.economy.upkeepUnsupplied(unsupplied, UPKEEP_UNSUPPLIED_MULTIPLIER)}
        </span>
      </div>
      <div className="mt-[3px] flex items-baseline justify-end border-t border-(color:--ink)/28 pt-[5px]">
        <span
          className="font-(family-name:--font-mono) text-[14px]"
          style={{ color: balance < 0 ? 'var(--critical)' : 'var(--ink)' }}
        >
          {fr.economy.upkeepBalance(balance)}
        </span>
      </div>
      {view.me.starving ? (
        <p className="pt-1 text-[11px] leading-[1.45] text-[var(--critical)]">
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
function LotControl({
  chain,
  seat,
  loadedAt,
  now,
  observing,
}: {
  chain: ChainView;
  seat: Seat;
  loadedAt: number;
  now: number;
  /** Le lot en cours se lit jusqu'à sa livraison — il court tout seul —, il ne s'annule plus et
   *  il ne s'en commande plus d'autre : le serveur refuse déjà les deux (`requirePlayable`). */
  observing: boolean;
}) {
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

  const finishesAt = lotFinishesAt(chain, loadedAt);

  const send = (action: Promise<unknown>) => {
    setError(null);
    void action
      .then(() => setSizing(false))
      .catch((problem: unknown) => handleError(problem, setError));
  };

  return (
    <div className="shrink-0 border-y border-(color:--ink)/28 bg-(--ink)/[.035] px-4 py-[10px]">
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
              {finishesAt === null
                ? fr.economy.lot.remainingUnknown
                : fr.economy.lot.remaining(asDuration((finishesAt - now) / 60_000))}
            </span>
            {finishesAt !== null && (
              <span className="font-(family-name:--font-mono) text-[var(--ink-soft)]">
                {fr.economy.lot.endsAt(asDayAndTime(finishesAt))}
              </span>
            )}
            {!observing && (
              <button
                type="button"
                onClick={() => send(drop({ ...seat, chain: chain.by }))}
                className="ml-auto cursor-pointer border border-[var(--critical)] px-[11px] py-[5px] text-[9px] tracking-[.16em] text-[var(--critical)] uppercase hover:bg-[var(--critical)] hover:text-[var(--paper)]"
              >
                {fr.economy.lot.cancel}
              </button>
            )}
          </div>
          {!observing && (
            <p className="mt-[6px] max-w-[80ch] text-[11px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.economy.lot.cancelNote}
            </p>
          )}
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
              onClick={() => send(place({ ...seat, chain: chain.by, quantity: wanted }))}
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
            <span className="max-w-[52ch] text-[11px] leading-[1.45] text-[var(--ink-soft)]">
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
          {/* Les deux repos sont exclusifs : une réserve vide nomme son goulot et ne porte
              aucun bouton — offrir « commander un lot » là où le serveur refuserait serait la
              seule promesse fausse de la fenêtre. */}
          {maxOrder <= 0 ? (
            <>
              <span className="text-[12px] text-[var(--critical)]">
                {fr.economy.lot.impossible(inputLabel)}
              </span>
              <span className="ml-auto max-w-[52ch] text-right text-[11px] leading-[1.45] text-[var(--critical)]">
                {fr.economy.lot.bottleneck(aBuilding(PRODUCER_OF[input.resource]), inputLabel)}
              </span>
            </>
          ) : (
            <>
              <span className="text-[12px] text-[var(--ink-soft)]">
                {delivered
                  ? fr.economy.lot.doneNote(fr.buildings[chain.by], inputLabel)
                  : fr.economy.lot.keepsAvailable(inputLabel)}
              </span>
              {!observing && (
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
              )}
            </>
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
    <div className="min-w-[110px] flex-1 border-l border-(color:--ink)/30 py-[9px] pl-3 first:border-l-0 first:pl-0">
      <div className="eyebrow">{label}</div>
      <div className="mt-[3px] font-(family-name:--font-mono) text-[14px]" style={{ color: ink }}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// « Chantiers », sous le seuil
// ---------------------------------------------------------------------------------------

type WorksTab = keyof typeof fr.works.tabs;

const WORKS_TABS: ReadonlyArray<WorksTab> = ['underway', 'sites', 'chains', 'hq'];

/** Ce que l'en-tête collé occupe — le titre et les onglets : une section visée s'arrête dessous. */
const WORKS_HEADER_PX = 90;

/** Les familles des sites, dans l'ordre où la matière les traverse : ce qui se tire du sol, ce
 *  qui le transforme, ce qui arme, puis ce qui garde. Le quartier général n'y est pas : il a sa
 *  carte, et deux boutons pour une même marche en feraient deux ordres. */
const FAMILIES: ReadonlyArray<{
  readonly name: keyof typeof fr.works.families;
  readonly keys: ReadonlyArray<BuildingKey>;
}> = [
  { name: 'extraction', keys: EXTRACTION_KEYS },
  { name: 'transformation', keys: TRANSFORMATION_KEYS },
  { name: 'projection', keys: PROJECTION_KEYS },
  { name: 'command', keys: WORK_KEYS },
];

/** Le temps de lire « en file » et d'y revenir, sans que le cartouche reste à demeure. */
const QUEUED_NOTICE_MS = 10_000;

/**
 * **« Chantiers », un seul défilement et un toucher par site** (refonte mobile, 1f et 1g). La
 * fenêtre du bureau tient cinq boîtes qui défilent chacune ; sur un téléphone l'en-tête prenait
 * 280 px et l'on lisait deux sites à la fois. Ici l'en-tête tient 90 px et reste collé, ses
 * quatre onglets mènent aux sections d'un même défilement, et l'heure du chantier y remonte une
 * fois sa carte passée.
 *
 * **Chaque ligne de site porte son bouton et sa facture** : un toucher met en file, parce que la
 * file se rembourse — « annuler » reste à l'écran le temps qu'on le lise. Ce qui ne peut pas
 * monter le dit à la place du bouton, jamais grisé. Rien de neuf n'est calculé : budgets,
 * maillons, conditions et entretien sont les lectures du bureau.
 */
function WorksSheet({
  view,
  seat,
  now,
  focused,
  placements,
  columns,
  onRaiseOutpost,
  onClose,
}: {
  view: PlayerView;
  seat: Seat;
  now: number;
  focused: string | null;
  placements: Readonly<Record<BuildingKey, Placement>>;
  columns: ReadonlyArray<Column>;
  onRaiseOutpost: (outpostId: string) => void;
  onClose: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const sections = useRef(new Map<WorksTab, HTMLElement>());
  const [current, setCurrent] = useState<WorksTab>('underway');
  const [pastHead, setPastHead] = useState(false);
  const [queued, setQueued] = useState<Queued | null>(null);
  const running = view.me.construction;

  useEffect(() => {
    if (queued === null) return;
    const timer = setTimeout(() => setQueued(null), QUEUED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [queued]);

  /** L'onglet allumé est la dernière section dont le haut est passé sous l'en-tête. */
  const follow = () => {
    const box = scroller.current;
    if (box === null) return;
    const line = box.scrollTop + WORKS_HEADER_PX + 1;
    setCurrent(
      WORKS_TABS.filter((tab) => (sections.current.get(tab)?.offsetTop ?? Infinity) <= line).at(
        -1,
      ) ?? 'underway',
    );
    const card = head.current;
    setPastHead(
      card !== null && box.scrollTop + WORKS_HEADER_PX > card.offsetTop + card.offsetHeight,
    );
  };

  const goTo = (tab: WorksTab) => {
    const section = sections.current.get(tab);
    scroller.current?.scrollTo({
      top: (section?.offsetTop ?? 0) - WORKS_HEADER_PX,
      behavior: 'smooth',
    });
  };

  const section = (tab: WorksTab) => (node: HTMLElement | null) => {
    if (node === null) sections.current.delete(tab);
    else sections.current.set(tab, node);
  };

  return (
    <div
      ref={scroller}
      onScroll={follow}
      className="paper-grain relative min-h-0 w-full flex-1 overflow-y-auto overscroll-contain text-[var(--ink)]"
    >
      <div className="paper-grain sticky top-0 z-[2] border-b border-[var(--ink)]">
        <div className="flex h-[50px] items-center gap-[10px] pr-3 pl-4">
          <h2 className="font-(family-name:--font-display) text-[21px] leading-none font-extrabold tracking-[.04em] uppercase">
            {fr.works.header}
          </h2>
          {pastHead && running !== null ? (
            <span className="flex-1 truncate font-(family-name:--font-mono) text-[11px] text-[var(--notable-paper)]">
              {fr.works.headCountdown(
                running.name,
                asDuration(currentMinutes(running.minutesLeft, view.loadedAt, now)),
              )}
            </span>
          ) : (
            <span className="flex-1 truncate text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
              {fr.economy.subtitle(nationLabel(view.me.nation), view.season.number)}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer border border-[var(--ink)] px-3 text-[10px] font-semibold tracking-[.18em] uppercase"
          >
            {fr.common.close}
          </button>
        </div>
        <div className="grid h-[40px] grid-cols-4">
          {WORKS_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-current={current === tab}
              onClick={() => goTo(tab)}
              className={`cursor-pointer border-b-[3px] text-[10.5px] tracking-[.14em] uppercase ${
                current === tab
                  ? 'border-[var(--ink)] font-bold'
                  : 'border-transparent font-semibold text-[var(--ink-soft)]'
              }`}
            >
              {fr.works.tabs[tab]}
            </button>
          ))}
        </div>
      </div>

      <section ref={section('underway')}>
        <div className="flex flex-col gap-2 px-4 pt-3 pb-3">
          <BudgetLine view={view} site={HOME_SITE} label={fr.economy.budgetHome} relief />
          {view.me.outposts.map((outpost, rank) => (
            <BudgetLine
              key={outpost.id}
              view={view}
              site={{ outpostId: outpost.id }}
              label={fr.economy.budgetOutpost(rank + 1, outpost.level)}
              relief={false}
              onRaise={outpost.atMaxLevel ? null : () => onRaiseOutpost(outpost.id)}
            />
          ))}
        </div>
        <div ref={head}>
          {running === null ? (
            <p className="mx-3 px-3 py-[10px] text-[12.5px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.economy.constructionNone}
            </p>
          ) : (
            <RunningCard view={view} now={now} />
          )}
        </div>
        {view.me.constructionQueue.length > 0 && (
          <QueueLines queue={view.me.constructionQueue} seat={seat} observing={view.me.defeated} />
        )}
      </section>

      <section ref={section('sites')} className="mt-[18px] border-t-2 border-[var(--ink)]">
        <div className="flex items-baseline gap-[10px] px-4 pt-3 pb-[6px]">
          <span className="font-(family-name:--font-display) text-[19px] font-extrabold first-letter:uppercase">
            {fr.works.sitesHeader}
          </span>
          <span className="text-[12px] text-[var(--ink-note)]">{fr.works.sitesNote}</span>
        </div>
        {FAMILIES.map(({ name, keys }) => {
          const standing = keys.flatMap((key) =>
            view.me.buildings.filter((building) => building.key === key),
          );
          if (standing.length === 0) return null;
          return (
            <div key={name}>
              <div className="sticky top-[90px] z-[1] flex justify-between border-b border-[var(--ink)] bg-[color-mix(in_srgb,var(--paper),var(--ink)_6%)] px-4 pt-2 pb-[6px] text-[10px] font-bold tracking-[.18em] uppercase">
                <span>{fr.works.families[name]}</span>
                <span className="font-(family-name:--font-mono) font-normal tracking-normal text-[var(--ink-soft)]">
                  {standing.length}
                </span>
              </div>
              {standing.map((building) => (
                <SiteLine
                  key={building.id}
                  building={building}
                  view={view}
                  seat={seat}
                  now={now}
                  focused={focused === building.id}
                  onQueued={setQueued}
                />
              ))}
            </div>
          );
        })}
        <AbsentKeys view={view} placements={placements} />
      </section>

      <section ref={section('chains')} className="mt-[18px] border-t-2 border-[var(--ink)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--ink)] px-4 pt-3 pb-[10px]">
          <ChartLegend />
          <HelpMark>{fr.works.chainsLead}</HelpMark>
        </div>
        {columns.map((column) => (
          <ChainLine
            key={column.id}
            column={column}
            view={view}
            placements={placements}
            seat={seat}
            now={now}
          />
        ))}
      </section>

      <section ref={section('hq')} className="mt-4">
        <HeadquartersCard
          view={view}
          seat={seat}
          now={now}
          focused={focused}
          onQueued={setQueued}
        />
        <UnlinkedSites view={view} />
        <UpkeepFoot view={view} />
      </section>

      {queued !== null && (
        <QueuedNotice queued={queued} view={view} seat={seat} onDone={() => setQueued(null)} />
      )}
      <div className="h-6" />
    </div>
  );
}

/**
 * **Le budget d'un site en cases** : une case pleine par emplacement pris, vide par libre — le
 * compte se lit avant d'être lu. Le remède suit quand le site mord, et celui d'un avant-poste
 * mène à sa porte.
 */
function BudgetLine({
  view,
  site,
  label,
  relief,
  onRaise = null,
}: {
  view: PlayerView;
  site: SiteRef;
  label: string;
  relief: boolean;
  onRaise?: (() => void) | null;
}) {
  const { taken, total, free, said } = budgetOf(view, site, relief);
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {label}
        </div>
        <div className="mt-[3px] text-[14.5px]">
          <b>{fr.economy.budgetTaken(taken, total)}</b>
          <span style={{ color: free <= 0 ? 'var(--critical)' : undefined }}>
            {' · '}
            {fr.economy.budgetFree(free)}
          </span>
        </div>
        {said !== null &&
          (onRaise === null ? (
            <div className="mt-[2px] text-[12px] text-[var(--ink-note)]">{said}</div>
          ) : (
            <button
              type="button"
              onClick={onRaise}
              className="mt-[2px] cursor-pointer text-left text-[12px] text-[var(--ink-note)] underline decoration-dotted underline-offset-2"
            >
              {said}
            </button>
          ))}
      </div>
      <span aria-hidden className="flex flex-wrap justify-end gap-[3px]">
        {Array.from({ length: total }, (_, rank) => (
          <span
            key={rank}
            className={`h-[14px] w-[14px] ${rank < taken ? 'bg-[var(--ink)]' : 'border-[1.5px] border-[var(--ink)]'}`}
          />
        ))}
      </span>
    </div>
  );
}

/** **Le chantier en tête, et son heure** : la seule échéance de la file. Sans bouton
 *  d'annulation — un chantier commencé a consommé le temps de la file (`RunningWork`). */
function RunningCard({ view, now }: { view: PlayerView; now: number }) {
  const running = view.me.construction;
  if (running === null) return null;
  const standing = view.me.buildings.find(
    (building) => building.regionId === running.regionId && building.key === running.key,
  );
  const from = standing?.level ?? 0;
  return (
    <div className="mx-3 flex items-center gap-3 border-2 border-[var(--ink)] bg-(--ink)/5 p-3">
      {isOutpostWork(running.key) ? null : <BuildingPlate building={running.key} height={46} />}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {fr.economy.constructionHeader}
        </div>
        <div className="mt-[2px] font-(family-name:--font-display) text-[21px] leading-[1.05] font-extrabold">
          {running.name}
        </div>
        <div className="mt-[2px] text-[12.5px] text-[var(--ink-soft)]">
          {isOutpostWork(running.key)
            ? fr.economy.inRegion(running.regionName)
            : fr.works.raising(running.regionName, from, from + 1)}
        </div>
      </div>
      <div className="text-right">
        <div className="font-(family-name:--font-display) text-[25px] leading-none font-extrabold">
          {asDuration(currentMinutes(running.minutesLeft, view.loadedAt, now))}
        </div>
        <div className="mt-[5px] text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
          {fr.works.remaining}
        </div>
      </div>
    </div>
  );
}

/** La file derrière la tête, une ligne par entrée et son « annuler » : rien n'y est daté, le rang
 *  est ce qui est vrai (`QueuedWorks`). */
function QueueLines({
  queue,
  seat,
  observing,
}: {
  queue: ReadonlyArray<QueuedWork>;
  seat: Seat;
  observing: boolean;
}) {
  const { cancel, error } = useQueueCancel(seat);
  return (
    <div className="mt-[14px]">
      <div className="flex items-baseline justify-between gap-[10px] px-4 pb-1">
        <span className="text-[10px] font-bold tracking-[.18em] uppercase">
          {fr.economy.legendQueued}
        </span>
        <span className="text-[12px] text-[var(--ink-note)]">{fr.works.queueNote}</span>
      </div>
      {queue.map((entry, index) => (
        <div
          key={entry.id}
          className="flex min-h-[52px] items-center gap-[10px] border-b border-(color:--ink)/18 py-[2px] pr-[10px] pl-4"
        >
          <span className="w-[28px] font-(family-name:--font-display) text-[18px] font-extrabold">
            {fr.economy.queueRank(index + 2)}
          </span>
          {isOutpostWork(entry.key) ? null : <BuildingPlate building={entry.key} height={30} />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold">{entry.name}</span>
            <span className="block truncate text-[12px] text-[var(--ink-soft)]">
              {entry.regionName} · {fr.economy.queueLevel(entry.level)}
            </span>
          </span>
          {!observing && (
            <button
              type="button"
              title={fr.economy.queueCancelTitle}
              onClick={() => cancel(entry.id)}
              className="cursor-pointer px-[6px] text-[10.5px] font-semibold tracking-[.16em] uppercase underline underline-offset-[3px]"
            >
              {fr.economy.queueCancel}
            </button>
          )}
        </div>
      ))}
      {error !== null && <p className="px-4 pt-1 text-[11px] text-[var(--critical)]">{error}</p>}
    </div>
  );
}

/**
 * **Une ligne par site, son bouton et sa facture** : le nom et le niveau, la région, ce que le
 * bâtiment fait — et le cachet « hors réseau » quand sa région ne porte plus les couleurs.
 */
function SiteLine({
  building,
  view,
  seat,
  now,
  focused,
  onQueued,
}: {
  building: Building;
  view: PlayerView;
  seat: Seat;
  now: number;
  focused: boolean;
  onQueued: (queued: Queued) => void;
}) {
  const row = useFocusRow<HTMLDivElement>(focused);
  const cut = unlinkedProducers(view).some((producer) => producer.id === building.id);

  return (
    <div
      ref={row}
      className={`flex min-h-[70px] items-center gap-[10px] border-b border-(color:--ink)/18 py-2 pr-3 pl-[14px] ${
        focused ? FOCUS_MARK : ''
      }`}
    >
      <BuildingPlate building={building.key} height={42} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] leading-[1.1] font-bold">
          {fr.buildings[building.key]}
        </div>
        {/* Le niveau descend sur la ligne de la région : à côté du nom, sous la largeur d'un
            téléphone, il coupait « Caserne » en « Case… ». */}
        <div className="mt-[2px] truncate text-[12.5px] text-[var(--ink-soft)]">
          <span className="font-(family-name:--font-mono) text-[11px]">
            {fr.common.levelShort(building.level)}
          </span>
          {' · '}
          {fr.economy.inRegion(regionName(view, building.regionId))}
        </div>
        <div className="mt-[3px] flex items-center gap-2">
          {cut && <Stamp label={fr.stamps.unlinked} tone="critical" size="small" />}
          <span className="truncate text-[10px] font-semibold tracking-[.1em] text-[var(--ink-soft)] uppercase">
            {building.key === 'listening'
              ? fr.economy.listeningUnfigured
              : fr.buildingEffects[building.key]}
          </span>
          {building.key === 'listening' && <HelpMark>{fr.economy.listeningTemporary}</HelpMark>}
        </div>
      </div>
      <RaiseControl building={building} view={view} seat={seat} now={now} onQueued={onQueued} />
    </div>
  );
}

/**
 * **Ce qui vient d'être mis en file, et la porte pour le reprendre** (refonte mobile, 1f) : la
 * file se rembourse, donc un toucher suffisait — et « annuler » reste là le temps qu'on le lise.
 * Une entrée passée aussitôt en tête n'a plus de retour : le cartouche le dit, sans le bouton.
 */
function QueuedNotice({
  queued,
  view,
  seat,
  onDone,
}: {
  queued: Queued;
  view: PlayerView;
  seat: Seat;
  onDone: () => void;
}) {
  const { cancel, error } = useQueueCancel(seat);
  const region = regionName(view, queued.regionId);
  const rank = view.me.constructionQueue.findIndex(
    (entry) => entry.key === queued.key && entry.regionId === queued.regionId,
  );
  const entry = view.me.constructionQueue[rank];
  const started =
    view.me.construction?.key === queued.key && view.me.construction.regionId === queued.regionId;
  if (entry === undefined && !started) return null;

  return (
    <div
      role="status"
      className="sticky bottom-3 z-[3] mx-[10px] mt-3 flex items-center gap-[10px] bg-[var(--ink)] py-2 pr-2 pl-[14px] text-[var(--paper)] float"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[13.5px] font-bold">
          {entry === undefined
            ? fr.works.startedToast(queued.name, region)
            : fr.works.queuedToast(queued.name, region, rank + 2)}
        </span>
        <span className="text-[11px] text-[var(--paper-dim-2)]">{error ?? fr.works.toastNote}</span>
      </span>
      {entry !== undefined && (
        <button
          type="button"
          onClick={() => cancel(entry.id, onDone)}
          className="cursor-pointer border border-[var(--paper-dim)] px-3 text-[10.5px] font-semibold tracking-[.16em] uppercase"
        >
          {fr.economy.queueCancel}
        </button>
      )}
    </div>
  );
}

/** Le maillon d'une filière, en étiquette : ce qu'il est, et comment il se tient. */
type Link = {
  readonly text: string;
  readonly skin: 'deposit' | 'none' | 'input' | LinkState['kind'];
};

const LINK_SKIN: Readonly<Record<Link['skin'], string>> = {
  deposit: 'border border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]',
  none: 'border border-dashed border-[var(--critical)] text-[var(--critical)]',
  input: 'border border-(color:--ink)/40 text-[var(--ink-soft)] italic',
  built: 'border border-[var(--ink)]',
  underway: 'chart-underway border border-[var(--ink)]',
  queued: 'chart-underway border border-dashed border-[var(--ink)]',
  missing: 'border border-dashed border-[var(--ink)] text-[var(--ink-soft)]',
};

/**
 * **La filière en lignes** (refonte mobile, 1g) : huit colonnes ne tiennent pas dans 390 px, huit
 * lignes si. Chacune porte son débit réel, le verdict du règlement quand il y en a un — une
 * filière brute n'en a pas, on n'en invente pas —, ses maillons du sol à la sortie, et la phrase
 * qui dit ce qui manque, celle même du bureau. Le lot d'une chaîne commandée se règle dessous.
 */
function ChainLine({
  column,
  view,
  placements,
  seat,
  now,
}: {
  column: Column;
  view: PlayerView;
  placements: Readonly<Record<BuildingKey, Placement>>;
  seat: Seat;
  now: number;
}) {
  const worked = column.sources.flatMap((source) =>
    source.kind === 'deposit' ? [source.deposit] : [],
  );
  const cut = isCut(view, column, worked);
  const dry = column.output.perHour <= 0;
  const stepOf = (key: BuildingKey): Link => {
    const state = stateOf(view, key);
    return {
      text:
        state.kind === 'built'
          ? fr.works.linkLevel(fr.buildings[key], state.level)
          : fr.buildings[key],
      skin: state.kind,
    };
  };
  const chain = column.conversion;
  const order = chain?.commanded ? chain.order : null;
  const links: ReadonlyArray<Link> = [
    ...column.sources.map<Link>((source) =>
      source.kind === 'chain'
        ? { text: fr.resources[source.resource], skin: 'input' }
        : source.held === 0
          ? { text: fr.economy.roleDepositNone, skin: 'none' }
          : { text: fr.works.deposits(source.held), skin: 'deposit' },
    ),
    ...column.extraction.map(stepOf),
    ...(chain === null ? [] : [stepOf(chain.by)]),
    order !== null && order.produced < order.ordered
      ? { text: fr.works.lot(order.produced, order.ordered), skin: 'built' }
      : { text: fr.economy.roleOutput, skin: dry ? 'missing' : 'built' },
  ];
  const missing = [...column.extraction, ...(chain === null ? [] : [chain.by])].find(
    (key) => stateOf(view, key).kind === 'missing',
  );
  const bare = column.sources.find(
    (source): source is Extract<Source, { kind: 'deposit' }> =>
      source.kind === 'deposit' && source.held === 0,
  );
  const note =
    bare !== undefined
      ? fr.economy.depositNoneHeld(fr.deposits[bare.deposit])
      : missing !== undefined
        ? conditionOf(placements[missing])
        : null;

  return (
    <div className="border-b border-(color:--ink)/18 py-3 pr-[14px] pl-4">
      <div className="flex items-center gap-[10px]">
        <ResourcePlate resource={column.output.resource} height={24} />
        <span className="flex-1 text-[16px] font-bold">{fr.resources[column.output.resource]}</span>
        {cut ? (
          <StateBadge state="unlinked" label={fr.economy.chainStates.unlinked} />
        ) : (
          chain !== null && <ChainVerdict chain={chain} />
        )}
        <span
          className="w-[72px] text-right font-(family-name:--font-mono) text-[15px] font-medium"
          style={{ color: dry ? 'var(--critical)' : 'var(--ink)' }}
        >
          {fr.economy.perHour(column.output.perHour)}
        </span>
      </div>
      <div className="mt-[9px] flex flex-wrap items-center gap-[5px] pl-[34px]">
        {links.map((link, rank) => (
          <span key={`${link.text}-${rank}`} className="flex items-center gap-[5px]">
            <span
              className={`inline-flex h-[24px] items-center px-[7px] text-[11.5px] whitespace-nowrap ${LINK_SKIN[link.skin]}`}
            >
              {link.text}
            </span>
            {rank < links.length - 1 && (
              <span aria-hidden className="text-[12px] text-[var(--ink-soft)]">
                →
              </span>
            )}
          </span>
        ))}
      </div>
      {note !== null && (
        <p className="mt-[6px] pl-[34px] font-(family-name:--font-text) text-[13px] leading-[1.4] text-[var(--ink-quiet)]">
          {note}
        </p>
      )}
      {chain !== null && chain.commanded && chain.level > 0 && (
        <div className="-mr-[14px] -ml-4 pt-2">
          <LotControl
            chain={chain}
            seat={seat}
            loadedAt={view.loadedAt}
            now={now}
            observing={view.me.defeated}
          />
        </div>
      )}
    </div>
  );
}

/**
 * **Le quartier général en carte** : ce qu'il porte et sa marche suivante. Les nombres sont ceux
 * de la colonne du bureau (`HeadquartersColumn`), servis ou lus dans `constants.ts`.
 */
function HeadquartersCard({
  view,
  seat,
  now,
  focused,
  onQueued,
}: {
  view: PlayerView;
  seat: Seat;
  now: number;
  focused: string | null;
  onQueued: (queued: Queued) => void;
}) {
  const hq = view.me.buildings.find((building) => building.key === 'hq') ?? null;
  const card = useFocusRow<HTMLDivElement>(hq !== null && focused === hq.id);
  if (hq === null)
    return (
      <p className="mx-3 border-2 border-[var(--ink)] p-3 text-[12.5px] leading-[1.5] text-[var(--critical)]">
        {fr.economy.hqMissing}
      </p>
    );
  const level = view.me.hqLevel;
  return (
    <div ref={card} className="mx-3 border-2 border-[var(--ink)] p-3">
      <div className="flex items-center gap-3">
        <BuildingPlate building="hq" height={50} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-[.16em] text-[var(--ink-soft)] uppercase">
            {fr.works.hqWhere(regionName(view, hq.regionId))}
          </div>
          <div className="mt-[3px] font-(family-name:--font-display) text-[21px] font-extrabold first-letter:uppercase">
            {fr.economy.hqLevelLine(level, MAX_HQ_LEVEL)}
          </div>
        </div>
      </div>
      <div className="mt-[10px] text-[10px] font-bold tracking-[.16em] uppercase">
        {fr.economy.hqCarriesHeader}
      </div>
      <div className="mt-[5px] grid grid-cols-2 gap-x-3 gap-y-1 text-[13px] text-[var(--ink-quiet)]">
        <span>{fr.economy.hqSlots(view.me.slots.total)}</span>
        <span>
          {fr.economy.hqPlacements(
            view.me.siteSlots.find((budget) => sameSite(budget.site, HOME_SITE))?.total ?? 0,
          )}
        </span>
        <span>{fr.economy.hqChainSpeed(chainSpeed(level).toFixed(2))}</span>
        <span>
          {level >= view.me.tier2HqLevel
            ? fr.economy.hqTier2
            : fr.economy.hqTier2Locked(view.me.tier2HqLevel)}
        </span>
      </div>
      <div className="mt-3">
        <RaiseControl building={hq} view={view} seat={seat} now={now} onQueued={onQueued} wide />
      </div>
    </div>
  );
}
