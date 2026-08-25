import { useMutation } from 'convex/react';
import { useCallback, useRef, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { handleError } from '@/data/errors';
import { keepWindowGeometry, readWindowGeometry } from '@/data/settings';
import { Draggable } from './Draggable';
import { followDrag, scaleOf, type Grab } from './dragging';
import {
  blockedOn,
  buildableOn,
  pledgedCount,
  siteOf,
  type BlockedOption,
  type BlockedReason,
  type BuildOption,
  type BuildReason,
} from '@/domain/construction';
import { asDuration } from '@/domain/duration';
import { RESOURCES, type BuildingKey } from '@/domain/ids';
import type { Cost, PlayerView } from '@/domain/player-view';
import { BuildingPlate, ResourcePlate } from '@/emblems/Plate';
import { Panel } from './Panel';

const MIN_WIDTH = 260;
const MIN_HEIGHT = 200;

/** Only the size is remembered: an opening's place is the aimed point, never yesterday's. */
const GEOMETRY = 'construction';

/**
 * What can go up on one region, opened at the point that was aimed at. Building is choosing a
 * place, so it happens on the map and nowhere else — the nation sheet keeps the other verb,
 * raising what already stands.
 *
 * The panel opens toward the inside of the board: anchored by its left edge on the left half,
 * by its right edge on the right half. A panel astride an edge would cost a line to read.
 *
 * It then moves and resizes like a window, because it hides the very ground it talks about:
 * the player has to be able to push it aside to look at the region, and to open it up when
 * fifteen lines are on offer. The **anchored edge stays put** — dragging the corner grows the
 * panel away from the aimed point, so the site it designates never slides out from under it.
 */
export function ConstructionPanel({
  view,
  token,
  regionId,
  at,
  onClose,
}: {
  view: PlayerView;
  token: string;
  regionId: string;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const now = useClock();
  const [error, setError] = useState<string | null>(null);
  const start = useMutation(api.constructions.start);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(() => readWindowGeometry(GEOMETRY).size);

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  /**
   * The corner pulls away from the anchored edge, whichever it is — on the right half of the
   * board the handle sits on the left, and dragging left widens. A single bottom-right corner
   * would shove the panel over the region it names on half the screen.
   */
  const resize = useCallback<Grab>(
    (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const element = box.current;
      if (element === null) return;
      const scale = scaleOf(element);
      const startX = event.clientX;
      const startY = event.clientY;
      const startWidth = element.offsetWidth;
      const startHeight = element.offsetHeight;
      let latest = { width: startWidth, height: startHeight };
      followDrag(
        (drag) => {
          const wider = ((drag.clientX - startX) / scale) * (fromRight ? -1 : 1);
          const taller = ((drag.clientY - startY) / scale) * (fromBottom ? -1 : 1);
          latest = {
            width: Math.max(MIN_WIDTH, startWidth + wider),
            height: Math.max(MIN_HEIGHT, startHeight + taller),
          };
          setSize(latest);
        },
        () => keepWindowGeometry(GEOMETRY, { offset: { x: 0, y: 0 }, size: latest }),
      );
    },
    [fromRight, fromBottom],
  );

  const region = view.me.regions.find((candidate) => candidate.id === regionId);
  const site = siteOf(view, regionId, now);
  if (region === undefined || site === null) return null;

  /**
   * Never empty: the crane is only in the fan where something can go up, so the panel opens
   * on a list. A region already carrying a building can take nothing else — one per region —
   * and it is the crane that is missing there, not the lines here.
   */
  const options = buildableOn(site, view.buildCatalog);

  /** The other half of the fifteen, as a shelf under the offer — see `blockedOn`. */
  const blocked = blockedOn(site, view.buildCatalog);

  const built = countByKey(view.me.buildings);

  const order = (option: BuildOption) => {
    setError(null);
    start({ token, building: option.key, regionId }).then(onClose, (problem: unknown) =>
      handleError(problem, setError),
    );
  };

  return (
    <Draggable
      className="absolute z-20"
      style={{
        left: fromRight ? undefined : at.x,
        right: fromRight ? `calc(100% - ${at.x}px)` : undefined,
        top: fromBottom ? undefined : at.y,
        bottom: fromBottom ? `calc(100% - ${at.y}px)` : undefined,
      }}
      innerRef={box}
    >
      <Panel
        title={region.name}
        marker={fr.construction.kicker}
        position="static"
        width={size?.width ?? 310}
        {...(size ? { height: size.height } : {})}
      >
        <div className="flex shrink-0 items-baseline gap-2 text-[11.5px] text-[var(--ink-soft)]">
          <span>
            {region.deposit === null ? fr.construction.noDeposit : fr.deposits[region.deposit]}
          </span>
          {region.coastal && (
            <span className="text-[10px] tracking-[.12em] text-[var(--ink-quiet)] uppercase">
              {fr.construction.coastal}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto cursor-pointer border border-[var(--ink)] px-[7px] py-[2px] text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </div>

        {/* A deliberate echo of the nation sheet's bar: a datum reappears elsewhere when it is
            the subject of the decision taken there, and choosing where to build is that
            decision. The count is the list — `buildings.length` — never a third served number. */}
        <p className="mt-2 shrink-0 font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
          {fr.construction.budget(
            view.me.buildings.length + pledgedCount(view),
            view.me.buildingCap,
          )}
        </p>

        <FoundationNotice owed={view.me.foundation} />

        <HeldNotice view={view} options={options} />

        <h3 className="eyebrow mt-3 shrink-0 border-b border-[rgba(42,33,24,.3)] pb-[4px]">
          {fr.construction.offerHeader}
        </h3>
        <div className={size ? 'min-h-0 flex-1 overflow-auto' : 'max-h-[46vh] overflow-auto'}>
          {options.map((option) => (
            <OptionRow
              key={option.key}
              option={option}
              built={built[option.key] ?? 0}
              onOrder={() => order(option)}
            />
          ))}

          {blocked.length > 0 && (
            <>
              <h3 className="eyebrow mt-3 border-b border-[rgba(42,33,24,.3)] pb-[4px] text-[var(--ink-soft)]">
                {fr.construction.elsewhereHeader}
              </h3>
              {blocked.map((option) => (
                <BlockedRow key={option.key} option={option} built={built[option.key] ?? 0} />
              ))}
            </>
          )}
        </div>

        {error && (
          <p className="mt-2 shrink-0 border border-[var(--critical)] px-2 py-[6px] text-[12px] text-[var(--ink)]">
            {error}
          </p>
        )}
      </Panel>
      <div
        aria-hidden
        onPointerDown={resize}
        title={fr.window.resize}
        className={`absolute z-10 h-[16px] w-[16px] ${fromBottom ? 'top-0' : 'bottom-0'} ${
          fromRight ? 'left-0' : 'right-0'
        } ${fromRight === fromBottom ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}`}
        style={{
          backgroundImage: `repeating-linear-gradient(${
            fromRight === fromBottom ? '135deg' : '45deg'
          }, transparent 0 3px, var(--ink) 3px 4px)`,
        }}
      />
    </Draggable>
  );
}

/**
 * What the season still owes. It stands above the blocking reason on purpose: a player who has
 * five free placements in hand is not held back by anything, and reading "matières
 * insuffisantes" first would send him counting his alloy for buildings he is not paying for.
 */
function FoundationNotice({ owed }: { owed: ReadonlyArray<BuildingKey> }) {
  if (owed.length === 0) return null;
  const counted = [...new Set(owed)].map(
    (key) => [key, owed.filter((held) => held === key).length] as const,
  );

  return (
    <p className="mt-2 shrink-0 border border-[var(--ink)] px-2 py-[6px] text-[11.5px] leading-[1.4] text-[var(--ink)]">
      {fr.construction.foundationNotice(
        counted
          .map(([key, count]) => fr.construction.foundationCount(fr.buildings[key], count))
          .join(', '),
      )}
    </p>
  );
}

/**
 * The blocking reason, written **once**. Fifteen grey badges saying the same sentence is the
 * wall this rule exists to prevent; one line at the head of the panel says it better, and says
 * it with the deadline or the remedy the player actually needs.
 */
function HeldNotice({ view, options }: { view: PlayerView; options: ReadonlyArray<BuildOption> }) {
  const held = options.some((option) => option.hold === 'buildingCap')
    ? fr.construction.heldByCap(view.me.buildingCap, view.me.capRelief)
    : options.some((option) => option.hold === 'materials')
      ? fr.construction.heldByMaterials
      : null;

  if (held === null) return null;
  return (
    <p className="mt-2 shrink-0 border border-[var(--ink)] px-2 py-[6px] text-[11.5px] leading-[1.4] text-[var(--ink)]">
      {held}
    </p>
  );
}

/** How many of each key the nation already stands, all regions together. */
const countByKey = (
  buildings: ReadonlyArray<{ readonly key: BuildingKey }>,
): Partial<Record<BuildingKey, number>> =>
  buildings.reduce<Partial<Record<BuildingKey, number>>>(
    (tally, building) => ({ ...tally, [building.key]: (tally[building.key] ?? 0) + 1 }),
    {},
  );

/**
 * The name, and what the player has already put up under it. The count rides **after** the
 * name rather than in a column of its own: it is read as part of the label — "arsenal, j'en
 * ai deux" — and a column would turn fifteen zeroes into a table nobody asked for.
 */
function BuildingName({ building, built }: { building: BuildingKey; built: number }) {
  return (
    <span className="block text-[13px] font-semibold text-[var(--ink)]">
      {fr.buildings[building]}
      {built > 0 && (
        <span className="ml-[6px] font-(family-name:--font-mono) text-[11px] font-normal text-[var(--ink-soft)]">
          · {fr.construction.built(built)}
        </span>
      )}
    </span>
  );
}

function OptionRow({
  option,
  built,
  onOrder,
}: {
  option: BuildOption;
  built: number;
  onOrder: () => void;
}) {
  const held = option.hold !== null;
  return (
    <button
      type="button"
      disabled={held}
      onClick={onOrder}
      className="flex w-full items-center gap-2 border-b border-[rgba(42,33,24,.16)] py-[7px] text-left last:border-0 enabled:cursor-pointer enabled:hover:bg-[rgba(42,33,24,.07)] disabled:cursor-default"
    >
      <BuildingPlate building={option.key} height={30} />
      <span className="min-w-0 flex-1">
        <BuildingName building={option.key} built={built} />
        {option.reason && (
          <span className="block text-[11px] text-[var(--ink-soft)]">
            {reasonText(option.reason)}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        {option.free ? (
          <span className="block font-(family-name:--font-mono) text-[12px] tracking-[.08em] text-[var(--ink)] uppercase">
            {fr.construction.free}
          </span>
        ) : (
          <CostLine cost={option.cost} lacking={option.hold === 'materials'} />
        )}
        <span className="block font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
          {option.free ? fr.construction.immediate : asDuration(option.minutes)}
        </span>
      </span>
    </button>
  );
}

/**
 * A catalogue line. **Not a button, not a disabled button** — nothing here is waiting on a
 * click, and a disabled control invites the click that teaches nothing. The whole row is
 * dimmed at once, plate included, so the eye sorts the two lists before it reads either.
 */
function BlockedRow({ option, built }: { option: BlockedOption; built: number }) {
  return (
    <div className="flex w-full items-center gap-2 border-b border-[rgba(42,33,24,.16)] py-[7px] opacity-45 last:border-0">
      <BuildingPlate building={option.key} height={30} />
      <span className="min-w-0 flex-1">
        <BuildingName building={option.key} built={built} />
        <span className="block text-[11px] text-[var(--ink-soft)]">
          {blockedText(option.reason)}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <CostLine cost={option.cost} lacking={false} />
        <span className="block font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
          {asDuration(option.minutes)}
        </span>
      </span>
    </div>
  );
}

const blockedText = (reason: BlockedReason): string => {
  const said = fr.construction.blocked;
  switch (reason.kind) {
    case 'constructionHere':
      return said.constructionHere;
    case 'standing':
      return said.standing;
    case 'regionTaken':
      return said.regionTaken(fr.buildings[reason.by]);
    case 'unique':
      return said.unique;
    case 'locked':
      return said.locked(reason.hqLevel);
    case 'deposit':
      return said.deposit(reason.deposits.map((key) => fr.deposits[key]));
    case 'coastal':
      return said.coastal;
    case 'here':
      return said.here;
  }
};

const reasonText = (reason: BuildReason): string =>
  reason.kind === 'coastal'
    ? fr.construction.coastalReason
    : fr.construction.depositReason(fr.deposits[reason.deposit]);

/**
 * The bill in the critical ink when it cannot be paid: the figures are the explanation.
 *
 * The **illustrated plates**, at the height a raise is priced at (`UpgradeControl`): the two
 * verbs bill the same way, and a player who reads a drum on the nation sheet must not have to
 * relearn a silhouette to read the same drum on the map. The rows already carry a building
 * plate at thirty, so the twenty here is the smaller object of a line that was never tight.
 *
 * A plate carries its own ink and takes no tint, so only the figure turns critical — the half
 * that has to: the resource is *what* is missing, the number is *how much*.
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
