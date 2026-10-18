import { useMutation, useQuery } from 'convex/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { UPKEEP_UNSUPPLIED_MULTIPLIER } from '../../../convex/constants';
import { aBuilding, fr, roleLabel, upgradeHoldText } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { useMapMotion } from '@/data/mapMotion';
import type { Seat } from '@/data/session';
import { useClock } from '@/shell/clock';
import { notify } from '@/shell/notifications';
import { Price } from '@/shell/Price';
import { Stamp } from '@/shell/Stamp';
import { useNarrowScreen } from '@/shell/viewport';
import { upgradeHold } from '@/domain/construction';
import { asDuration } from '@/domain/duration';
import { PRODUCER_OF, keyRefusal } from '@/domain/economy';
import { harvestOf, pastilleShares, type Harvest } from '@/domain/harvest';
import {
  BUILDABLE_BUILDINGS,
  RESOURCES,
  isOutpostWork,
  type BuildingKey,
  type ResourceKey,
  type UnitRole,
} from '@/domain/ids';
import { unlinkedProducers } from '@/domain/next-actions';
import { currentMinutes, currentStock, type Building, type PlayerView } from '@/domain/player-view';
import { PROJECTION_BY_DOMAIN, recruitRefusalOf } from '@/domain/troops';
import { upkeepStep } from '@/domain/upkeep';
import type { MapMotion } from '@/domain/map-motion';
import { BuildingPlate, ResourcePlate } from '@/emblems/Plate';
import { resourceColor } from '@/emblems/ResourceIcon';
import { UnitSprite } from '@/emblems/UnitSprite';
import { HelpMark } from './HelpMark';
import { LotControl } from './LotControl';

/** What the hand holds: a tile builds or raises, a piece is formed on a projection site. */
type Held =
  | { readonly kind: 'tile'; readonly key: BuildingKey }
  | { readonly kind: 'piece'; readonly role: UnitRole };

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
}: {
  view: PlayerView;
  seat: Seat;
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
  const { held, hint, away, grab, chip } = useHand({
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
          <button
            type="button"
            onClick={() => narrow && setOpen((was) => !was)}
            aria-label={narrow ? (open ? fr.personalBoard.fold : fr.personalBoard.open) : undefined}
            className={`shrink-0 font-(family-name:--font-display) text-[19px] leading-none font-extrabold ${
              narrow ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            {fr.personalBoard.header}
            {narrow && (
              <span aria-hidden className="ml-[6px] text-[12px]">
                {open ? '▾' : '▴'}
              </span>
            )}
          </button>
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                register={(node) => {
                  if (node === null) binRefs.current.delete(resource);
                  else binRefs.current.set(resource, node);
                }}
              />
            ))}
          </div>

          <div className="flex flex-col gap-3 px-3 pt-3 pb-3 md:flex-row md:px-4">
            <Rack title={fr.personalBoard.tilesHeader} note={fr.personalBoard.tilesNote}>
              {tileKeys(view).map((key) => (
                <Tile
                  key={key}
                  buildingKey={key}
                  view={view}
                  lit={key === focusedKey || (held?.kind === 'tile' && held.key === key)}
                  onGrab={observing ? null : (event) => grab({ kind: 'tile', key }, event)}
                />
              ))}
            </Rack>
            <Pieces
              view={view}
              workshop={workshop}
              held={held}
              onGrab={observing ? null : (role, event) => grab({ kind: 'piece', role }, event)}
            />
          </div>

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
            <div className="grid gap-x-5 gap-y-3 px-3 pb-3 md:grid-cols-3 md:px-4">
              <Works view={view} seat={seat} now={now} observing={observing} onSpent={mark} />
              <Upkeep view={view} />
              <Shortages shortages={shortages} />
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
}: {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
  shown: number | null;
  delta: number | null;
  narrow: boolean;
  register: (node: HTMLElement | null) => void;
}) {
  const held = view.me.resources[resource];
  const stock = shown ?? currentStock(held, view.loadedAt, now);
  const full = held.cap > 0 && stock >= held.cap;
  return (
    <div
      ref={register}
      className="relative min-w-0 border border-(color:--ink)/40 bg-white/15 px-[6px] pt-[5px] pb-[7px]"
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
        {full && !narrow ? fr.personalBoard.full : fr.personalBoard.rate(held.ratePerHour)}
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

/** **Une tuile par clé débloquée** — le QG toujours, qu'on pose une fois puis qu'on élève. */
const tileKeys = (view: PlayerView): ReadonlyArray<BuildingKey> =>
  BUILDABLE_BUILDINGS.filter(
    (key) =>
      key === 'hq' ||
      (view.me.hqLevel > 0 &&
        keyRefusal(key, view.me.hqLevel, view.buildCatalog[key].unlockedAtHqLevel) === null),
  );

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

function Tile({
  buildingKey,
  view,
  lit,
  onGrab,
}: {
  buildingKey: BuildingKey;
  view: PlayerView;
  lit: boolean;
  onGrab: ((event: ReactPointerEvent<HTMLElement>) => void) | null;
}) {
  const standing = view.me.buildings.filter((building) => building.key === buildingKey).length;
  const free = view.me.foundation.some((due) => due.key === buildingKey);
  return (
    <div
      onPointerDown={onGrab ?? undefined}
      title={fr.buildings[buildingKey]}
      className={`grid w-[84px] shrink-0 touch-none justify-items-center gap-[3px] border border-[var(--ink)] bg-[#efe5cc] px-[5px] pt-[5px] pb-[6px] shadow-[0_2px_0_var(--ink)] select-none ${
        onGrab === null
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
        {fr.buildings[buildingKey]}
      </b>
      <span className="font-(family-name:--font-mono) text-[10px]">
        {free ? (
          fr.construction.free
        ) : (
          <Price costs={view.buildCatalog[buildingKey].cost} size={10} />
        )}
      </span>
    </div>
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
  onGrab,
}: {
  view: PlayerView;
  workshop: Workshop | undefined;
  held: Held | null;
  onGrab: ((role: UnitRole, event: ReactPointerEvent<HTMLElement>) => void) | null;
}) {
  const roles = (workshop?.grid ?? []).filter(
    (entry) => entry.unlockedAtHqLevel <= view.me.hqLevel,
  );
  const sites = view.me.buildings.some((building) => PROJECTION_KEYS.includes(building.key));
  return (
    <Rack title={fr.personalBoard.piecesHeader} note={fr.personalBoard.piecesNote}>
      {!sites && (
        <p className="w-[210px] shrink-0 self-center text-[11.5px] leading-[1.35] text-[var(--ink-soft)]">
          {fr.personalBoard.piecesNone}
        </p>
      )}
      {roles.map((entry) => (
        <div
          key={entry.role}
          onPointerDown={onGrab === null ? undefined : (event) => onGrab(entry.role, event)}
          title={roleLabel(entry.role, 1)}
          className={`grid w-[74px] shrink-0 touch-none justify-items-center gap-[3px] border border-(color:--ink)/50 px-[4px] pt-[4px] pb-[5px] select-none ${
            onGrab === null ? '' : 'cursor-grab hover:shadow-[0_0_0_2px_var(--ochre)]'
          } ${held?.kind === 'piece' && held.role === entry.role ? 'shadow-[0_0_0_2px_var(--ochre)]' : ''}`}
        >
          <UnitSprite nation={view.me.nation} role={entry.role} height={30} width={60} />
          <b className="w-full truncate text-center text-[11px] leading-none font-semibold">
            {roleLabel(entry.role, 1)}
          </b>
          <span className="font-(family-name:--font-mono) text-[10px]">
            <Price costs={entry.unit.costs} size={10} />
          </span>
        </div>
      ))}
    </Rack>
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
        ) : (
          <UnitSprite nation={view.me.nation} role={held.role} height={34} width={64} />
        )}
      </div>
      {hint !== null && (
        <div
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
 * refus ; au-dessus de sa pareille, le fantôme se range et la main dit « élever ». Une tuile
 * pressée sans glisser reste en main : un clic sur la carte la pose, comme une clé choisie.
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
  const latest = useRef({ view, workshop });
  latest.current = { view, workshop };
  // The release reads the board's callbacks as they are then: the ghost's point is not known at the grab.
  const callbacks = useRef({ onHoldTile, onPlaceTile, onSpent });
  callbacks.current = { onHoldTile, onPlaceTile, onSpent };
  const gesture = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => () => gesture.current?.cancel(), []);

  const grab = (what: Held, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || gesture.current !== null) return;
    event.preventDefault();
    const element = event.currentTarget;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    const origin = element.getBoundingClientRect();
    const from = { x: event.clientX, y: event.clientY };
    let moved = false;
    let armed = false;
    let left = false;
    let lastHint: string | null = null;

    const say = (next: Hint) => {
      const key = next === null ? null : `${next.refused}-${next.text}`;
      if (key === lastHint) return;
      lastHint = key;
      setHint(next);
    };
    const arm = (on: boolean) => {
      if (what.kind !== 'tile' || on === armed) return;
      armed = on;
      callbacks.current.onHoldTile(on ? what.key : null);
    };
    const follow = (x: number, y: number) => {
      if (chip.current) chip.current.style.transform = `translate(${x}px, ${y}px)`;
    };

    setHeld(what);
    follow(from.x, from.y);
    arm(true);
    say(null);

    const move = (drag: PointerEvent) => {
      if (drag.pointerId !== event.pointerId) return;
      if (Math.hypot(drag.clientX - from.x, drag.clientY - from.y) > DRAG_THRESHOLD_PX)
        moved = true;
      follow(drag.clientX, drag.clientY);
      const target = targetAt(drag.clientX, drag.clientY, board.current, latest.current.view);
      const reading = readingOf(what, target, latest.current);
      arm(reading.kind === 'map');
      say(reading.hint);
      if (!left && reading.kind !== 'board') {
        left = true;
        setAway(true);
      }
      // Over the map the ghost is the tile: the one in hand would hide where it goes down.
      if (chip.current)
        chip.current.style.opacity = what.kind === 'tile' && reading.kind === 'map' ? '0' : '';
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
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
            {
              transform: `translate(${origin.left + origin.width / 2}px, ${origin.top + origin.height / 2}px)`,
              opacity: 0.6,
            },
          ];
      node
        .animate(frames, { duration: motion === 'reduced' ? 220 : 480, easing: 'ease-out' })
        .finished.then(done, done);
    };
    const release = (up: PointerEvent) => {
      if (up.pointerId !== event.pointerId) return;
      finish();
      const at = { x: up.clientX, y: up.clientY };
      const target = targetAt(at.x, at.y, board.current, latest.current.view);
      const reading = readingOf(what, target, latest.current);
      // Pressed without a drag, a tile stays in hand: the next click on the map puts it down.
      if (!moved && what.kind === 'tile') {
        setHeld(null);
        setHint(null);
        return;
      }
      if (reading.kind === 'map' && what.kind === 'tile') {
        const placed = callbacks.current.onPlaceTile();
        if (placed) callbacks.current.onSpent();
        else callbacks.current.onHoldTile(null);
        return settle(placed, at);
      }
      arm(false);
      if (reading.kind !== 'act' || reading.hint?.refused !== false) return settle(false, at);
      settle(true, at);
      if (what.kind === 'tile' && reading.building !== null) {
        const building = reading.building;
        start({
          ...seat,
          building: building.key,
          regionId: building.regionId,
          point: { lon: building.point[0], lat: building.point[1] },
        }).then(
          () => {
            callbacks.current.onSpent();
            notify(fr.personalBoard.raised(building.name, building.level + 1), 'info');
          },
          (problem: unknown) => handleError(problem, (said) => notify(said)),
        );
      } else if (what.kind === 'piece' && reading.building !== null) {
        recruit({
          ...seat,
          buildingId: reading.building.id as Id<'buildings'>,
          role: what.role,
          tier: 1,
        }).then(
          () => {
            callbacks.current.onSpent();
            notify(fr.personalBoard.formed(roleLabel(what.role, 1)), 'info');
          },
          (problem: unknown) => handleError(problem, (said) => notify(said)),
        );
      }
    };
    const abandon = () => {
      finish();
      arm(false);
      setHeld(null);
      setHint(null);
    };
    const escape = (key: KeyboardEvent) => {
      if (key.key === 'Escape') abandon();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', abandon);
    window.addEventListener('keydown', escape);
    gesture.current = { cancel: abandon };
  };

  return { held, hint, away, grab, chip };
}

/** What lies under the hand: the personal board itself, one of the player's buildings, or the map. */
type Target =
  | { readonly kind: 'board' }
  | { readonly kind: 'building'; readonly building: Building }
  | { readonly kind: 'map' };

function targetAt(x: number, y: number, board: HTMLElement | null, view: PlayerView): Target {
  const under = document.elementsFromPoint(x, y);
  if (board !== null && under.some((element) => board.contains(element))) return { kind: 'board' };
  for (const element of under) {
    const id = element.closest<HTMLElement>('[data-building-id]')?.dataset.buildingId;
    const building = id === undefined ? undefined : view.me.buildings.find((one) => one.id === id);
    if (building !== undefined) return { kind: 'building', building };
  }
  return { kind: 'map' };
}

/**
 * **Ce que la main lit sous elle**, dans les mots du serveur : une tuile sur sa pareille l'élève
 * (`upgradeHold`), ailleurs sur la carte le fantôme parle ; une pièce sur un site de projection
 * y est formée (`recruitRefusalOf`, puis le prix), ailleurs elle demande un site.
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
  if (held.kind === 'tile') {
    if (target.kind !== 'building' || target.building.key !== held.key) {
      return { kind: 'map', hint: null };
    }
    const building = target.building;
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
  if (target.kind !== 'building' || !PROJECTION_KEYS.includes(target.building.key)) {
    return { kind: 'map', hint: { text: fr.personalBoard.dropOnSite, refused: true } };
  }
  const site = target.building;
  const entry = workshop?.grid.find((candidate) => candidate.role === held.role);
  if (workshop === undefined || entry === undefined) return { kind: 'map', hint: null };
  const refusal = recruitRefusalOf(held.role, site, {
    hqLevel: view.me.hqLevel,
    army: workshop.troopsInService + workshop.troopsQueued,
    siteQueue: workshop.facilities.find((facility) => facility.id === site.id)?.queue.length ?? 0,
    costs: entry.unit.costs,
    stocks: stocksAt(view, Date.now()),
  });
  if (refusal !== null) {
    const { code, ...details } = refusal;
    return { kind: 'act', building: site, hint: { text: fr.errors[code](details), refused: true } };
  }
  return {
    kind: 'act',
    building: site,
    hint: { text: fr.personalBoard.form(roleLabel(held.role, 1), site.name), refused: false },
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
              : ''
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
