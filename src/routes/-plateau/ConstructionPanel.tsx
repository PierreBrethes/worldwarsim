import { useMutation } from 'convex/react';
import { useCallback, useRef, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { handleError } from '@/data/errors';
import { notify } from '@/shell/notifications';
import { keepWindowGeometry, readWindowGeometry } from '@/data/settings';
import { Draggable } from './Draggable';
import { followDrag, scaleOf, type Grab } from './dragging';
import {
  blockedOn,
  buildableOn,
  siteOf,
  type BlockedOption,
  type BlockedReason,
  type BuildOption,
  type BuildReason,
  type Site,
} from '@/domain/construction';
import { asDuration } from '@/domain/duration';
import { RESOURCES, type BuildingKey } from '@/domain/ids';
import type { Cost, PlayerView, SiteRef } from '@/domain/player-view';
import { BuildingPlate, ResourcePlate } from '@/emblems/Plate';
import { Panel } from './Panel';
import type { Seat } from '@/data/session';

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
  seat,
  regionId,
  at,
  onClose,
  onPlace,
  onRaiseOutpost,
}: {
  view: PlayerView;
  seat: Seat;
  regionId: string;
  at: { x: number; y: number };
  onClose: () => void;
  /**
   * **Le port ne se commande pas d'ici** (ADR 0013, révision du 04/09) : il se pose à un point de
   * côte, et le panneau n'a pas de carte. Il rend la main au plateau, qui arme le mode de pose ;
   * ce qui revient est un clic sur le rivage, jamais une ligne de plus dans ce panneau.
   */
  onPlace: (option: BuildOption) => void;
  /** **Le refus « avant-poste plein » mène à la porte, pas à un mur** (précision du 15/09) : la
   *  phrase qui dit « améliorez-le » est désormais ce qui ouvre le panneau du point. */
  onRaiseOutpost: (outpostId: string) => void;
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

  /**
   * **Le seul geste du plateau dont l'effet se produit ailleurs** : le panneau se referme sur la
   * carte, et le chantier commandé n'apparaît qu'en Économie. D'où l'avis.
   *
   * **Sauf pour une clé du socle** : elle est debout à l'instant, sur la région qu'on vient de
   * désigner. Ce qui se voit sous la souris n'a pas besoin qu'on l'annonce.
   */
  const order = (option: BuildOption) => {
    if (option.key === 'port') {
      onPlace(option);
      onClose();
      return;
    }
    setError(null);
    start({ ...seat, building: option.key, regionId }).then(
      () => {
        if (!option.free) notify(fr.construction.queued(fr.buildings[option.key]), 'info');
        onClose();
      },
      (problem: unknown) => handleError(problem, setError),
    );
  };

  return (
    <Draggable
      className="absolute z-[var(--z-popin)]"
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
        onClose={onClose}
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
            decision. **The site's budget, never a national total** (ADR 0020 §10) — the panel
            is opened on one region, and one region hangs from exactly one site. */}
        {site.site !== null && (
          <p className="mt-2 shrink-0 font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
            {fr.construction.budget(siteName(site.site), site.taken, site.slots)}
          </p>
        )}

        <FoundationNotice owed={view.me.foundation} />

        <HeldNotice view={view} site={site} options={options} onRaiseOutpost={onRaiseOutpost} />

        <h3 className="eyebrow mt-3 shrink-0 border-b border-(color:--ink)/30 pb-[4px]">
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
              <h3 className="eyebrow mt-3 border-b border-(color:--ink)/30 pb-[4px] text-[var(--ink-soft)]">
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
        className={`resize-corner absolute z-10 h-[16px] w-[16px] ${fromBottom ? 'top-0' : 'bottom-0'} ${
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
function FoundationNotice({ owed }: { owed: PlayerView['me']['foundation'] }) {
  if (owed.length === 0) return null;

  return (
    <p className="mt-2 shrink-0 border border-[var(--ink)] px-2 py-[6px] text-[11.5px] leading-[1.4] text-[var(--ink)]">
      {fr.construction.foundationNotice(
        owed
          .map((due) =>
            due.deposit === null
              ? fr.mobilization.anywhereAtHome(fr.buildings[due.key])
              : fr.mobilization.onDeposit(fr.buildings[due.key], fr.deposits[due.deposit]),
          )
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
  site,
  options,
  onRaiseOutpost,
}: {
  view: PlayerView;
  site: Site;
  options: ReadonlyArray<BuildOption>;
  onRaiseOutpost: (outpostId: string) => void;
}) {
  const full = options.some((option) => option.hold === 'siteSlots');
  const outpostId = site.site?.outpostId ?? null;
  const held = full
    ? outpostId !== null
      ? fr.construction.heldByOutpostSite(site.slots)
      : fr.construction.heldBySite(fr.construction.siteHome, site.slots, view.me.homeSlotRelief)
    : options.some((option) => option.hold === 'materials')
      ? fr.construction.heldByMaterials
      : null;

  if (held === null) return null;
  /**
   * **La phrase est la porte** (précision du 15/09). « Améliorez-le pour en ouvrir un de plus »
   * décrivait depuis toujours un geste qui n'existait pas ; maintenant qu'il existe, elle y mène
   * — le panneau du point s'ouvre, où l'élévation se commande. Le sol national garde sa phrase
   * seule : ce qui l'élargit est le quartier général, et il a déjà sa ligne ailleurs.
   */
  if (full && outpostId !== null) {
    return (
      <button
        type="button"
        onClick={() => onRaiseOutpost(outpostId)}
        className="mt-2 shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-[6px] text-left text-[11.5px] leading-[1.4] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
      >
        {held}
      </button>
    );
  }
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
      className="flex w-full items-center gap-2 border-b border-(color:--ink)/16 py-[7px] text-left last:border-0 enabled:cursor-pointer enabled:hover:bg-(--ink)/7 disabled:cursor-default"
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
    <div className="flex w-full items-center gap-2 border-b border-(color:--ink)/16 py-[7px] opacity-45 last:border-0">
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
    case 'outOfReach':
      return said.outOfReach;
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

/** The site a region hangs from, named. Ground no living site reaches prints no budget at all
 *  rather than "0 sur 0" — there is nothing there to spend. */
const siteName = (site: SiteRef): string =>
  site.outpostId === null ? fr.construction.siteHome : fr.construction.siteOutpost;
