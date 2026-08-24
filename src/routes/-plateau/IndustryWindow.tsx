import { useMutation } from 'convex/react';
import { useState, type ReactNode } from 'react';
import { api } from '../../../convex/_generated/api';
import { REST_WINDOW_MINUTES, UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { aBuilding, fr } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { Gauge, SATURATION_MARK } from '@/shell/Gauge';
import { useClock } from '@/shell/clock';
import { RESOURCES, type BuildingKey, type ResourceKey } from '@/domain/ids';
import { PRODUCER_OF } from '@/domain/economy';
import { asDayAndTime, asHoursMinutes } from '@/domain/duration';
import type {
  ChainState,
  ChainView,
  ExtractionSiteView,
  PlayerView,
  Resource,
} from '@/domain/player-view';
import { currentMinutes, currentStock } from '@/domain/player-view';
import { BuildingPlate, ResourcePlate } from '@/emblems/Plate';
import { FOCUS_MARK, useFocusRow } from './focus';
import { UpgradeControl } from './UpgradeControl';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';

/**
 * What the nation *makes*, where the nation sheet only says what it *holds*. The question this
 * window exists to answer is "why is my alloy not rising", and no stock can answer it: the
 * chain state comes served from the settlement itself (ADR 0015, `settleStocks`).
 *
 * Read-only on purpose. Raising a level is the next pass, and the map still puts buildings
 * down — a second construction screen here would be the third place a building gets ordered.
 */
export function IndustryWindow({
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

  return (
    <FloatingWindow name="industry" onClose={onClose} {...windowProps} alignment="top" width={920}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <DragHandle className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--ink)] px-4 py-[10px] text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>{fr.industry.header}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <p className="shrink-0 border-b border-[rgba(42,33,24,.35)] px-4 py-[9px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)] italic">
          {fr.industry.lead}
        </p>

        <RunningNotice view={view} now={now} />

        <div className="flex min-h-0 flex-1 flex-col overflow-auto @3xl:flex-row @3xl:items-stretch @3xl:overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col @3xl:min-h-0 @3xl:overflow-auto">
            <Header>{fr.industry.chainsHeader}</Header>
            {view.me.chains.map((chain) => (
              <ChainRow
                key={chain.by}
                chain={chain}
                view={view}
                token={token}
                now={now}
                focused={focused}
              />
            ))}

            <Header>{fr.industry.upkeepHeader}</Header>
            <UpkeepRow view={view} />

            <Header>{fr.industry.depositsHeader}</Header>
            {view.me.extraction.length === 0 ? (
              <Empty>{fr.industry.depositsEmpty}</Empty>
            ) : (
              view.me.extraction.map((site) => (
                <SiteRow
                  key={site.regionId}
                  site={site}
                  region={regionName(view, site.regionId)}
                  view={view}
                  token={token}
                  now={now}
                  focused={focused}
                />
              ))
            )}
          </div>

          <aside className="flex w-full min-w-0 flex-col border-t border-[rgba(42,33,24,.35)] @3xl:w-[330px] @3xl:shrink-0 @3xl:min-h-0 @3xl:overflow-auto @3xl:border-t-0 @3xl:border-l">
            <Header note={fr.industry.reservesNote}>{fr.industry.reservesHeader}</Header>
            {RESOURCES.map((key) => (
              <ReserveRow
                key={key}
                resource={key}
                reserve={view.me.resources[key]}
                stock={currentStock(view.me.resources[key], view.loadedAt, now)}
              />
            ))}
            <p className="px-4 pt-3 pb-1 text-[11px] leading-[1.45] text-[var(--ink-quiet)] italic">
              {fr.industry.reservesMark}
            </p>

            <Header>{fr.industry.othersHeader}</Header>
            {otherBuildings(view).length === 0 ? (
              <Empty>{fr.industry.othersEmpty}</Empty>
            ) : (
              otherBuildings(view).map((building) => (
                <OtherRow
                  key={building.regionId}
                  building={building}
                  region={regionName(view, building.regionId)}
                  view={view}
                  token={token}
                  now={now}
                  focused={focused === building.id}
                />
              ))
            )}
            <p className="px-4 pt-2 pb-5 text-[11px] leading-[1.45] text-[var(--ink-quiet)] italic">
              {fr.industry.listeningTemporary}
            </p>
          </aside>
        </div>
      </div>
    </FloatingWindow>
  );
}

/**
 * **What the army eats, beside what the nation makes.** The food rate served on the strip is
 * already net of it (`economyOf`), so this row adds no figure of its own: it says how many
 * troops, how much they take, and how many of them stand where nobody feeds them — the three
 * halves of a number the player otherwise reads as one and cannot explain.
 */
function UpkeepRow({ view }: { view: PlayerView }) {
  const { troops, unsupplied, foodPerHour } = view.me.upkeep;
  if (troops === 0) return <Empty>{fr.industry.upkeepEmpty}</Empty>;

  return (
    <div className="flex flex-col gap-[3px] border-b border-[rgba(42,33,24,.35)] px-4 py-[9px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] text-[var(--ink)]">{fr.industry.upkeepTroops(troops)}</span>
        <span className="font-(family-name:--font-mono) text-[12px] text-[var(--critical)]">
          {fr.industry.upkeepDrain(foodPerHour)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-[var(--ink-quiet)] italic">
          {unsupplied === 0
            ? fr.industry.upkeepAllSupplied
            : fr.industry.upkeepUnsupplied(unsupplied, UPKEEP_UNSUPPLIED_MULTIPLIER)}
        </span>
        <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
          {fr.industry.upkeepBalance(view.me.resources.food.ratePerHour)}
        </span>
      </div>
      {view.me.starving ? (
        <p className="pt-1 text-[11px] leading-[1.45] text-[var(--critical)] italic">
          {fr.industry.upkeepStarving}
        </p>
      ) : null}
    </div>
  );
}

/** The three keys the window gathers besides the chains and the deposits: the two stores and,
 *  until the espionage surface exists, the listening station. */
const OTHER_KEYS: ReadonlyArray<BuildingKey> = ['warehouse', 'depot', 'listening'];

const otherBuildings = (view: PlayerView) =>
  view.me.buildings.filter((building) => OTHER_KEYS.includes(building.key));

const regionName = (view: PlayerView, regionId: string): string =>
  view.me.regions.find((region) => region.id === regionId)?.name ?? regionId;

/** One building per region (ADR 0015), so a region id names an instance without ambiguity —
 *  which is what a raise needs, where a chain or a deposit only names a family. */
const standingOn = (view: PlayerView, regionId: string) =>
  view.me.buildings.find((building) => building.regionId === regionId) ?? null;

/**
 * The single-construction sentence, **once for the whole window** — and above every section
 * whose buttons it turns inert, not beside one of them. Written under each upgrade control it
 * was the same twelve words four times over, and the banner already carries it: a datum has one
 * house (`brief-degraissage-surfaces.md`). The lines keep it as a hover title, which is where a
 * per-line answer belongs.
 */
function RunningNotice({ view, now }: { view: PlayerView; now: number }) {
  const running = view.me.construction;
  if (running === null) return null;

  return (
    <p className="shrink-0 border-b border-[rgba(42,33,24,.35)] px-4 py-[8px] text-[11.5px] leading-[1.45] text-[var(--ink)]">
      {fr.construction.heldByConstruction(
        running.name,
        asHoursMinutes(currentMinutes(running.minutesLeft, view.loadedAt, now)),
      )}
    </p>
  );
}

function Header({ children, note }: { children: string; note?: string }) {
  return (
    <div className="sticky top-0 z-10 flex shrink-0 items-baseline gap-3 border-y border-[rgba(42,33,24,.35)] bg-[var(--paper)] px-4 py-[5px] first:border-t-0">
      <span className="eyebrow">{children}</span>
      {note !== undefined && (
        <span className="ml-auto text-[11px] text-[var(--ink-soft)]">{note}</span>
      )}
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="px-4 py-4 text-[12.5px] leading-[1.5] text-[var(--ink-soft)]">{children}</p>;
}

/**
 * `idle` is deliberately the quietest ink of the five. A chain awaiting an order is not a
 * failure — it is the state the whole "arsenal se commande" rule produces on purpose, and
 * dressing it in the critical ink would put the player back to fixing what is not broken.
 */
const STATE_INK: Readonly<Record<ChainState, string>> = {
  off: 'var(--ink-quiet)',
  idle: 'var(--ink-soft)',
  running: 'var(--valid)',
  starved: 'var(--critical)',
  overflowing: 'var(--notable-paper)',
};

/**
 * The badge and its sentence, together, because they say the same thing at two lengths — and
 * because "à sec" without the resource behind it is exactly the diagnosis this window exists
 * to replace.
 */
function verdictOf(chain: ChainView): { badge: string; note: string } {
  if (chain.state === 'starved' && chain.missing !== null) {
    const resource = fr.resources[chain.missing];
    return {
      badge: fr.industry.starvedOn(resource),
      note: fr.industry.chainNotes.starved(resource),
    };
  }
  const note =
    chain.state === 'off'
      ? fr.industry.chainNotes.off(fr.buildings[chain.by])
      : chain.state === 'idle'
        ? fr.industry.chainNotes.idle
        : chain.state === 'overflowing'
          ? fr.industry.chainNotes.overflowing
          : fr.industry.chainNotes.running;
  return { badge: fr.industry.chainStates[chain.state], note };
}

function ChainRow({
  chain,
  view,
  token,
  now,
  focused,
}: {
  chain: ChainView;
  view: PlayerView;
  token: string;
  now: number;
  focused: string | null;
}) {
  const { badge, note } = verdictOf(chain);
  // A chain is a family, a raise is an instance: two foundries convert as one line and are
  // raised as two, so the sites hang under the chain rather than beside it.
  const sites = view.me.buildings.filter((building) => building.key === chain.by);

  return (
    <div className="border-b border-[rgba(42,33,24,.16)]">
      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-[6px] px-4 py-[10px] ${
          chain.state === 'off' ? 'opacity-55' : ''
        }`}
      >
        <div className="flex min-w-[150px] items-center gap-[10px]">
          <BuildingPlate building={chain.by} height={38} />
          <div>
            <div className="text-[14px] font-semibold text-[var(--ink)]">
              {fr.buildings[chain.by]}
            </div>
            <div className="text-[11px] text-[var(--ink-soft)]">
              {fr.industry.level(chain.level)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-1">
          {chain.inputs.map((input) => (
            <Quantity
              key={input.resource}
              resource={input.resource}
              label={fr.industry.chainRecipe(input.quantity, fr.resources[input.resource])}
            />
          ))}
          <span className="font-(family-name:--font-mono) text-[13px] text-[var(--ink-soft)]">
            {fr.industry.chainArrow}
          </span>
          <Quantity resource={chain.output} label={fr.resources[chain.output]} />
        </div>

        {/* The real rate leads and the nominal only follows when they part company: "3 / h"
            printed beside "à sec" is the interface telling the player he is producing when he
            is not, and it is the figure he acts on. */}
        <div className="ml-auto flex flex-col items-end leading-none">
          <span className="font-(family-name:--font-mono) text-[15px] font-semibold text-[var(--ink)]">
            {fr.industry.perHour(chain.perHour)}
          </span>
          {chain.nominalPerHour !== chain.perHour && (
            <span className="mt-[3px] text-[11px] text-[var(--ink-soft)]">
              {fr.industry.nominalRate(chain.nominalPerHour)}
            </span>
          )}
        </div>

        <div className="flex min-w-[170px] flex-col items-end gap-[2px] text-right">
          <span
            className="border px-[7px] py-[2px] text-[10px] tracking-[.14em] uppercase"
            style={{ color: STATE_INK[chain.state], borderColor: STATE_INK[chain.state] }}
          >
            {badge}
          </span>
          <span className="text-[11px] leading-[1.4] text-[var(--ink-soft)]">{note}</span>
        </div>
      </div>
      {chain.commanded && chain.level > 0 && <LotControl chain={chain} token={token} now={now} />}
      {sites.map((site) => (
        <ChainSiteRow
          key={site.regionId}
          site={site}
          view={view}
          token={token}
          now={now}
          focused={focused === site.id}
        />
      ))}
    </div>
  );
}

function ChainSiteRow({
  site,
  view,
  token,
  now,
  focused,
}: {
  site: PlayerView['me']['buildings'][number];
  view: PlayerView;
  token: string;
  now: number;
  focused: boolean;
}) {
  const row = useFocusRow<HTMLDivElement>(focused);
  return (
    <div
      ref={row}
      className={`flex items-center gap-3 border-t border-dotted border-[rgba(42,33,24,.22)] px-4 py-[7px] ${
        focused ? `${FOCUS_MARK} pl-6` : 'pl-8'
      }`}
    >
      <span className="min-w-0 flex-1 text-[12px] text-[var(--ink-soft)]">
        {fr.industry.inRegion(regionName(view, site.regionId))} · {fr.industry.level(site.level)}
      </span>
      <UpgradeControl building={site} view={view} token={token} now={now} runningSaidElsewhere />
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
 *
 * Four readings, and the first two must not be confused — that confusion is the reason the
 * `idle` state exists at all:
 *   - **awaiting an order** — nothing is consumed, and that is not a breakdown;
 *   - **starved** — the input is gone, and a lot is impossible until a foundry stands;
 *   - **running** — visible and droppable;
 *   - **delivered** — what came out, and the line falls quiet again.
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
    <div className="border-t border-dotted border-[rgba(42,33,24,.28)] bg-[rgba(42,33,24,.035)] px-4 py-[10px] pl-8">
      {running ? (
        <>
          <Gauge filled={order.produced / order.ordered} height={12} />
          <div className="mt-[7px] flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
            <span className="text-[var(--ink)]">
              {fr.industry.lot.progress(order.produced, order.ordered, outputLabel)}
            </span>
            <span className="font-(family-name:--font-mono) text-[var(--ink-soft)]">
              {rate > 0
                ? fr.industry.lot.remaining(asHoursMinutes((owed / rate) * 60))
                : fr.industry.lot.remainingUnknown}
            </span>
            {rate > 0 && (
              <span className="font-(family-name:--font-mono) text-[var(--ink-soft)]">
                {fr.industry.lot.endsAt(asDayAndTime(now + (owed / rate) * 3_600_000))}
              </span>
            )}
            <button
              type="button"
              onClick={() => send(drop({ token, chain: chain.by }))}
              className="ml-auto cursor-pointer border border-[var(--critical)] px-[11px] py-[5px] text-[9px] tracking-[.16em] text-[var(--critical)] uppercase hover:bg-[var(--critical)] hover:text-[var(--paper)]"
            >
              {fr.industry.lot.cancel}
            </button>
          </div>
          <p className="mt-[6px] max-w-[70ch] text-[11px] leading-[1.45] text-[var(--ink-soft)]">
            {fr.industry.lot.cancelNote}
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
              {fr.industry.lot.maxOf(maxOrder, inputLabel)}
            </span>
          </div>

          <div className="mt-[10px] flex flex-wrap items-stretch border-y border-[var(--ink)]">
            <Reading label={fr.industry.lot.costs}>
              {fr.industry.lot.costOf(wanted * input.quantity, inputLabel)}
            </Reading>
            <Reading label={fr.industry.lot.duration}>{asHoursMinutes(hours * 60)}</Reading>
            <Reading label={fr.industry.lot.ends}>
              {wanted === 0 ? fr.common.dash : asDayAndTime(now + hours * 3_600_000)}
            </Reading>
            <Reading
              label={fr.industry.lot.coversNight}
              ink={coversNight ? 'var(--ink)' : 'var(--critical)'}
            >
              {wanted === 0
                ? fr.industry.lot.coversNone
                : coversNight
                  ? fr.industry.lot.coversYes
                  : fr.industry.lot.coversNo(asHoursMinutes(hours * 60))}
            </Reading>
          </div>

          <div className="mt-[10px] flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={wanted <= 0}
              onClick={() => send(place({ token, chain: chain.by, quantity: wanted }))}
              className="cursor-pointer bg-[var(--ink)] px-[15px] py-[8px] text-[9px] tracking-[.18em] text-[var(--paper)] uppercase disabled:cursor-not-allowed disabled:opacity-35"
            >
              {fr.industry.lot.launch}
            </button>
            <button
              type="button"
              onClick={() => setSizing(false)}
              className="cursor-pointer border border-[var(--ink)] px-[11px] py-[6px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.industry.lot.close}
            </button>
            <span className="max-w-[46ch] text-[11px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.industry.lot.once}
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {delivered && (
            <>
              <span className="border border-[var(--ink)] px-[7px] py-[2px] text-[10px] tracking-[.14em] text-[var(--ink)] uppercase">
                {fr.industry.lot.done}
              </span>
              <span className="text-[12.5px] font-semibold text-[var(--ink)]">
                {fr.industry.lot.delivered(order.ordered, outputLabel)}
              </span>
            </>
          )}
          <span className="text-[12px] text-[var(--ink-soft)]">
            {maxOrder <= 0
              ? fr.industry.lot.impossible(inputLabel)
              : delivered
                ? fr.industry.lot.doneNote(fr.buildings[chain.by], inputLabel)
                : fr.industry.lot.keepsAvailable(inputLabel)}
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
              {fr.industry.lot.order}
            </button>
          ) : (
            <span className="ml-auto max-w-[46ch] text-right text-[11px] leading-[1.45] text-[var(--critical)]">
              {fr.industry.lot.bottleneck(aBuilding(PRODUCER_OF[input.resource]), inputLabel)}
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

function Quantity({ resource, label }: { resource: ResourceKey; label: string }) {
  return (
    <span className="flex items-center gap-[5px] text-[12.5px] text-[var(--ink)]">
      <ResourcePlate resource={resource} height={22} />
      {label}
    </span>
  );
}

function SiteRow({
  site,
  region,
  view,
  token,
  now,
  focused,
}: {
  site: ExtractionSiteView;
  region: string;
  view: PlayerView;
  token: string;
  now: number;
  focused: string | null;
}) {
  const mute = site.perHour === 0;
  const standing = standingOn(view, site.regionId);
  const designated = standing !== null && standing.id === focused;
  const row = useFocusRow<HTMLDivElement>(designated);
  return (
    <div
      ref={row}
      className={`flex items-center gap-3 border-b border-[rgba(42,33,24,.16)] px-4 py-[8px] ${
        designated ? `${FOCUS_MARK} pl-2` : ''
      }`}
    >
      <BuildingPlate building={site.key} height={34} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13.5px] font-semibold text-[var(--ink)]">
            {fr.buildings[site.key]}
          </span>
          <span className="text-[11.5px] text-[var(--ink-soft)]">
            {fr.industry.inRegion(region)}
          </span>
        </div>
        <div className="text-[11.5px] text-[var(--ink-soft)]">
          {site.deposit !== null && !mute
            ? fr.industry.depositLine(fr.deposits[site.deposit], site.level)
            : fr.industry.noDeposit}
        </div>
      </div>
      <span
        className="shrink-0 font-(family-name:--font-mono) text-[13px]"
        style={{ color: mute ? 'var(--critical)' : 'var(--ink)' }}
      >
        {fr.industry.perHour(site.perHour)}
      </span>
      {standing !== null && (
        <UpgradeControl
          building={standing}
          view={view}
          token={token}
          now={now}
          runningSaidElsewhere
        />
      )}
    </div>
  );
}

/**
 * **The gauge, and the figure only when it matters.** Industry wants the margin where the
 * banner wants the value — writing "352 / 400 plafond" here was the eighteenth printing of a
 * ceiling that, without a warehouse, is the same 400 on all eight lines.
 *
 * Below the mark the bar is the whole answer. At the mark the headroom comes back in words,
 * and at the ceiling the line turns critical: a saturated reserve is not a neutral state, it
 * is production being thrown away every hour, and nothing said so before.
 */
function ReserveRow({
  resource,
  reserve,
  stock,
}: {
  resource: ResourceKey;
  reserve: Resource;
  stock: number;
}) {
  const cap = reserve.cap;
  const filled = cap === 0 ? 0 : stock / cap;
  const left = Math.max(0, cap - stock);

  /**
   * **A ceiling only costs something when something is arriving.** The reserves panel already
   * reads it that way, and this row did not: a skirmish opens above the alloy ceiling by design
   * (`startingAlloy` says where a player enters the curve), so "saturé — production perdue" was
   * printed in the critical ink over a foundry nobody had built. A full gauge with no inflow is
   * a normal state — full to the eye, silent in words.
   */
  const warns = reserve.ratePerHour > 0;
  const note = !warns
    ? null
    : filled >= 1
      ? fr.industry.atCap
      : filled >= SATURATION_MARK
        ? fr.industry.headroom(left)
        : null;

  return (
    <div
      className="border-b border-[rgba(42,33,24,.16)] px-4 py-[8px]"
      title={fr.industry.gaugeTitle(fr.resources[resource], stock, cap)}
    >
      <div className="flex items-center gap-[10px]">
        <ResourcePlate resource={resource} height={24} />
        <span className="min-w-0 flex-1 text-[12.5px] text-[var(--ink)]">
          {fr.resources[resource]}
        </span>
        {note !== null && (
          <span
            className="shrink-0 text-[11px]"
            style={{ color: filled >= 1 ? 'var(--critical)' : 'var(--ink-soft)' }}
          >
            {note}
          </span>
        )}
      </div>
      <div className="mt-[6px]">
        <Gauge filled={filled} height={10} inflow={reserve.ratePerHour} />
      </div>
    </div>
  );
}

function OtherRow({
  building,
  region,
  view,
  token,
  now,
  focused,
}: {
  building: PlayerView['me']['buildings'][number];
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
      className={`border-b border-[rgba(42,33,24,.16)] px-4 py-[8px] ${
        focused ? `${FOCUS_MARK} pl-2` : ''
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[13.5px] font-semibold text-[var(--ink)]">{building.name}</span>
        <span className="text-[11.5px] text-[var(--ink-soft)]">{fr.industry.inRegion(region)}</span>
        <span className="ml-auto font-(family-name:--font-mono) text-[12px] text-[var(--ink-soft)]">
          {fr.industry.level(building.level)}
        </span>
      </div>
      <div className="flex items-end gap-3">
        <BuildingPlate building={building.key} height={30} />
        <p className="min-w-0 flex-1 text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
          {building.key === 'listening'
            ? fr.industry.listeningUnfigured
            : fr.buildingEffects[building.key]}
        </p>
        <UpgradeControl
          building={building}
          view={view}
          token={token}
          now={now}
          runningSaidElsewhere
        />
      </div>
    </div>
  );
}
