import { useMutation, useQuery } from 'convex/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  MAX_HQ_LEVEL,
  RESEARCH_SPEC,
  UPKEEP_UNSUPPLIED_MULTIPLIER,
} from '../../../convex/constants';
import { aBuilding, cardName, fr, noBuilding, roleLabel, upgradeHoldText } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { useMapMotion } from '@/data/mapMotion';
import type { Seat } from '@/data/session';
import { useClock } from '@/shell/clock';
import { notify } from '@/shell/notifications';
import { Price } from '@/shell/Price';
import { Stamp } from '@/shell/Stamp';
import { useNarrowScreen } from '@/shell/viewport';
import { placementOf, upgradeHold } from '@/domain/construction';
import { asDuration } from '@/domain/duration';
import { PRODUCER_OF } from '@/domain/economy';
import { harvestOf, pastilleShares, type Harvest } from '@/domain/harvest';
import {
  BUILDABLE_BUILDINGS,
  RESEARCH_CARDS,
  RESOURCES,
  isOutpostWork,
  type BuildingKey,
  type ResearchCard,
  type ResourceKey,
  type UnitRole,
  type UnitTier,
} from '@/domain/ids';
import {
  RESEARCH_TREE,
  comingSoon,
  counterOf,
  countersOf,
  holdsHq,
  researchProgressOf,
  researchRefusalOf,
} from '@/domain/research';
import { unlinkedProducers } from '@/domain/next-actions';
import { currentMinutes, currentStock, type Building, type PlayerView } from '@/domain/player-view';
import { PROJECTION_BY_DOMAIN, recruitRefusalOf, tierLabel } from '@/domain/troops';
import { upkeepStep } from '@/domain/upkeep';
import { isSupplyKey, type SupplyLoad } from '@/domain/logistics';
import type { MapMotion } from '@/domain/map-motion';
import { BuildingPlate, ResourcePlate } from '@/emblems/Plate';
import { resourceColor } from '@/emblems/ResourceIcon';
import { UnitSprite } from '@/emblems/UnitSprite';
import { conditionText } from './FoundationRows';
import { HelpMark } from './HelpMark';
import { LotControl } from './LotControl';

/** What the hand holds: a tile builds or raises, a piece is formed on a projection site, a
 *  research card is put on the headquarters. */
type Held =
  | { readonly kind: 'tile'; readonly key: BuildingKey }
  | { readonly kind: 'piece'; readonly role: UnitRole; readonly tier: UnitTier }
  | { readonly kind: 'card'; readonly card: ResearchCard };

/** What the hand says over where it is: a verb with its bill, or the refusal in red. */
type Hint = { readonly text: string; readonly refused: boolean; readonly cost?: Cost } | null;

type Cost = Readonly<Partial<Record<ResourceKey, number>>>;

type Workshop = FunctionReturnType<typeof api.troops.workshop>;

/** Under this travel a press is a click, not a drag: the tile stays in hand for a click on the map. */
const DRAG_THRESHOLD_PX = 5;

/** How long the deltas of the harvest stay over their store. */
const DELTA_MS = 6000;

/**
 * **Le plateau personnel** (ADR 0028 §7 et sa précision du 18/10) : chaque stock en nombre exact
 * et en barre jusqu'au plafond de l'entrepôt ; à l'ouverture, la récolte tombe en pastilles qui
 * volent vers leur barre ; les tuiles se prennent ici et se lâchent sur la carte pour bâtir, ou
 * sur leur pareille pour l'élever ; les pièces se lâchent sur un site de projection pour y être
 * formées. Il a remplacé la fenêtre Économie : chantiers, entretien par paliers et pénuries avec
 * leur remède s'y lisent au pied.
 *
 * La grammaire est celle des pièces de la carte (`drop-order.ts`) : ce qui s'allume sous la main
 * est ce qu'on prend, un refus se dit en rouge et la pièce rentre.
 */
export function PersonalBoard({
  view,
  seat,
  focused,
  onClose,
  onHoldTile,
  onPlaceTile,
  onTakeTokens,
}: {
  view: PlayerView;
  seat: Seat;
  /** **Charger** (ADR 0028 §4) : des jetons pris dans un bac, glissés sur un transport. */
  onTakeTokens?: (resource: keyof SupplyLoad, event: ReactPointerEvent<HTMLElement>) => void;
  /** The building the board was opened on, from its mast: its tile is lit. */
  focused: string | null;
  onClose: () => void;
  /** Arms the map's ghost for the tile in hand, or disarms it (ADR 0029). */
  onHoldTile: (key: BuildingKey | null) => void;
  /** The tile let go over the map, put down where the ghost stands: `true` when it went. */
  onPlaceTile: () => boolean;
}) {
  const narrow = useNarrowScreen();
  const now = useClock();
  const motion = useMapMotion();
  const board = useRef<HTMLElement>(null);
  const binRefs = useRef(new Map<ResourceKey, HTMLElement>());
  const [open, setOpen] = useState(true);
  const observing = view.me.defeated;

  const { shown, deltas, ledger, mark } = useHarvest(view, seat, motion, binRefs);
  const workshop = useQuery(api.troops.workshop, seat);
  const { held, hint, away, take, chip } = useHand({
    view,
    workshop,
    onSpent: mark,
    seat,
    board,
    motion,
    onHoldTile,
    onPlaceTile,
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && held === null) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [held, onClose]);

  const shortages = shortagesOf(view);
  // A shortage is read with its remedy as soon as the board opens: it is why one comes here.
  const [details, setDetails] = useState(() => shortages.length > 0);
  const focusedKey = view.me.buildings.find((building) => building.id === focused)?.key ?? null;
  const peeking = away || (narrow && !open);

  return (
    <>
      <section
        ref={board}
        aria-label={fr.personalBoard.header}
        className={`hud paper-grain float fixed flex flex-col border border-[var(--ink)] text-[var(--ink)] transition-transform duration-300 ${
          narrow
            ? 'inset-x-0 z-[var(--z-window)] max-h-[62dvh] border-x-0'
            : 'z-[var(--z-band)] max-h-[min(440px,60dvh)]'
        }`}
        style={
          narrow
            ? {
                bottom: 'calc(var(--board-bottom) / var(--hud-scale))',
                transform: peeking ? 'translateY(calc(100% - 46px))' : undefined,
              }
            : {
                transform: peeking ? 'translateY(calc(100% - 46px))' : undefined,
                left: 'calc((var(--board-left) + var(--table-gap)) / var(--hud-scale))',
                bottom: 'calc(var(--table-margin) / var(--hud-scale))',
                width:
                  'min(1100px, calc((100dvw - var(--board-left) - var(--table-gap) - var(--table-margin) - 330px) / var(--hud-scale)))',
              }
        }
      >
        <header className="flex h-[46px] shrink-0 items-center gap-3 border-b border-(color:--ink)/30 px-4">
          {narrow ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((was) => !was)}
              aria-label={open ? fr.personalBoard.fold : fr.personalBoard.open}
              className="shrink-0 cursor-pointer font-(family-name:--font-display) text-[19px] leading-none font-extrabold"
            >
              {fr.personalBoard.header}
              <span aria-hidden className="ml-[6px] text-[12px]">
                {open ? '▾' : '▴'}
              </span>
            </button>
          ) : (
            <h2 className="shrink-0 font-(family-name:--font-display) text-[19px] leading-none font-extrabold">
              {fr.personalBoard.header}
            </h2>
          )}
          <span className="min-w-0 flex-1 truncate font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
            {!narrow && ledger}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer border border-[var(--ink)] px-[10px] py-[5px] text-[10px] font-semibold tracking-[.16em] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" inert={narrow && !open}>
          {narrow && (
            <p className="px-3 pt-2 font-(family-name:--font-mono) text-[10.5px] leading-[1.4] text-[var(--ink-soft)]">
              {ledger}
            </p>
          )}
          <div className="grid grid-cols-5 gap-[6px] px-3 pt-3 md:gap-2 md:px-4">
            {RESOURCES.map((resource) => (
              <Bin
                key={resource}
                resource={resource}
                view={view}
                now={now}
                shown={shown?.[resource] ?? null}
                delta={deltas?.[resource] ?? null}
                narrow={narrow}
                onTake={
                  observing || onTakeTokens === undefined || !isSupplyKey(resource)
                    ? null
                    : (event) => onTakeTokens(resource, event)
                }
                register={(node) => {
                  if (node === null) binRefs.current.delete(resource);
                  else binRefs.current.set(resource, node);
                }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-3 px-3 pt-3 pb-3 md:flex-row md:px-4">
            <Rack title={fr.personalBoard.tilesHeader} note={fr.personalBoard.tilesNote}>
              {BUILDABLE_BUILDINGS.map((key) => (
                <Tile
                  key={key}
                  buildingKey={key}
                  view={view}
                  lit={key === focusedKey || (held?.kind === 'tile' && held.key === key)}
                  onTake={observing ? null : (event) => take({ kind: 'tile', key }, event)}
                />
              ))}
            </Rack>
            <Pieces
              view={view}
              workshop={workshop}
              held={held}
              onTake={
                observing
                  ? null
                  : (role, tier) => (event) => take({ kind: 'piece', role, tier }, event)
              }
            />
          </div>
          <Research
            view={view}
            now={now}
            held={held}
            onTake={observing ? null : (card) => (event) => take({ kind: 'card', card }, event)}
          />

          <button
            type="button"
            aria-expanded={details}
            onClick={() => setDetails((was) => !was)}
            className="flex w-full cursor-pointer flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-(color:--ink)/30 px-3 py-[7px] text-left text-[11.5px] hover:bg-(--ink)/5 md:px-4"
          >
            <span className="eyebrow">{fr.personalBoard.details}</span>
            <span className="min-w-0 truncate text-[var(--ink-soft)]">
              {view.me.construction === null
                ? fr.personalBoard.noWorks
                : fr.personalBoard.works(
                    view.me.construction.name,
                    asDuration(
                      currentMinutes(view.me.construction.minutesLeft, view.loadedAt, now),
                    ),
                    view.me.constructionQueue.length,
                  )}
            </span>
            <span
              className="font-(family-name:--font-mono)"
              style={{
                color: view.me.resources.food.ratePerHour < 0 ? 'var(--critical)' : undefined,
              }}
            >
              {fr.economy.upkeepBalance(view.me.resources.food.ratePerHour)}
            </span>
            <span style={{ color: shortages.length > 0 ? 'var(--critical)' : 'var(--ink-soft)' }}>
              {fr.personalBoard.shortages(shortages.length)}
            </span>
            <span aria-hidden className="ml-auto">
              {details ? '▾' : '▸'}
            </span>
          </button>
          {details && (
            <div className="grid gap-x-5 gap-y-3 px-3 pb-3 md:grid-cols-4 md:px-4">
              <Works view={view} seat={seat} now={now} observing={observing} onSpent={mark} />
              <Upkeep view={view} />
              <Shortages shortages={shortages} />
              <Census view={view} />
            </div>
          )}
          {view.me.chains
            .filter((chain) => chain.commanded && chain.level > 0)
            .map((chain) => (
              <LotControl
                key={chain.by}
                chain={chain}
                seat={seat}
                loadedAt={view.loadedAt}
                now={now}
                observing={observing}
              />
            ))}
        </div>
      </section>
      {createPortal(
        <div
          ref={chip}
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 z-[var(--z-notice)]"
          style={{ display: held === null ? 'none' : 'block' }}
        >
          {held !== null && <Carried held={held} view={view} hint={hint} />}
        </div>,
        document.body,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------
// The stores and their harvest
// ---------------------------------------------------------------------------------------

const stocksAt = (view: PlayerView, now: number): Record<ResourceKey, number> =>
  Object.fromEntries(
    RESOURCES.map((key) => [key, currentStock(view.me.resources[key], view.loadedAt, now)]),
  ) as Record<ResourceKey, number>;

/**
 * **La récolte, une fois par ouverture** : l'écart avec la dernière lecture, pris au montage et
 * jamais repris — la vue change sous les pastilles, la récolte non.
 *
 * Les bacs montrent ce qui est déjà tombé (`shown`) le temps du vol ; « coupées », rien ne vole et
 * les écarts s'affichent seuls ; « réduites », les pastilles naissent au bac sans trajet.
 */
function useHarvest(
  view: PlayerView,
  seat: Seat,
  motion: MapMotion,
  bins: { readonly current: ReadonlyMap<ResourceKey, HTMLElement> },
) {
  const [opened] = useState(() => {
    const at = Date.now();
    return {
      harvest: harvestOf(view.boardRead, stocksAt(view, at), at, view.me.resources),
      first: view.boardRead === null,
    };
  });
  const harvest = opened.harvest;
  const [shown, setShown] = useState<Record<ResourceKey, number> | null>(() =>
    harvest === null || motion === 'off' ? null : before(view, harvest),
  );
  const [deltas, setDeltas] = useState<Partial<Record<ResourceKey, number>> | null>(() =>
    harvest === null || motion !== 'off' ? null : deltasOf(harvest),
  );
  const markRead = useMutation(api.personalBoard.markRead);
  const mark = useCallback(() => void markRead(seat).catch(() => {}), [markRead, seat]);

  /** **Lu à l'ouverture, relu en le quittant** — fermé, démonté ou la page masquée — et après
   *  chaque dépense faite depuis lui : la récolte suivante dit ce qui a bougé depuis qu'on l'a
   *  quitté, jamais le prix de ce qu'on vient d'y acheter. */
  useEffect(() => {
    mark();
    const hidden = () => {
      if (document.visibilityState === 'hidden') mark();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      mark();
    };
  }, [mark]);

  useEffect(() => {
    if (harvest === null || motion === 'off') return;
    const layer = document.createElement('div');
    layer.className = 'pointer-events-none fixed inset-0 z-[var(--z-notice)]';
    document.body.append(layer);
    let live = true;
    const flights = harvest.deltas.flatMap(({ resource, amount }, rank) =>
      pastilleShares(amount).map((share, index) =>
        flyPastille(layer, resource, bins.current.get(resource), amount > 0, motion, {
          delay: 250 + rank * 120 + index * 160,
        }).then(() => {
          if (!live) return;
          setShown(
            (current) =>
              current && {
                ...current,
                [resource]: current[resource] + (amount > 0 ? share : -share),
              },
          );
        }),
      ),
    );
    void Promise.all(flights).then(() => {
      if (!live) return;
      setShown(null);
      setDeltas(deltasOf(harvest));
    });
    return () => {
      live = false;
      layer.remove();
    };
  }, [harvest, motion, bins]);

  useEffect(() => {
    if (deltas === null) return;
    const timer = setTimeout(() => setDeltas(null), DELTA_MS);
    return () => clearTimeout(timer);
  }, [deltas]);

  const ledger =
    harvest === null
      ? opened.first
        ? fr.personalBoard.harvestFirst
        : fr.personalBoard.harvestNone
      : [
          fr.personalBoard.harvest(harvest.hours),
          ...harvest.deltas.map(({ resource, amount, lost }) =>
            [
              `${fr.resources[resource]}${amount === 0 ? '' : ` ${fr.personalBoard.delta(amount)}`}`,
              ...(lost > 0 ? [fr.personalBoard.lost(lost)] : []),
            ].join(', '),
          ),
        ].join(' · ');

  return { shown, deltas, ledger, mark };
}

const before = (view: PlayerView, harvest: Harvest): Record<ResourceKey, number> => {
  const stocks = stocksAt(view, Date.now());
  for (const { resource, amount } of harvest.deltas) stocks[resource] -= amount;
  return stocks;
};

const deltasOf = (harvest: Harvest): Partial<Record<ResourceKey, number>> =>
  Object.fromEntries(
    harvest.deltas
      .filter(({ amount }) => amount !== 0)
      .map(({ resource, amount }) => [resource, amount]),
  );

/**
 * **Une pastille qui tombe dans son bac, ou qui en sort** : un disque à la couleur de la
 * ressource, qui arrive d'au-dessus du plateau personnel — de la table — en arc. Elle montre que
 * ça coule, jamais combien.
 */
function flyPastille(
  layer: HTMLElement,
  resource: ResourceKey,
  bin: HTMLElement | undefined,
  gain: boolean,
  motion: MapMotion,
  { delay }: { delay: number },
): Promise<void> {
  if (bin === undefined) return Promise.resolve();
  const box = bin.getBoundingClientRect();
  const atBin = { x: box.left + box.width / 2, y: box.top + 18 };
  const table = { x: atBin.x + (Math.random() - 0.5) * 120, y: Math.max(40, box.top - 220) };
  const pastille = document.createElement('span');
  pastille.className = 'harvest-pastille';
  pastille.style.setProperty('--pastille', resourceColor(resource, false));
  pastille.style.setProperty('--pastille-rim', resourceColor(resource, true));
  layer.append(pastille);
  const place = (point: { x: number; y: number }, scale = 1) =>
    `translate(${point.x - 9}px, ${point.y - 9}px) scale(${scale})`;
  const [from, to] = gain ? [table, atBin] : [atBin, table];
  const arc = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 40 };
  const frames =
    motion === 'reduced'
      ? [
          { transform: place(atBin), opacity: 0 },
          { transform: place(atBin), opacity: 1, offset: 0.4 },
          { transform: place(atBin), opacity: 0 },
        ]
      : [
          { transform: place(from), opacity: gain ? 1 : 0.9 },
          { transform: place(arc, 1.25), offset: 0.5 },
          { transform: place(to), opacity: gain ? 1 : 0 },
        ];
  return pastille
    .animate(frames, {
      duration: motion === 'reduced' ? 420 : 640,
      delay,
      easing: 'cubic-bezier(.35,.1,.3,1)',
      fill: 'both',
    })
    .finished.then(
      () => pastille.remove(),
      () => pastille.remove(),
    );
}

/**
 * **Un bac** : son nombre exact sur le plafond de l'entrepôt, et une barre jusqu'à lui. Le débit
 * réel dessous, net de ce qui sort ; plein, il le dit — ce qui arrive ensuite est perdu.
 */
function Bin({
  resource,
  view,
  now,
  shown,
  delta,
  narrow,
  register,
  onTake,
}: {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
  shown: number | null;
  delta: number | null;
  narrow: boolean;
  register: (node: HTMLElement | null) => void;
  /** Munitions, pétrole et charbon se prennent ici pour charger un transport. */
  onTake: ((event: ReactPointerEvent<HTMLElement>) => void) | null;
}) {
  const held = view.me.resources[resource];
  const stock = shown ?? currentStock(held, view.loadedAt, now);
  const full = held.cap > 0 && stock >= held.cap;
  /** **Rien ne le produit** : ni bâti, ni en chantier, ni en file — le manque, pas la panne. */
  const missing =
    held.ratePerHour <= 0 &&
    !view.me.buildings.some((building) => building.key === PRODUCER_OF[resource]) &&
    view.me.construction?.key !== PRODUCER_OF[resource] &&
    !view.me.constructionQueue.some((entry) => entry.key === PRODUCER_OF[resource]);
  return (
    <div
      ref={register}
      onPointerDown={onTake ?? undefined}
      title={onTake === null ? undefined : fr.logistics.grab}
      className={`relative min-w-0 border border-(color:--ink)/40 bg-white/15 px-[6px] pt-[5px] pb-[7px]${onTake === null ? '' : ' cursor-grab touch-none'}`}
    >
      <div className="flex min-w-0 items-center gap-[5px]">
        <ResourcePlate resource={resource} height={narrow ? 16 : 20} />
        {!narrow && (
          <span className="truncate text-[11px] font-semibold tracking-[.06em] uppercase">
            {fr.resources[resource]}
          </span>
        )}
      </div>
      <div className="mt-[4px] flex items-baseline gap-[3px] font-(family-name:--font-mono)">
        <span className="text-[13px] font-semibold md:text-[15px]">{Math.floor(stock)}</span>
        {!narrow && (
          <span className="text-[10px] text-[var(--ink-soft)]">
            {fr.personalBoard.ofCap(held.cap)}
          </span>
        )}
      </div>
      <span
        aria-hidden
        className="mt-[3px] block h-[8px] overflow-hidden bg-(--ink)/14 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_35%,transparent)]"
      >
        <i
          className="block h-full transition-[width] duration-500"
          style={{
            width: `${held.cap > 0 ? Math.min(100, (stock / held.cap) * 100) : 0}%`,
            background: resourceColor(resource, true),
          }}
        />
      </span>
      <span
        className="mt-[3px] block truncate font-(family-name:--font-mono) text-[10px]"
        style={{ color: full ? 'var(--notable-paper)' : 'var(--ink-soft)' }}
        title={full ? fr.personalBoard.full : undefined}
      >
        {full && !narrow
          ? fr.personalBoard.full
          : missing
            ? noBuilding(PRODUCER_OF[resource])
            : fr.personalBoard.rate(held.ratePerHour)}
      </span>
      {delta !== null && (
        <span
          className="absolute -top-[10px] right-[4px] px-[4px] py-[2px] font-(family-name:--font-mono) text-[10.5px] leading-none text-[var(--paper)]"
          style={{ background: delta < 0 ? 'var(--critical)' : 'var(--ink)' }}
        >
          {fr.personalBoard.delta(delta)}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Tiles and pieces
// ---------------------------------------------------------------------------------------

/**
 * **Ce qui retient une tuile avant même la carte** : une clé que le QG n'ouvre pas, ou dont aucun
 * point ne prendrait la pose, et qui n'a pas de pareille debout à élever. Sa condition se dit au
 * survol et à la prise, et la tuile rentre (`placementOf`).
 */
function tileRefusalOf(view: PlayerView, key: BuildingKey): string | null {
  if (view.me.buildings.some((building) => building.key === key)) return null;
  const { condition } = placementOf(view, key);
  return condition === null ? null : conditionText(condition);
}

/** Une pièce derrière sa carte dit la carte et rentre, avant même un site. */
function pieceRefusalOf(
  workshop: Workshop | undefined,
  held: { readonly role: UnitRole; readonly tier: UnitTier },
): string | null {
  const entry = workshop?.grid.find((candidate) => candidate.role === held.role);
  const lockedBy = (held.tier === 2 ? entry?.unitTier2 : entry?.unit)?.lockedBy ?? null;
  return lockedBy === null ? null : fr.production.researchLocked(lockedBy);
}

function Rack({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="min-w-0 md:flex-1">
      <div className="flex items-center gap-2 pb-[5px]">
        <span className="eyebrow">{title}</span>
        <HelpMark>{note}</HelpMark>
      </div>
      <div className="flex gap-[7px] overflow-x-auto pb-[4px]">{children}</div>
    </div>
  );
}

/** What a tile or a piece hands the hand: a press of the pointer, or Entrée on its button. */
type Take = (event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>) => void;

/** **Une pièce de la main est un bouton** : le pointeur la prend en glissant, Entrée la met en
 *  main, et le clic qu'un pointeur laisse derrière sa pression ne la reprend pas. */
const takeProps = (take: Take | null) =>
  take === null
    ? {}
    : {
        onPointerDown: take,
        onClick: (event: ReactMouseEvent<HTMLElement>) => {
          if (event.detail === 0) take(event);
        },
      };

function Tile({
  buildingKey,
  view,
  lit,
  onTake,
}: {
  buildingKey: BuildingKey;
  view: PlayerView;
  lit: boolean;
  onTake: Take | null;
}) {
  const standing = view.me.buildings.filter((building) => building.key === buildingKey).length;
  const free = view.me.foundation.some((due) => due.key === buildingKey);
  const refusal = tileRefusalOf(view, buildingKey);
  const name = fr.buildings[buildingKey];
  return (
    <button
      type="button"
      {...takeProps(onTake)}
      title={refusal === null ? name : `${name} — ${refusal}`}
      aria-label={refusal === null ? name : `${name} — ${refusal}`}
      className={`grid w-[84px] shrink-0 touch-none justify-items-center gap-[3px] border border-[var(--ink)] bg-[#efe5cc] px-[5px] pt-[5px] pb-[6px] text-[var(--ink)] shadow-[0_2px_0_var(--ink)] select-none focus-visible:outline-2 focus-visible:outline-[var(--ochre)] ${
        onTake === null
          ? ''
          : 'cursor-grab hover:shadow-[0_0_0_2px_var(--ochre),0_2px_0_var(--ink)]'
      } ${lit ? 'shadow-[0_0_0_2px_var(--ochre),0_2px_0_var(--ink)]' : ''}`}
    >
      <span className="relative">
        <BuildingPlate building={buildingKey} height={30} />
        {standing > 0 && (
          <span className="absolute -top-[4px] -right-[14px] font-(family-name:--font-mono) text-[9.5px] text-[var(--ink-soft)]">
            {fr.personalBoard.tileCount(standing)}
          </span>
        )}
      </span>
      <b className="line-clamp-2 min-h-[2.2em] w-full text-center text-[11px] leading-[1.1] font-semibold">
        {name}
      </b>
      <span className="font-(family-name:--font-mono) text-[10px]">
        {free ? (
          fr.construction.free
        ) : (
          <Price costs={view.buildCatalog[buildingKey].cost} size={10} />
        )}
      </span>
    </button>
  );
}

/**
 * **La réserve de pièces** : une silhouette par rôle que le QG ouvre, son prix dessous. Lâchée sur
 * une caserne, un port ou un aérodrome, elle y commande une troupe — le même ordre que la modale
 * du site, `troops.recruit`, au palier 1.
 */
function Pieces({
  view,
  workshop,
  held,
  onTake,
}: {
  view: PlayerView;
  workshop: Workshop | undefined;
  held: Held | null;
  onTake: ((role: UnitRole, tier: UnitTier) => Take) | null;
}) {
  /** **Chaque pièce, ouverte ou derrière sa carte** : rien n'est caché, la carte se dit au survol
   *  et à la prise (ADR 0028 §5). */
  const pieces = (workshop?.grid ?? []).flatMap((entry) => [
    { role: entry.role, tier: 1 as UnitTier, unit: entry.unit },
    ...(entry.unitTier2 === null
      ? []
      : [{ role: entry.role, tier: 2 as UnitTier, unit: entry.unitTier2 }]),
  ]);
  const sites = view.me.buildings.some((building) => PROJECTION_KEYS.includes(building.key));
  return (
    <Rack title={fr.personalBoard.piecesHeader} note={fr.personalBoard.piecesNote}>
      {!sites && (
        <p className="w-[210px] shrink-0 self-center text-[11.5px] leading-[1.35] text-[var(--ink-soft)]">
          {fr.personalBoard.piecesNone}
        </p>
      )}
      {pieces.map(({ role, tier, unit }) => {
        const name = pieceName(role, tier);
        const title =
          unit.lockedBy === null
            ? name
            : `${name} — ${fr.production.researchLocked(unit.lockedBy)}`;
        return (
          <button
            type="button"
            key={`${role}-${tier}`}
            {...takeProps(onTake === null ? null : onTake(role, tier))}
            title={title}
            aria-label={title}
            className={`grid w-[74px] shrink-0 touch-none justify-items-center gap-[3px] border border-(color:--ink)/50 px-[4px] ${unit.lockedBy === null ? '' : 'border-dashed'} pt-[4px] pb-[5px] text-[var(--ink)] select-none focus-visible:outline-2 focus-visible:outline-[var(--ochre)] ${
              onTake === null ? '' : 'cursor-grab hover:shadow-[0_0_0_2px_var(--ochre)]'
            } ${held?.kind === 'piece' && held.role === role && held.tier === tier ? 'shadow-[0_0_0_2px_var(--ochre)]' : ''}`}
          >
            <UnitSprite nation={view.me.nation} role={role} tier={tier} height={30} width={60} />
            <b className="w-full truncate text-center text-[11px] leading-none font-semibold">
              {name}
            </b>
            <span className="font-(family-name:--font-mono) text-[10px]">
              <Price costs={unit.costs} size={10} />
            </span>
          </button>
        );
      })}
    </Rack>
  );
}

/** `Fantassin`, `Blindé MK2` — la marque seulement quand le rôle en a deux et que c'est la seconde. */
const pieceName = (role: UnitRole, tier: UnitTier): string =>
  tier === 2 ? `${roleLabel(role, 1)} ${tierLabel(2)}` : roleLabel(role, 1);

// ---------------------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------------------

const situationOf = (view: PlayerView, now: number) => ({
  researched: view.me.research.researched,
  running: view.me.research.running?.card ?? null,
  hqHeld: holdsHq(view.me.buildings),
  stocks: stocksAt(view, now),
});

/** Ce qui retient une carte avant même le QG, dit au survol et à la prise : elle rentre. */
function cardRefusalOf(view: PlayerView, card: ResearchCard): string | null {
  const refusal = researchRefusalOf(card, situationOf(view, Date.now()));
  if (refusal === null) return null;
  const { code, ...details } = refusal;
  return fr.errors[code](details);
}

const names = (cards: ReadonlyArray<ResearchCard>): string =>
  cards.map(cardName).join(fr.research.and);

/**
 * **Les cartes de recherche** (ADR 0028 §5), par branche : leur durée, leur prix, ce qu'elles
 * attendent et ce qu'elles contrent. Celle que le QG porte avance dans sa barre ; une acquise
 * porte son tampon ; une carte à venir reste dans l'arbre.
 */
function Research({
  view,
  now,
  held,
  onTake,
}: {
  view: PlayerView;
  now: number;
  held: Held | null;
  onTake: ((card: ResearchCard) => Take) | null;
}) {
  return (
    <div className="px-3 pb-3 md:px-4">
      <div className="flex items-center gap-2 pb-[5px]">
        <span className="eyebrow">{fr.research.header}</span>
        <HelpMark>{fr.research.note}</HelpMark>
      </div>
      <div className="flex gap-[7px] overflow-x-auto pb-[4px]">
        {RESEARCH_CARDS.map((card) => (
          <ResearchCardTile
            key={card}
            card={card}
            view={view}
            now={now}
            lit={held?.kind === 'card' && held.card === card}
            onTake={onTake === null ? null : onTake(card)}
          />
        ))}
      </div>
    </div>
  );
}

function ResearchCardTile({
  card,
  view,
  now,
  lit,
  onTake,
}: {
  card: ResearchCard;
  view: PlayerView;
  now: number;
  lit: boolean;
  onTake: Take | null;
}) {
  const spec = RESEARCH_TREE[card];
  const { hours, cost } = RESEARCH_SPEC[card];
  const done = view.me.research.researched.includes(card);
  const running = view.me.research.running?.card === card ? view.me.research.running : null;
  const progress = running === null ? null : researchProgressOf(running, now);
  const counters = countersOf(card);
  const counter = counterOf(card);
  const refusal = done || running !== null ? null : cardRefusalOf(view, card);
  const name = fr.research.names[card];
  const label = refusal === null ? name : `${name} — ${refusal}`;
  return (
    <button
      type="button"
      {...takeProps(done || running !== null ? null : onTake)}
      title={label}
      aria-label={label}
      data-research-card={card}
      className={`grid w-[150px] shrink-0 touch-none content-start gap-[2px] border bg-[#efe5cc] px-[7px] pt-[5px] pb-[6px] text-left text-[var(--ink)] shadow-[0_2px_0_var(--ink)] select-none focus-visible:outline-2 focus-visible:outline-[var(--ochre)] ${
        comingSoon(card) ? 'border-dashed border-(color:--ink)/60' : 'border-[var(--ink)]'
      } ${onTake === null || done || running !== null ? '' : 'cursor-grab hover:shadow-[0_0_0_2px_var(--ochre),0_2px_0_var(--ink)]'} ${
        lit ? 'shadow-[0_0_0_2px_var(--ochre),0_2px_0_var(--ink)]' : ''
      }`}
    >
      <span className="flex items-baseline justify-between gap-1 text-[9.5px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
        <span>{fr.research.branches[spec.branch]}</span>
        <span className="font-(family-name:--font-mono) tracking-normal">
          {fr.research.hours(hours)}
        </span>
      </span>
      <b className="text-[12.5px] leading-[1.15] font-extrabold">{name}</b>
      <span className="line-clamp-2 text-[10.5px] leading-[1.25] text-[var(--ink-soft)]">
        {fr.research.unlocks[card]}
      </span>
      {spec.after.length > 0 && (
        <span className="text-[10.5px] leading-[1.25]">{fr.research.after(names(spec.after))}</span>
      )}
      {counters.length > 0 && (
        <span className="text-[10.5px] leading-[1.25] text-[var(--interaction)]">
          {fr.research.counters(names(counters))}
        </span>
      )}
      {counter !== null && (
        <span className="text-[10.5px] leading-[1.25] text-[var(--critical)]">
          {fr.research.counteredBy(
            'card' in counter ? cardName(counter.card) : fr.research.atStart(counter.start),
          )}
        </span>
      )}
      <span className="mt-[2px] font-(family-name:--font-mono) text-[10px]">
        {done ? (
          <Stamp label={fr.research.done} size="small" />
        ) : comingSoon(card) ? (
          <Stamp label={fr.research.coming} size="small" />
        ) : progress !== null ? (
          <ResearchGauge share={progress.share} finishesAt={progress.finishesAt} now={now} />
        ) : (
          <Price costs={cost} size={10} />
        )}
      </span>
    </button>
  );
}

/** **Une carte qui avance** : sa barre, et ce qui lui reste — ou qu'elle attend son QG. */
export function ResearchGauge({
  share,
  finishesAt,
  now,
}: {
  share: number;
  finishesAt: number | null;
  now: number;
}) {
  return (
    <span className="block">
      <span className="loading-gauge loading-gauge--march block" data-testid="research-gauge">
        <b style={{ width: `${Math.round(100 * share)}%` }} />
      </span>
      <span
        className="block text-[10px]"
        style={finishesAt === null ? { color: 'var(--critical)' } : undefined}
      >
        {finishesAt === null
          ? fr.research.waiting
          : fr.research.left(asDuration(Math.max(0, (finishesAt - now) / 60_000)))}
      </span>
    </span>
  );
}

const PROJECTION_KEYS: ReadonlyArray<BuildingKey> = Object.values(PROJECTION_BY_DOMAIN);

/** What travels under the hand: the tile or the piece, and what the place under it says. */
function Carried({ held, view, hint }: { held: Held; view: PlayerView; hint: Hint }) {
  return (
    <div className="relative -translate-x-1/2 -translate-y-1/2">
      <div className="grid rotate-[-3deg] justify-items-center border border-[var(--ink)] bg-[#efe5cc] p-[6px] shadow-[0_10px_18px_rgba(0,0,0,.45)]">
        {held.kind === 'tile' ? (
          <BuildingPlate building={held.key} height={34} />
        ) : held.kind === 'card' ? (
          <b className="px-[6px] py-[4px] text-[13px] font-extrabold">
            {fr.research.names[held.card]}
          </b>
        ) : (
          <UnitSprite
            nation={view.me.nation}
            role={held.role}
            tier={held.tier}
            height={34}
            width={64}
          />
        )}
      </div>
      {hint !== null && (
        <div
          role="status"
          className="paper-grain absolute top-[calc(100%+8px)] left-1/2 w-max max-w-[280px] -translate-x-1/2 border border-[var(--ink)] px-[9px] py-[6px] text-[12px] leading-[1.3]"
          style={hint.refused ? { borderColor: 'var(--critical)', color: 'var(--critical)' } : {}}
        >
          <span className="block font-semibold">{hint.text}</span>
          {hint.cost !== undefined && (
            <span className="mt-[2px] block font-(family-name:--font-mono) text-[11px] text-[var(--ink)]">
              <Price costs={hint.cost} size={11} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * **La main** : prendre une tuile ou une pièce, la porter, la lâcher. Suivie à la fenêtre et non
 * à l'élément, et la capture implicite d'un doigt est rendue au pointeur — sans quoi la carte ne
 * verrait pas le doigt passer, et le fantôme ne le suivrait pas.
 *
 * Une tuile au-dessus de la carte arme le fantôme de la pose (ADR 0029), qui dit le prix ou le
 * refus ; au-dessus de sa pareille, le fantôme se range et la main dit « élever ». Pressée sans
 * glisser, ou prise par Entrée, une tuile laisse le fantôme armé : un clic sur la carte la pose,
 * comme une clé choisie. Une pièce, elle, reste en main et se pose au clic suivant sur un mât.
 * Une tuile que rien ne prendrait dit sa condition et rentre.
 */
function useHand({
  view,
  workshop,
  onSpent,
  seat,
  board,
  motion,
  onHoldTile,
  onPlaceTile,
}: {
  view: PlayerView;
  workshop: Workshop | undefined;
  /** A spend made from the board: its reading is renewed, so the next harvest does not bill it. */
  onSpent: () => void;
  seat: Seat;
  board: { readonly current: HTMLElement | null };
  motion: MapMotion;
  onHoldTile: (key: BuildingKey | null) => void;
  onPlaceTile: () => boolean;
}) {
  const [held, setHeld] = useState<Held | null>(null);
  const [hint, setHint] = useState<Hint>(null);
  /** The hand has left the personal board: it folds to its head and gives the map back. */
  const [away, setAway] = useState(false);
  const chip = useRef<HTMLDivElement>(null);
  const start = useMutation(api.constructions.start);
  const recruit = useMutation(api.troops.recruit);
  const research = useMutation(api.research.start);
  const latest = useRef({ view, workshop });
  latest.current = { view, workshop };
  // The release reads the board's callbacks as they are then: the ghost's point is not known at the grab.
  const callbacks = useRef({ onHoldTile, onPlaceTile, onSpent });
  callbacks.current = { onHoldTile, onPlaceTile, onSpent };
  const gesture = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => () => gesture.current?.cancel(), []);

  const take = (
    what: Held,
    event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
  ): void => {
    if (event.button !== 0) return;
    gesture.current?.cancel();
    event.preventDefault();
    const element = event.currentTarget;
    const pointerId = 'pointerId' in event ? event.pointerId : null;
    if (pointerId !== null && element.hasPointerCapture(pointerId))
      element.releasePointerCapture(pointerId);
    const origin = element.getBoundingClientRect();
    const home = { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2 };
    const from = pointerId === null ? home : { x: event.clientX, y: event.clientY };
    const refusal =
      what.kind === 'tile'
        ? tileRefusalOf(latest.current.view, what.key)
        : what.kind === 'card'
          ? cardRefusalOf(latest.current.view, what.card)
          : pieceRefusalOf(latest.current.workshop, what);
    let mode: 'drag' | 'click' = pointerId === null ? 'click' : 'drag';
    let moved = false;
    let armed = false;
    let left = false;
    let pressed = false;
    let lastHint: string | null = null;

    const say = (next: Hint) => {
      const key = next === null ? null : `${next.refused}-${next.text}`;
      if (key === lastHint) return;
      lastHint = key;
      setHint(next);
    };
    const arm = (on: boolean) => {
      if (what.kind !== 'tile' || refusal !== null || on === armed) return;
      armed = on;
      callbacks.current.onHoldTile(on ? what.key : null);
    };
    const follow = (x: number, y: number) => {
      if (chip.current) chip.current.style.transform = `translate(${x}px, ${y}px)`;
    };
    const leave = () => {
      if (left) return;
      left = true;
      setAway(true);
    };

    const hover = (x: number, y: number) => {
      follow(x, y);
      if (refusal !== null) return;
      const reading = readingOf(
        what,
        targetAt(x, y, board.current, latest.current.view),
        latest.current,
      );
      arm(reading.kind === 'map');
      say(reading.hint);
      if (reading.kind !== 'board') leave();
      // Over the map the ghost is the tile: the one in hand would hide where it goes down.
      if (chip.current)
        chip.current.style.opacity = what.kind === 'tile' && reading.kind === 'map' ? '0' : '';
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', clickUp, true);
      window.removeEventListener('pointercancel', abandon);
      window.removeEventListener('keydown', escape);
      gesture.current = null;
      setAway(false);
    };
    const settle = (landed: boolean, at: { x: number; y: number }) => {
      const node = chip.current;
      if (node !== null) node.style.opacity = '';
      const done = () => {
        if (node !== null) node.style.opacity = '';
        setHeld(null);
        setHint(null);
      };
      if (node === null || motion === 'off') return done();
      const frames = landed
        ? [
            { transform: `translate(${at.x}px, ${at.y}px) scale(1.3)` },
            { transform: `translate(${at.x}px, ${at.y}px) scale(1)`, offset: 0.45 },
            { transform: `translate(${at.x}px, ${at.y}px) scale(.35)`, opacity: 0 },
          ]
        : [
            { transform: `translate(${at.x}px, ${at.y}px)` },
            { transform: `translate(${at.x - 7}px, ${at.y}px)`, offset: 0.12 },
            { transform: `translate(${at.x + 6}px, ${at.y}px)`, offset: 0.24 },
            { transform: `translate(${home.x}px, ${home.y}px)`, opacity: 0.6 },
          ];
      node
        .animate(frames, { duration: motion === 'reduced' ? 220 : 480, easing: 'ease-out' })
        .finished.then(done, done);
    };

    /** The hand opens at a point: what it holds goes down there, or goes back. */
    const drop = (at: { x: number; y: number }) => {
      finish();
      if (refusal !== null) {
        say({ text: refusal, refused: true });
        return settle(false, at);
      }
      const reading = readingOf(
        what,
        targetAt(at.x, at.y, board.current, latest.current.view),
        latest.current,
      );
      if (reading.kind === 'map' && what.kind === 'tile') {
        const placed = callbacks.current.onPlaceTile();
        if (placed) callbacks.current.onSpent();
        else callbacks.current.onHoldTile(null);
        return settle(placed, at);
      }
      arm(false);
      say(reading.hint);
      if (reading.kind !== 'act' || reading.hint?.refused !== false || reading.building === null)
        return settle(false, at);
      settle(true, at);
      const building = reading.building;
      const spent = (said: string) => {
        callbacks.current.onSpent();
        notify(said, 'info');
      };
      const refused = (problem: unknown) => handleError(problem, (said) => notify(said));
      if (what.kind === 'tile') {
        start({
          ...seat,
          building: building.key,
          regionId: building.regionId,
          point: { lon: building.point[0], lat: building.point[1] },
        }).then(() => spent(fr.personalBoard.raised(building.name, building.level + 1)), refused);
      } else if (what.kind === 'card') {
        research({ ...seat, card: what.card }).then(
          () => spent(fr.research.started(cardName(what.card))),
          refused,
        );
      } else {
        recruit({
          ...seat,
          buildingId: building.id as Id<'buildings'>,
          role: what.role,
          tier: what.tier,
        }).then(() => spent(fr.personalBoard.formed(pieceName(what.role, what.tier))), refused);
      }
    };

    /** Taken without a drag, a tile leaves the ghost armed and the hand empty; a piece stays in
     *  hand for the next click, and the map is given back. */
    const toClick = () => {
      if (what.kind === 'tile' && refusal === null) {
        finish();
        setHeld(null);
        setHint(null);
        return;
      }
      if (refusal !== null) return drop(home);
      mode = 'click';
      say({
        text: what.kind === 'card' ? fr.research.dropOnHq : fr.personalBoard.dropOnSite,
        refused: false,
      });
      leave();
    };

    function move(event: PointerEvent) {
      if (mode === 'drag' && event.pointerId !== pointerId) return;
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > DRAG_THRESHOLD_PX)
        moved = true;
      hover(event.clientX, event.clientY);
    }
    function up(event: PointerEvent) {
      if (mode !== 'drag' || event.pointerId !== pointerId) return;
      if (!moved) return toClick();
      drop({ x: event.clientX, y: event.clientY });
    }
    /** In click mode the next press belongs to the hand: neither the map nor a mast hears it. */
    function down(event: PointerEvent) {
      if (mode !== 'click') return;
      event.stopPropagation();
      event.preventDefault();
      if (event.button !== 0) return abandon();
      pressed = true;
      hover(event.clientX, event.clientY);
    }
    function clickUp(event: PointerEvent) {
      if (mode !== 'click' || !pressed) return;
      event.stopPropagation();
      const swallow = (click: MouseEvent) => {
        click.stopPropagation();
        click.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
      drop({ x: event.clientX, y: event.clientY });
    }
    function abandon() {
      finish();
      arm(false);
      setHeld(null);
      setHint(null);
    }
    function escape(key: KeyboardEvent) {
      if (key.key === 'Escape') abandon();
    }

    setHeld(what);
    follow(from.x, from.y);
    arm(true);
    say(refusal === null ? null : { text: refusal, refused: true });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', clickUp, true);
    window.addEventListener('pointercancel', abandon);
    window.addEventListener('keydown', escape);
    gesture.current = { cancel: abandon };
    if (mode === 'click') toClick();
  };

  return { held, hint, away, take, chip };
}

/** What lies under the hand: the personal board itself, the player's buildings at one mast (a
 *  grouped mast names several), or the map. */
type Target =
  | { readonly kind: 'board' }
  | { readonly kind: 'buildings'; readonly buildings: ReadonlyArray<Building> }
  | { readonly kind: 'map' };

function targetAt(x: number, y: number, board: HTMLElement | null, view: PlayerView): Target {
  const under = document.elementsFromPoint(x, y);
  if (board !== null && under.some((element) => board.contains(element))) return { kind: 'board' };
  for (const element of under) {
    const ids = element.closest<HTMLElement>('[data-building-id]')?.dataset.buildingId?.split(',');
    const buildings = view.me.buildings.filter((one) => ids?.includes(one.id) === true);
    if (buildings.length > 0) return { kind: 'buildings', buildings };
  }
  return { kind: 'map' };
}

/**
 * **Ce que la main lit sous elle**, dans les mots du serveur : une tuile sur sa pareille l'élève
 * (`upgradeHold`), ailleurs sur la carte le fantôme parle ; une pièce sur un site de projection
 * y est formée (`recruitRefusalOf`), ailleurs elle demande un site. Sur un mât regroupé, la
 * tuile vise sa pareille, la pièce le premier site qui la forme.
 */
function readingOf(
  held: Held,
  target: Target,
  { view, workshop }: { view: PlayerView; workshop: Workshop | undefined },
):
  | { readonly kind: 'board'; readonly hint: Hint }
  | { readonly kind: 'map'; readonly hint: Hint }
  | { readonly kind: 'act'; readonly hint: Hint; readonly building: Building | null } {
  if (target.kind === 'board') {
    return { kind: 'board', hint: { text: fr.personalBoard.dropBack, refused: false } };
  }
  const under = target.kind === 'buildings' ? target.buildings : [];
  if (held.kind === 'tile') {
    const building = under.find((candidate) => candidate.key === held.key);
    if (building === undefined) return { kind: 'map', hint: null };
    const hold = upgradeHold(building, view, Date.now());
    return {
      kind: 'act',
      building,
      hint:
        hold === null
          ? {
              text: fr.personalBoard.raise(building.name, building.level + 1),
              refused: false,
              cost: building.nextLevelCost,
            }
          : { text: upgradeHoldText(hold), refused: true },
    };
  }
  if (held.kind === 'card') {
    const hq = under.find((candidate) => candidate.key === 'hq');
    if (hq === undefined)
      return { kind: 'map', hint: { text: fr.research.dropOnHq, refused: true } };
    const refusal = researchRefusalOf(held.card, situationOf(view, Date.now()));
    if (refusal !== null) {
      const { code, ...details } = refusal;
      return { kind: 'act', building: hq, hint: { text: fr.errors[code](details), refused: true } };
    }
    return {
      kind: 'act',
      building: hq,
      hint: {
        text: fr.research.start(cardName(held.card), RESEARCH_SPEC[held.card].hours),
        refused: false,
        cost: RESEARCH_SPEC[held.card].cost,
      },
    };
  }
  const entry = workshop?.grid.find((candidate) => candidate.role === held.role);
  const unit = held.tier === 2 ? entry?.unitTier2 : entry?.unit;
  const sites = under.filter((candidate) => PROJECTION_KEYS.includes(candidate.key));
  if (sites.length === 0 || workshop === undefined || unit == null) {
    return { kind: 'map', hint: { text: fr.personalBoard.dropOnSite, refused: true } };
  }
  const refusalAt = (site: Building) =>
    recruitRefusalOf(held.role, held.tier, site, {
      researched: view.me.research.researched,
      army: workshop.troopsInService + workshop.troopsQueued,
      siteQueue: workshop.facilities.find((facility) => facility.id === site.id)?.queue.length ?? 0,
      costs: unit.costs,
      stocks: stocksAt(view, Date.now()),
    });
  const site = sites.find((candidate) => refusalAt(candidate) === null) ?? sites[0]!;
  const refusal = refusalAt(site);
  if (refusal !== null) {
    const { code, ...details } = refusal;
    return { kind: 'act', building: site, hint: { text: fr.errors[code](details), refused: true } };
  }
  return {
    kind: 'act',
    building: site,
    hint: {
      text: fr.personalBoard.form(pieceName(held.role, held.tier), site.name),
      refused: false,
    },
  };
}

// ---------------------------------------------------------------------------------------
// The foot: works, upkeep, shortages
// ---------------------------------------------------------------------------------------

function Foot({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="eyebrow block pb-[4px]">{title}</span>
      {children}
    </div>
  );
}

/**
 * **Le chantier en tête et la file derrière** : la seule échéance est celle de la tête ; une ligne
 * en file se retire et se rembourse, un chantier commencé non (`constructions.cancel`).
 */
function Works({
  view,
  seat,
  now,
  observing,
  onSpent,
}: {
  view: PlayerView;
  seat: Seat;
  now: number;
  observing: boolean;
  onSpent: () => void;
}) {
  const drop = useMutation(api.constructions.cancel);
  const [error, setError] = useState<string | null>(null);
  const running = view.me.construction;
  return (
    <Foot title={fr.personalBoard.worksHeader}>
      {running === null ? (
        <p className="text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
          {fr.economy.constructionNone}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          {!isOutpostWork(running.key) && <BuildingPlate building={running.key} height={22} />}
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
            {running.name}{' '}
            <span className="font-normal text-[var(--ink-soft)]">{running.regionName}</span>
          </span>
          <span className="shrink-0 font-(family-name:--font-mono) text-[12px]">
            {asDuration(currentMinutes(running.minutesLeft, view.loadedAt, now))}
          </span>
        </div>
      )}
      {view.me.constructionQueue.length > 0 && (
        <p className="mt-[5px] text-[10px] tracking-[.12em] text-[var(--ink-soft)] uppercase">
          {fr.personalBoard.queueHeader(view.me.constructionQueue.length)}
        </p>
      )}
      {view.me.constructionQueue.map((entry, index) => (
        <div key={entry.id} className="mt-[3px] flex items-center gap-2 text-[11.5px]">
          <span className="w-[20px] font-(family-name:--font-mono) text-[var(--ink-quiet)]">
            {fr.economy.queueRank(index + 2)}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {entry.name}{' '}
            <span className="text-[var(--ink-soft)]">· {fr.economy.queueLevel(entry.level)}</span>
          </span>
          {!observing && (
            <button
              type="button"
              title={fr.economy.queueCancelTitle}
              onClick={() => {
                setError(null);
                drop({ ...seat, constructionId: entry.id as Id<'constructions'> }).then(
                  onSpent,
                  (problem: unknown) => handleError(problem, setError),
                );
              }}
              className="cursor-pointer text-[10px] tracking-[.14em] uppercase underline underline-offset-2 hover:text-[var(--critical)]"
            >
              {fr.economy.queueCancel}
            </button>
          )}
        </div>
      ))}
      {error !== null && <p className="pt-1 text-[11px] text-[var(--critical)]">{error}</p>}
    </Foot>
  );
}

/**
 * **Ce que l'armée et l'empire mangent** : les troupes et leur palier (ADR 0028 §2), les
 * avant-postes debout, les écoutes au charbon, puis le solde de vivres — déjà net sur le bac.
 */
function Upkeep({ view }: { view: PlayerView }) {
  const { troops, unsupplied, foodPerHour, outpostFoodPerHour, listeningCoalPerHour, outposts } =
    view.me.upkeep;
  const step = upkeepStep(troops);
  const balance = view.me.resources.food.ratePerHour;
  const line = (label: string, drain: string, note?: string) => (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="min-w-0">
        {label}
        {note !== undefined && (
          <span className="block text-[10.5px] text-[var(--ink-soft)]">{note}</span>
        )}
      </span>
      <span className="shrink-0 font-(family-name:--font-mono) text-[11.5px] text-[var(--critical)]">
        {drain}
      </span>
    </div>
  );
  return (
    <Foot title={fr.personalBoard.upkeepHeader}>
      {troops > 0 &&
        line(
          fr.economy.upkeepTroops(troops),
          fr.economy.upkeepDrain(foodPerHour),
          `${fr.economy.upkeepStep(step.rate, step.nextAt, step.nextRate)}${
            unsupplied > 0
              ? ` · ${fr.economy.upkeepUnsupplied(unsupplied, UPKEEP_UNSUPPLIED_MULTIPLIER)}`
              : ` · ${fr.personalBoard.allSupplied}`
          }`,
        )}
      {outpostFoodPerHour > 0 &&
        line(fr.economy.upkeepOutposts(outposts), fr.economy.upkeepDrain(outpostFoodPerHour))}
      {listeningCoalPerHour > 0 &&
        line(fr.economy.upkeepListening, fr.economy.upkeepCoalDrain(listeningCoalPerHour))}
      <div
        className="mt-[3px] border-t border-(color:--ink)/25 pt-[3px] text-right font-(family-name:--font-mono) text-[12.5px]"
        style={{ color: balance < 0 ? 'var(--critical)' : 'var(--ink)' }}
      >
        {fr.economy.upkeepBalance(balance)}
      </div>
    </Foot>
  );
}

type Shortage =
  | { readonly key: string; readonly said: string; readonly fix: string | null }
  | { readonly key: 'unlinked'; readonly cut: number };

/** **Une pénurie se dit avec ce qui la répare** : on ne perd jamais le joueur (ADR 0028 §1). */
function shortagesOf(view: PlayerView): ReadonlyArray<Shortage> {
  const cut = unlinkedProducers(view).length;
  return [
    ...(view.me.starving ? [{ key: 'food', said: fr.economy.upkeepStarving, fix: null }] : []),
    ...(view.me.upkeep.listeningSilent
      ? [
          {
            key: 'listening',
            said: `${fr.buildings.listening} ${fr.economy.listeningSilent}`,
            fix: fr.economy.listeningSilentFix,
          },
        ]
      : []),
    ...view.me.chains.flatMap((chain) =>
      chain.level > 0 && chain.state === 'starved' && chain.missing !== null
        ? [
            {
              key: chain.by,
              said: fr.personalBoard.starvedChain(
                fr.buildings[chain.by],
                fr.resources[chain.missing],
              ),
              fix: fr.personalBoard.starvedChainFix(aBuilding(PRODUCER_OF[chain.missing])),
            },
          ]
        : [],
    ),
    ...(cut > 0 ? [{ key: 'unlinked' as const, cut }] : []),
  ];
}

function Shortages({ shortages }: { shortages: ReadonlyArray<Shortage> }) {
  return (
    <Foot title={fr.personalBoard.shortagesHeader}>
      {shortages.length === 0 && (
        <p className="text-[11.5px] text-[var(--ink-soft)]">{fr.personalBoard.noShortage}</p>
      )}
      {shortages.map((item) =>
        'cut' in item ? (
          <div key={item.key} className="flex items-center gap-2 pt-[2px]">
            <Stamp label={fr.stamps.unlinked} tone="critical" size="small" />
            <span className="text-[11px] leading-[1.35] text-[var(--critical)]">
              {fr.economy.unlinkedSites(item.cut)}
            </span>
          </div>
        ) : (
          <p key={item.key} className="pb-[3px] text-[11.5px] leading-[1.4] text-[var(--critical)]">
            <span className="font-semibold">{item.said}</span>
            {item.fix !== null && <span className="text-[var(--ink-soft)]"> — {item.fix}</span>}
          </p>
        ),
      )}
    </Foot>
  );
}

/**
 * **Le recensement** : le QG et ce qu'il porte, puis chaque bâtiment debout — sa région, son
 * niveau et ce qu'il fait, l'écoute avec sa note, l'arsenal débordé quand son bac est plein.
 */
function Census({ view }: { view: PlayerView }) {
  const hq = view.me.buildings.find((building) => building.key === 'hq') ?? null;
  const others = view.me.buildings.filter((building) => building.key !== 'hq');
  const region = (regionId: string) =>
    view.me.regions.find((candidate) => candidate.id === regionId)?.name ?? regionId;
  const chain = (key: BuildingKey) => view.me.chains.find((candidate) => candidate.by === key);
  return (
    <Foot title={fr.personalBoard.censusHeader}>
      {hq === null ? (
        <p className="text-[11.5px] leading-[1.4] text-[var(--critical)]">
          {fr.personalBoard.hqMissing}
        </p>
      ) : (
        <p className="text-[12px] leading-[1.4]">
          <span className="font-semibold">{fr.buildings.hq}</span>{' '}
          <span className="text-[var(--ink-soft)]">
            {fr.personalBoard.hqLine(view.me.hqLevel, MAX_HQ_LEVEL, view.me.slots.total)}
          </span>
        </p>
      )}
      {others.map((building) => (
        <p key={building.id} className="mt-[3px] text-[11.5px] leading-[1.35]">
          <span className="font-semibold">{fr.buildings[building.key]}</span>{' '}
          <span className="font-(family-name:--font-mono) text-[10.5px]">
            {fr.common.levelShort(building.level)}
          </span>{' '}
          <span className="text-[var(--ink-soft)]">· {region(building.regionId)} · </span>
          {building.key === 'listening' ? (
            view.me.upkeep.listeningSilent ? (
              <span className="text-[var(--critical)]">{fr.economy.listeningSilent}</span>
            ) : (
              <span className="text-[var(--ink-soft)]">
                {fr.personalBoard.listeningUnfigured}{' '}
                <HelpMark>{fr.personalBoard.listeningTemporary}</HelpMark>
              </span>
            )
          ) : (
            <span className="text-[var(--ink-soft)]">{fr.buildingEffects[building.key]}</span>
          )}
          {chain(building.key)?.state === 'overflowing' && (
            <span className="text-[var(--notable-paper)]"> · {fr.personalBoard.overflowing}</span>
          )}
        </p>
      ))}
    </Foot>
  );
}
