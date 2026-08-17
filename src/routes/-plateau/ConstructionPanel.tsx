import { useMutation } from 'convex/react';
import { useCallback, useRef, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { handleError } from '@/data/errors';
import { keepWindowGeometry, readWindowGeometry } from '@/data/settings';
import { followDrag, onControl, scaleOf, type Grab } from './dragging';
import { buildableOn, siteOf, type BuildOption, type BuildReason } from '@/domain/construction';
import { asHoursMinutes } from '@/domain/duration';
import { RESOURCES, type BuildingKey } from '@/domain/ids';
import { currentMinutes, type Cost, type PlayerView } from '@/domain/player-view';
import { ResourceIcon, resourceColor } from '@/emblems/ResourceIcon';
import { BuildingPlate } from '@/emblems/Plate';
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
  const [moved, setMoved] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState(() => readWindowGeometry(GEOMETRY).size);

  const fromRight = at.x > window.innerWidth / 2;
  const fromBottom = at.y > window.innerHeight / 2;

  const grab = useCallback<Grab>(
    (event) => {
      // A click on the close button stays a click, and the right button belongs to the map.
      if (event.button !== 0 || onControl(event)) return;
      event.preventDefault();
      const scale = scaleOf(box.current);
      const startX = event.clientX - moved.x * scale;
      const startY = event.clientY - moved.y * scale;
      followDrag(
        (drag) =>
          setMoved({ x: (drag.clientX - startX) / scale, y: (drag.clientY - startY) / scale }),
        () => {},
      );
    },
    [moved],
  );

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

  const order = (option: BuildOption) => {
    setError(null);
    start({ token, building: option.key, regionId }).then(onClose, (problem: unknown) =>
      handleError(problem, setError),
    );
  };

  return (
    <div
      ref={box}
      className="absolute z-20"
      style={{
        left: fromRight ? undefined : at.x,
        right: fromRight ? `calc(100% - ${at.x}px)` : undefined,
        top: fromBottom ? undefined : at.y,
        bottom: fromBottom ? `calc(100% - ${at.y}px)` : undefined,
        transform: `translate(${moved.x}px, ${moved.y}px)`,
      }}
    >
      <Panel
        title={region.name}
        marker={fr.construction.kicker}
        position="static"
        width={size?.width ?? 310}
        {...(size ? { height: size.height } : {})}
        onGrab={grab}
      >
        <div className="flex shrink-0 items-baseline gap-2 text-[11.5px] text-[var(--ink-soft)]">
          <span>{region.deposit === null ? fr.construction.noDeposit : fr.deposits[region.deposit]}</span>
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
        <p className="mt-2 shrink-0 font-[var(--font-mono)] text-[11.5px] text-[var(--ink-soft)]">
          {fr.construction.budget(view.me.buildings.length, view.me.buildingCap)}
        </p>

        <FoundationNotice owed={view.me.foundation} />

        <HeldNotice view={view} options={options} now={now} />

        <h3 className="eyebrow mt-3 shrink-0 border-b border-[rgba(42,33,24,.3)] pb-[4px]">
          {fr.construction.offerHeader}
        </h3>
        <div className={size ? 'min-h-0 flex-1 overflow-auto' : 'max-h-[46vh] overflow-auto'}>
          {options.map((option) => (
            <OptionRow key={option.key} option={option} onOrder={() => order(option)} />
          ))}
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
    </div>
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
function HeldNotice({
  view,
  options,
  now,
}: {
  view: PlayerView;
  options: ReadonlyArray<BuildOption>;
  now: number;
}) {
  const construction = view.me.construction;
  const held = options.some((option) => option.hold === 'constructionRunning')
    ? construction === null
      ? null
      : fr.construction.heldByConstruction(
          construction.name,
          asHoursMinutes(currentMinutes(construction.minutesLeft, view.loadedAt, now)),
        )
    : options.some((option) => option.hold === 'buildingCap')
      ? fr.construction.heldByCap(view.me.buildingCap)
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

function OptionRow({ option, onOrder }: { option: BuildOption; onOrder: () => void }) {
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
        <span className="block text-[13px] font-semibold text-[var(--ink)]">
          {fr.buildings[option.key]}
        </span>
        {option.reason && (
          <span className="block text-[11px] text-[var(--ink-soft)]">{reasonText(option.reason)}</span>
        )}
      </span>
      <span className="shrink-0 text-right">
        {option.free ? (
          <span className="block font-[var(--font-mono)] text-[12px] tracking-[.08em] text-[var(--ink)] uppercase">
            {fr.construction.free}
          </span>
        ) : (
          <CostLine cost={option.cost} lacking={option.hold === 'materials'} />
        )}
        <span className="block font-[var(--font-mono)] text-[11px] text-[var(--ink-soft)]">
          {option.free ? fr.construction.immediate : asHoursMinutes(option.minutes)}
        </span>
      </span>
    </button>
  );
}

const reasonText = (reason: BuildReason): string =>
  reason.kind === 'coastal'
    ? fr.construction.coastalReason
    : fr.construction.depositReason(fr.deposits[reason.deposit]);

/** The bill in the critical ink when it cannot be paid: the figures are the explanation. */
function CostLine({ cost, lacking }: { cost: Cost; lacking: boolean }) {
  return (
    <span
      className="flex items-center justify-end gap-[8px] font-[var(--font-mono)] text-[12px]"
      style={{ color: lacking ? 'var(--critical)' : 'var(--ink)' }}
    >
      {RESOURCES.filter((key) => (cost[key] ?? 0) > 0).map((key) => (
        <span key={key} className="flex items-center gap-[3px]">
          <span className="flex" style={{ color: lacking ? undefined : resourceColor(key, true) }}>
            <ResourceIcon resource={key} size={12} />
          </span>
          {cost[key]}
        </span>
      ))}
    </span>
  );
}
