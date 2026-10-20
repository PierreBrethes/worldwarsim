import { useMutation, useQuery } from 'convex/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { spedMinutes, speedsUp, worksMinutes } from '@/domain/level-speed';
import { countdownLabel, fr, roleLabel, upgradeHoldText } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { useMapMotion } from '@/data/mapMotion';
import type { Seat } from '@/data/session';
import { useClock } from '@/shell/clock';
import { bindSpots, centreOf, flightLayer, flyPastille, spent as flySpent } from '@/shell/flights';
import { notify } from '@/shell/notifications';
import { Price } from '@/shell/Price';
import { CueBubble } from '@/shell/CueBubble';
import { useNarrowScreen } from '@/shell/viewport';
import { placementOf, upgradeHold } from '@/domain/construction';
import { harvestOf, pastilleShares, type Harvest } from '@/domain/harvest';
import {
  BUILDABLE_BUILDINGS,
  RESOURCES,
  type BuildingKey,
  type ResourceKey,
  type UnitRole,
  type UnitTier,
} from '@/domain/ids';
import { currentMinutes, currentStock, type Building, type PlayerView } from '@/domain/player-view';
import { projectionKeyOf, recruitRefusalOf, tierLabel, type RecruitRefusal } from '@/domain/troops';
import { isSupplyKey, type SupplyLoad } from '@/domain/logistics';
import type { MapMotion } from '@/domain/map-motion';
import { BuildingPlate, ResourcePlate } from '@/emblems/Plate';
import { ResourceIcon, resourceColor } from '@/emblems/ResourceIcon';
import { UnitSprite } from '@/emblems/UnitSprite';
import { conditionText } from './FoundationRows';
import { LotControl } from './LotControl';
import { pressRail } from './rail-gesture';

/** What the hand says over where it is: a verb with its bill, or the refusal in red. */
type Hint = { readonly text: string; readonly refused: boolean; readonly cost?: Cost } | null;

type Cost = Readonly<Partial<Record<ResourceKey, number>>>;

/** Under this travel a press is a click, not a drag: the tile stays in hand for a click on the map. */
const DRAG_THRESHOLD_PX = 5;

/** The air left between the band and what rises over it. */
const MAT_GAP_PX = 8;

/** The room the folded band leaves to the protractor's corner, on the phone. */
const CORNER_ROOM = 'calc(72px + var(--safe-right) / var(--hud-scale))';

/**
 * **Le plateau personnel, en sous-main** (issue #122, maquette B) : une bande sur toute la largeur
 * au pied de la table. Repliée, elle tient en une ligne qui garde les bacs — on en glisse des
 * jetons sur un transport sans la déplier —, le chantier en tête et la récolte. Dépliée, les bacs
 * en jauges jusqu'au plafond de l'entrepôt, le rang des tuiles de bâtiments qu'on fait défiler,
 * et la file des chantiers. Un site de projection sélectionné sur la carte y met ses cartes de
 * troupes et sa file de formation (#163). Les consommations vivent dans les tickets du bandeau
 * (#121). « Recherche » ouvre la fenêtre de l'arbre (#123).
 *
 * La grammaire est celle des pièces de la carte (`drop-order.ts`) : ce qui s'allume sous la main
 * est ce qu'on prend, un refus se dit en rouge et la pièce rentre.
 */
export function PersonalBoard({
  view,
  seat,
  open,
  research,
  front,
  focused,
  site,
  onDeselectSite,
  onOpenSiteSheet,
  onOpen,
  onResearch,
  onHoldTile,
  onPlaceTile,
  placing,
  onTakeTokens,
  cue = null,
}: {
  view: PlayerView;
  seat: Seat;
  /** Dépliée : la fenêtre `personalBoard` de l'adresse, que « Écon. » bascule. */
  open: boolean;
  onOpen: (open: boolean) => void;
  /** **La fenêtre de l'arbre ouverte** (#123) : la bande se replie devant elle. */
  research: boolean;
  onResearch: (open: boolean) => void;
  /** Aucune fenêtre n'est devant la bande : Échap est à elle. */
  front: boolean;
  /** **La bulle des premiers pas** (ADR 0027 §2) : l'étagère où se prend le geste du pas allumé. */
  cue?: { readonly rack: 'tiles' | 'research'; readonly text: string } | null;
  /** **Charger** (ADR 0028 §4) : des jetons pris dans un bac, glissés sur un transport. */
  onTakeTokens?: (resource: keyof SupplyLoad, event: ReactPointerEvent<HTMLElement>) => void;
  /** The building the board was opened on, from its mast: its tile is lit. */
  focused: string | null;
  /** **Le site de projection sélectionné** (#163) : la bande montre ce qu'il forme. */
  site: Building | null;
  /** Échap, ou la croix de la bande : la bande revient aux tuiles. */
  onDeselectSite: () => void;
  /** « fiche du site » : garnison, niveau, élever. */
  onOpenSiteSheet: () => void;
  /** Arms the map's ghost for the tile in hand, or disarms it (ADR 0029). */
  onHoldTile: (key: BuildingKey | null) => void;
  /** The tile let go over the map, put down where the ghost stands: `true` when it went. */
  onPlaceTile: () => boolean;
  /** The building whose ghost the map holds: its tile is lit, and Échap is the ghost's. */
  placing: BuildingKey | null;
}) {
  const narrow = useNarrowScreen();
  const now = useClock();
  const motion = useMapMotion();
  const board = useRef<HTMLElement>(null);
  const binRefs = useRef(new Map<ResourceKey, HTMLElement>());
  const observing = view.me.defeated;

  const { shown, harvest, ledger, mark, replay } = useHarvest(view, seat, motion, binRefs);
  // Les échanges payent d'un bac, ou du bandeau quand la bande n'en montre pas.
  useEffect(
    () =>
      bindSpots({
        bin: (resource) => {
          const nodes = document.querySelectorAll<HTMLElement>(`[data-bin="${resource}"]`);
          const seen = [...nodes].map(centreOf).find((at) => onScreen(at));
          return seen ?? (board.current === null ? null : centreOf(board.current));
        },
      }),
    [],
  );
  const { held, hint, away, take, chip } = useHand({
    view,
    onSpent: mark,
    seat,
    board,
    motion,
    onHoldTile,
    onPlaceTile,
  });
  /** La main qui quitte la bande lui rend la carte : elle se replie le temps du geste. */
  const folded = !open || research || away;
  const handleRef = useRef<HTMLButtonElement>(null);
  useMatRise(board, `${folded}-${research}-${cue?.text ?? ''}`);

  // Escape lets the selected site go, or folds the band, when no window stands in front of it.
  const selected = site !== null;
  useEffect(() => {
    if (!front || !open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || held !== null || placing !== null) return;
      if (selected) onDeselectSite();
      else onOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [front, held, placing, open, onOpen, selected, onDeselectSite]);

  // Folded, the focus that was inside the band (or that it took to the body) goes to its handle.
  const wasFolded = useRef(folded);
  useEffect(() => {
    const was = wasFolded.current;
    wasFolded.current = folded;
    if (was || !folded || away) return;
    const active = document.activeElement;
    if (active === null || active === document.body || board.current?.contains(active))
      handleRef.current?.focus({ preventScroll: true });
  }, [folded, away]);

  const focusedKey = view.me.buildings.find((building) => building.id === focused)?.key ?? null;

  const bin = (resource: ResourceKey) => ({
    resource,
    view,
    now,
    shown: shown?.[resource] ?? null,
    onTake:
      observing || onTakeTokens === undefined || !isSupplyKey(resource)
        ? null
        : (event: ReactPointerEvent<HTMLElement>) => onTakeTokens(resource, event),
    register: (node: HTMLElement | null) => {
      if (node === null) binRefs.current.delete(resource);
      else binRefs.current.set(resource, node);
    },
  });
  const rackCue = cue !== null && cue.rack !== 'research' ? cue.text : null;
  const researchCue = cue?.rack === 'research' ? cue.text : null;
  const unfoldCued = rackCue !== null && folded && !research;

  /** Au téléphone, repliée, la bande tient sur une rangée : la poignée n'y garde que sa flèche. */
  const compact = narrow && folded;
  const handle = (
    <button
      ref={handleRef}
      type="button"
      aria-expanded={!folded}
      onClick={() => {
        onResearch(false);
        onOpen(folded);
      }}
      className={`relative cursor-pointer font-(family-name:--font-display) text-[15px] leading-none font-bold whitespace-nowrap hover:bg-(--ink)/8 ${
        compact
          ? 'shrink-0 self-stretch border-r border-(color:--ink)/35 px-[5px]'
          : narrow
            ? 'flex-1 px-3 py-[10px] text-center'
            : 'self-stretch border-r border-[var(--ink)] px-3'
      } ${unfoldCued && !narrow ? 'first-step-ring' : ''}`}
    >
      <span className={compact ? 'sr-only' : undefined}>{fr.personalBoard.header}</span>
      <span aria-hidden className="ml-[6px] font-(family-name:--font-body) text-[11px]">
        {folded ? '▴' : '▾'}
      </span>
      {/* Au bureau, la carte « à faire » se tient juste au-dessus : un anneau, pas une bulle. */}
      {unfoldCued && narrow && (
        <CueBubble
          text={fr.firstSteps.cue.unfold}
          place="first-step-cue--start absolute bottom-[calc(100%+9px)] left-[4px]"
        />
      )}
    </button>
  );
  const researchButton = (
    <button
      type="button"
      aria-expanded={research}
      onClick={() => onResearch(!research)}
      className={`relative shrink-0 cursor-pointer border border-[var(--ink)] py-[5px] text-[10px] font-semibold tracking-[.14em] uppercase hover:bg-(--ink)/8 ${
        research ? 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]' : ''
      } ${compact ? 'mr-[2px] px-[3px] text-[9px] tracking-normal' : narrow ? 'mr-2 px-[9px]' : 'px-[9px]'}`}
    >
      {compact ? fr.personalBoard.researchShort : fr.research.header}
      {researchCue !== null && !research && (
        <CueBubble
          text={researchCue}
          place="first-step-cue--corner absolute right-0 bottom-[calc(100%+9px)]"
        />
      )}
    </button>
  );

  return (
    <>
      <section
        ref={board}
        aria-label={fr.personalBoard.header}
        className={`hud paper-grain float fixed flex flex-col border border-[var(--ink)] text-[var(--ink)] ${
          narrow ? 'border-x-0' : ''
        }`}
        style={
          narrow
            ? {
                left: 0,
                right: folded ? CORNER_ROOM : 0,
                bottom: 'calc(var(--board-bottom) / var(--hud-scale))',
                maxHeight: 'calc(55dvh / var(--hud-scale))',
                zIndex: folded ? 'var(--z-band)' : 'var(--z-window)',
              }
            : {
                left: 'calc((var(--board-left) + var(--table-gap)) / var(--hud-scale))',
                right: 'calc((var(--board-left) + var(--table-gap)) / var(--hud-scale))',
                bottom: 'calc(var(--table-margin) / var(--hud-scale))',
                // Over the to-do card of the column, which it would otherwise hide.
                zIndex: 'calc(var(--z-band) + 1)',
              }
        }
      >
        {rackCue !== null && !folded && (
          <CueBubble
            text={rackCue}
            place={
              narrow
                ? 'absolute bottom-[calc(100%+9px)] left-1/2 -translate-x-1/2'
                : // Over the tray, past the five gauges.
                  'absolute bottom-[calc(100%+9px)] left-[390px]'
            }
          />
        )}

        {compact ? (
          <div className="flex h-[56px] shrink-0 items-center gap-[3px]">
            {handle}
            <div className="flex min-w-0 flex-1 gap-[1px]">
              {RESOURCES.map((resource) => (
                <MiniBin key={resource} {...bin(resource)} narrow />
              ))}
            </div>
            {researchButton}
          </div>
        ) : narrow ? (
          <div className="flex shrink-0 flex-col gap-[6px] pb-[6px]">
            <div className="flex items-center border-b border-(color:--ink)/30">
              {handle}
              {researchButton}
            </div>
            <div className="flex gap-[3px] px-2">
              {RESOURCES.map((resource) => (
                <MiniBin key={resource} {...bin(resource)} narrow />
              ))}
            </div>
          </div>
        ) : (
          <div
            className={`flex shrink-0 items-center gap-[14px] pr-[10px] ${
              folded ? 'h-[54px]' : 'h-[36px] border-b border-[var(--ink)]'
            }`}
          >
            {handle}
            {folded && (
              <div className="flex gap-[4px]">
                {RESOURCES.map((resource) => (
                  <MiniBin key={resource} {...bin(resource)} narrow={false} />
                ))}
              </div>
            )}
            <span className="min-w-0 truncate text-[12px] leading-[1.2] text-[var(--ink-soft)]">
              <WorkLine view={view} now={now} />
            </span>
            <button
              type="button"
              title={`${fr.personalBoard.harvestReplay} — ${ledger}`}
              onClick={replay}
              className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-[8px] px-[6px] py-[4px] font-(family-name:--font-mono) text-[11px] font-semibold whitespace-nowrap"
            >
              {harvest === null ? (
                <em className="font-(family-name:--font-display) text-[12px] font-medium text-[var(--ink-soft)]">
                  {fr.personalBoard.harvestHeader}
                </em>
              ) : (
                <>
                  <em className="font-(family-name:--font-display) text-[12px] font-medium text-[var(--ink-soft)]">
                    {fr.personalBoard.harvestSince(harvest.hours)}
                  </em>
                  {harvest.deltas
                    .filter(({ amount }) => amount !== 0)
                    .map(({ resource, amount }) => (
                      <span
                        key={resource}
                        className="inline-flex items-center gap-[2px]"
                        style={amount < 0 ? { color: 'var(--critical)' } : undefined}
                      >
                        <span className="flex" style={{ color: resourceColor(resource, true) }}>
                          <ResourceIcon resource={resource} size={13} />
                        </span>
                        {fr.personalBoard.delta(amount)}
                      </span>
                    ))}
                </>
              )}
            </button>
            {researchButton}
          </div>
        )}

        <div
          className="mat-fold grid min-h-0"
          style={{ gridTemplateRows: folded ? '0px' : narrow ? 'auto' : '156px' }}
          inert={folded}
        >
          <div
            className={`min-h-0 overflow-hidden ${
              narrow ? 'flex flex-col overflow-y-auto overscroll-contain' : 'grid'
            }`}
            style={narrow ? undefined : { gridTemplateColumns: 'auto 1fr 236px' }}
          >
            {!narrow && (
              <section className="grid grid-cols-[repeat(5,66px)] gap-[6px] px-3 py-[10px]">
                {RESOURCES.map((resource) => (
                  <GaugeBin key={resource} {...bin(resource)} />
                ))}
              </section>
            )}
            {site === null ? (
              <>
                <Tiles
                  view={view}
                  narrow={narrow}
                  focusedKey={focusedKey}
                  held={held}
                  placing={placing}
                  motion={motion}
                  onTake={observing ? null : take}
                />
                <Works
                  view={view}
                  seat={seat}
                  now={now}
                  narrow={narrow}
                  observing={observing}
                  ledger={ledger}
                  onReplay={harvest === null ? null : replay}
                  onSpent={mark}
                />
              </>
            ) : (
              <SiteBand
                key={site.id}
                view={view}
                seat={seat}
                site={site}
                now={now}
                narrow={narrow}
                motion={motion}
                observing={observing}
                onSpent={mark}
                onDeselect={onDeselectSite}
                onOpenSheet={onOpenSiteSheet}
              />
            )}
          </div>
        </div>
      </section>
      {createPortal(
        <div
          ref={chip}
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 z-[var(--z-notice)]"
          style={{ display: held === null ? 'none' : 'block' }}
        >
          {held !== null && <Carried held={held} hint={hint} />}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * **Ce que la bande prend au pied de la table**, publié en `--mat-rise` (pixels d'écran, du bas
 * de l'écran au-dessus d'elle et de ce qu'elle pose au-dessus d'elle : la recherche, la bulle) :
 * ce qui se pose au bas de la carte se lève d'autant (`MAT_LIFT`) au lieu de passer dessous.
 * `shape` change quand ce qu'elle pose change : on remesure, et on observe les nouvelles pièces.
 */
function useMatRise(mat: { readonly current: HTMLElement | null }, shape: string) {
  useEffect(() => {
    const node = mat.current;
    if (node === null) return;
    const parts = [node, ...node.querySelectorAll<HTMLElement>('[data-mat-part], .first-step-cue')];
    const root = document.documentElement.style;
    const publish = () => {
      const top = Math.min(...parts.map((part) => part.getBoundingClientRect().top));
      root.setProperty('--mat-rise', `${Math.round(window.innerHeight - top + MAT_GAP_PX)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    for (const part of parts) observer.observe(part);
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
      root.removeProperty('--mat-rise');
    };
  }, [mat, shape]);
}

// ---------------------------------------------------------------------------------------
// The stores and their harvest
// ---------------------------------------------------------------------------------------

/** Le bac dont la jauge est repliée hors de l'écran ne s'y voit pas : le bandeau le remplace. */
const onScreen = ({ x, y }: { x: number; y: number }) =>
  x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;

const stocksAt = (view: PlayerView, now: number): Record<ResourceKey, number> =>
  Object.fromEntries(
    RESOURCES.map((key) => [key, currentStock(view.me.resources[key], view.loadedAt, now)]),
  ) as Record<ResourceKey, number>;

/**
 * **La récolte, une fois par arrivée** : l'écart avec la dernière lecture, pris au montage et
 * jamais repris — la vue change sous les pastilles, la récolte non. Un clic sur la récolte de la
 * bande la rejoue.
 *
 * Les bacs montrent ce qui est déjà tombé (`shown`) le temps du vol ; « coupées », rien ne vole ;
 * « réduites », les pastilles naissent au bac sans trajet.
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
  const [round, setRound] = useState(0);
  const [shown, setShown] = useState<Record<ResourceKey, number> | null>(null);
  const markRead = useMutation(api.personalBoard.markRead);
  const mark = useCallback(() => void markRead(seat).catch(() => {}), [markRead, seat]);

  /** **Lu à l'arrivée, relu en partant** — démonté ou la page masquée — et après chaque dépense
   *  faite depuis la bande : la récolte suivante dit ce qui a bougé depuis qu'on l'a quittée,
   *  jamais le prix de ce qu'on vient d'y acheter. */
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

  const latest = useRef(view);
  latest.current = view;
  useEffect(() => {
    if (harvest === null || motion === 'off') return;
    setShown(before(latest.current, harvest));
    const layer = flightLayer();
    let live = true;
    const flights = harvest.deltas.flatMap(({ resource, amount }, rank) =>
      pastilleShares(amount).map((share, index) =>
        flyToBin(layer, resource, bins.current.get(resource), amount > 0, motion, {
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
      if (live) setShown(null);
    });
    return () => {
      live = false;
      layer.remove();
      setShown(null);
    };
  }, [harvest, motion, bins, round]);

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

  return { shown, harvest, ledger, mark, replay: () => setRound((count) => count + 1) };
}

const before = (view: PlayerView, harvest: Harvest): Record<ResourceKey, number> => {
  const stocks = stocksAt(view, Date.now());
  for (const { resource, amount } of harvest.deltas) stocks[resource] -= amount;
  return stocks;
};

/**
 * **Une pastille qui tombe dans son bac, ou qui en sort** : elle arrive d'au-dessus de la bande
 * — de la table — en arc (`flyPastille`, partagé avec les échanges).
 */
function flyToBin(
  layer: HTMLElement,
  resource: ResourceKey,
  bin: HTMLElement | undefined,
  gain: boolean,
  motion: MapMotion,
  { delay }: { delay: number },
): Promise<void> {
  if (bin === undefined) return Promise.resolve();
  const box = bin.getBoundingClientRect();
  const atBin = { x: box.left + box.width / 2, y: box.top + Math.min(18, box.height / 2) };
  const table = { x: atBin.x + (Math.random() - 0.5) * 120, y: Math.max(40, box.top - 220) };
  const [from, to] = gain ? [table, atBin] : [atBin, table];
  return flyPastille(layer, resource, { from, to, rest: atBin, fade: !gain }, motion, { delay });
}

type BinProps = {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
  shown: number | null;
  register: (node: HTMLElement | null) => void;
  /** Munitions, pétrole et charbon se prennent ici pour charger un transport. */
  onTake: ((event: ReactPointerEvent<HTMLElement>) => void) | null;
};

/** Ce qu'un bac dit au survol : son nombre sur son plafond, et son débit. Ce qui l'arrête se lit
 *  dans son ticket (`ledgerNotesOf`). */
function binReading({ resource, view, now, shown }: BinProps) {
  const held = view.me.resources[resource];
  const stock = Math.floor(shown ?? currentStock(held, view.loadedAt, now));
  const share = held.cap > 0 ? Math.min(100, (stock / held.cap) * 100) : 0;
  const title = `${fr.resources[resource]} : ${stock} ${fr.personalBoard.ofCap(held.cap)} · ${fr.personalBoard.rate(held.ratePerHour)}`;
  return { held, stock, share, title };
}

const takeTokens = (onTake: BinProps['onTake']) =>
  onTake === null ? {} : { onPointerDown: onTake, 'data-grab': fr.logistics.grab };

/** **Un bac plié**, à la logique du grand : l'icône, la barre, possédé / max, puis le débit. */
function MiniBin(props: BinProps & { narrow: boolean }) {
  const { resource, register, onTake, narrow } = props;
  const { held, stock, share, title } = binReading(props);
  const color = resourceColor(resource, true);
  return (
    <span
      ref={register}
      data-bin={resource}
      title={onTake === null ? title : `${title} — ${fr.logistics.grab}`}
      {...takeTokens(onTake)}
      className={`flex touch-none flex-col items-center justify-center border border-(color:--ink)/35 font-(family-name:--font-mono) leading-none whitespace-nowrap select-none ${
        narrow
          ? 'h-full min-w-0 flex-1 gap-[3px] overflow-hidden px-0 py-[3px] text-[7.5px] tracking-[-.06em]'
          : 'h-[44px] w-[64px] gap-[3px] py-[3px] text-[9.5px]'
      } ${onTake === null ? '' : 'cursor-grab hover:bg-(--arc-mine)/14'}`}
    >
      {narrow ? (
        <ResourcePlate resource={resource} height={11} width={11} />
      ) : (
        <ResourcePlate resource={resource} height={14} />
      )}
      <span
        aria-hidden
        className={`block ${narrow ? 'h-[3px] w-[calc(100%-6px)]' : 'h-[3px] w-[calc(100%-10px)]'}`}
        style={{
          background: `linear-gradient(90deg, ${color} ${share}%, color-mix(in srgb, var(--ink) 14%, transparent) ${share}%)`,
        }}
      />
      <span>
        <b className="font-semibold">{stock}</b>
        {narrow ? `/${held.cap}` : ` ${fr.personalBoard.ofCap(held.cap)}`}
      </span>
      <span style={{ color: held.ratePerHour < 0 ? 'var(--critical)' : 'var(--ink-soft)' }}>
        {fr.personalBoard.rate(held.ratePerHour)}
      </span>
    </span>
  );
}

/** **Un bac en thermomètre** : l'icône, le tube, possédé / max, puis le débit net, centrés dans la
 *  hauteur de la bande pour que les marges du haut et du bas soient égales. */
function GaugeBin(props: BinProps) {
  const { resource, register, onTake } = props;
  const { held, stock, share, title } = binReading(props);
  return (
    <div
      ref={register}
      data-bin={resource}
      title={onTake === null ? title : `${title} — ${fr.logistics.grab}`}
      {...takeTokens(onTake)}
      className={`grid touch-none content-center justify-items-center gap-[7px] select-none ${
        onTake === null ? '' : 'cursor-grab hover:bg-(--arc-mine)/12'
      }`}
    >
      <ResourcePlate resource={resource} height={22} />
      <span
        aria-hidden
        className="relative h-[58px] w-[16px] overflow-hidden rounded-[8px_8px_3px_3px] border-[1.5px] border-[var(--ink)] bg-white/25"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to top, transparent 0 14.5px, color-mix(in srgb, var(--ink) 35%, transparent) 14.5px 15.5px)',
        }}
      >
        <i
          className="mat-gauge absolute inset-x-0 bottom-0"
          style={{ height: `${share}%`, background: resourceColor(resource, true) }}
        />
      </span>
      <span className="font-(family-name:--font-mono) text-[11px] leading-none whitespace-nowrap">
        <b className="text-[13px] font-semibold">{stock}</b>{' '}
        <small className="text-[9.5px] text-[var(--ink-soft)]">
          {fr.personalBoard.ofCap(held.cap)}
        </small>
      </span>
      <small
        className="font-(family-name:--font-mono) text-[9.5px] leading-none whitespace-nowrap"
        style={{ color: held.ratePerHour < 0 ? 'var(--critical)' : 'var(--ink-soft)' }}
      >
        {fr.personalBoard.rate(held.ratePerHour)}
      </small>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// The tray: buildings and troops
// ---------------------------------------------------------------------------------------

/**
 * **Ce qui retient une tuile avant même la carte** : une clé que le QG n'ouvre pas, ou dont aucun
 * point ne prendrait la pose, et qui n'a pas de pareille debout à élever. Sa condition se dit sur
 * la tuile et à la prise, et la tuile rentre (`placementOf`).
 */
function tileRefusalOf(view: PlayerView, key: BuildingKey): string | null {
  if (view.me.buildings.some((building) => building.key === key)) return null;
  const { condition } = placementOf(view, key);
  return condition === null ? null : conditionText(condition);
}

/** Where a press starts: the element pressed, the pointer (`null` for Entrée), the point. */
type Grab = {
  readonly element: HTMLElement;
  readonly pointerId: number | null;
  readonly x: number;
  readonly y: number;
};

type Take = (grab: Grab) => void;

/**
 * **Une tuile de la bande est un bouton** (#162) : un clic, un toucher ou Entrée la met en main,
 * un geste vers le haut la prend sous le pointeur, un geste de côté fait défiler sa rangée
 * (`pressRail`). Le clic qu'un pointeur laisse derrière sa pression ne la reprend pas.
 */
const gripOf =
  (rail: { readonly current: HTMLElement | null }, motion: MapMotion) =>
  (take: Take | null, { lifts = true }: { lifts?: boolean } = {}) =>
    take === null
      ? {}
      : {
          onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
            event.stopPropagation();
            const element = event.currentTarget;
            pressRail(
              event,
              rail.current,
              {
                pick: () => take({ element, pointerId: null, x: 0, y: 0 }),
                lift: lifts ? ({ x, y }, pointerId) => take({ element, pointerId, x, y }) : null,
              },
              motion,
            );
          },
          onClick: (event: ReactMouseEvent<HTMLElement>) => {
            if (event.detail === 0)
              take({ element: event.currentTarget, pointerId: null, x: 0, y: 0 });
          },
        };

type Grip = ReturnType<ReturnType<typeof gripOf>>;

/** Between the tiles a press only scrolls. */
const NO_PICK = { pick: null, lift: null } as const;

/** **Un rang qu'on fait défiler** (#162) : glisser à la souris et au doigt, avec l'inertie que le
 *  réglage laisse ; flèches et molette au bureau. */
function Rail({
  narrow,
  motion,
  label,
  children,
}: {
  narrow: boolean;
  motion: MapMotion;
  label: string;
  children: (grip: ReturnType<typeof gripOf>) => ReactNode;
}) {
  const rail = useRef<HTMLDivElement>(null);

  // The wheel turns the rail: a vertical wheel over a horizontal row means "the next ones".
  useEffect(() => {
    const node = rail.current;
    if (node === null) return;
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  const scroll = (direction: 1 | -1) =>
    rail.current?.scrollBy({
      left: direction * 324,
      behavior: motion === 'full' ? 'smooth' : 'auto',
    });

  return (
    <div className="relative min-w-0">
      <div
        ref={rail}
        role="group"
        aria-label={label}
        onPointerDown={(event) => pressRail(event, rail.current, NO_PICK, motion)}
        className={`flex h-full touch-pan-x snap-x snap-proximity gap-[8px] overflow-x-auto [scrollbar-color:var(--ink-soft)_transparent] [scrollbar-width:thin] ${
          narrow ? 'pt-[2px] pr-3 pb-[6px] pl-[2px]' : 'pt-[2px] pr-[30px] pb-[10px] pl-[2px]'
        }`}
      >
        {children(gripOf(rail, motion))}
      </div>
      {!narrow && (
        <>
          <button
            type="button"
            aria-label={fr.personalBoard.previous}
            onClick={() => scroll(-1)}
            className="paper-grain absolute top-[44px] -left-[4px] h-[40px] w-[22px] cursor-pointer border border-[var(--ink)] text-[15px] leading-none"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={fr.personalBoard.next}
            onClick={() => scroll(1)}
            className="paper-grain absolute top-[44px] right-[4px] h-[40px] w-[22px] cursor-pointer border border-[var(--ink)] text-[15px] leading-none"
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}

/** **Le rang des tuiles de bâtiments** : ce que la bande montre tant qu'aucun site n'est
 *  sélectionné. */
function Tiles({
  view,
  narrow,
  focusedKey,
  held,
  placing,
  motion,
  onTake,
}: {
  view: PlayerView;
  narrow: boolean;
  focusedKey: BuildingKey | null;
  held: BuildingKey | null;
  placing: BuildingKey | null;
  motion: MapMotion;
  onTake: ((key: BuildingKey, grab: Grab) => void) | null;
}) {
  const lit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    lit.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focusedKey]);
  return (
    <section
      className={`min-w-0 ${narrow ? 'px-[10px] py-[6px]' : 'border-l border-[var(--ink)] py-[10px] pl-3'}`}
    >
      <Rail narrow={narrow} motion={motion} label={fr.personalBoard.tilesNote}>
        {(grip) =>
          BUILDABLE_BUILDINGS.map((key) => (
            <Tile
              key={key}
              ref={key === focusedKey ? lit : undefined}
              buildingKey={key}
              view={view}
              narrow={narrow}
              lit={key === focusedKey || key === placing || key === held}
              grip={grip(onTake === null ? null : (grab) => onTake(key, grab))}
            />
          ))
        }
      </Rail>
    </section>
  );
}

/** **Une tuile du plateau** : son nom, son image, ce qu'elle dit (durée, site, ou la carte qui
 *  la retient, en rouge), son prix. Retenue, elle est en pointillé — jamais grisée. */
function TileFrame({
  ref,
  name,
  narrow,
  locked,
  lit,
  grip,
  picture,
  meta,
  price,
}: {
  ref?: Ref<HTMLButtonElement> | undefined;
  name: string;
  narrow: boolean;
  locked: boolean;
  lit: boolean;
  grip: Grip;
  picture: ReactNode;
  meta: string;
  price: ReactNode;
}) {
  const label = `${name} — ${meta}`;
  return (
    <button
      ref={ref}
      type="button"
      {...grip}
      title={label}
      aria-label={label}
      className={`grid shrink-0 touch-pan-x snap-start grid-rows-[auto_1fr_auto_auto] border border-[var(--ink)] text-left text-[var(--ink)] select-none focus-visible:outline-2 focus-visible:outline-[var(--ochre)] ${
        narrow
          ? 'h-[98px] w-[84px] px-[5px] pt-[4px] pb-[5px]'
          : 'h-[128px] w-[100px] px-[6px] pt-[5px] pb-[6px]'
      } ${
        locked
          ? 'border-dashed bg-transparent'
          : `bg-[#efe5cc] shadow-[0_2px_0_var(--ink)] ${narrow ? '' : 'mat-tile'}`
      } ${'onClick' in grip ? 'cursor-pointer' : ''} ${lit ? 'outline-2 outline-offset-1 outline-[var(--ochre)]' : ''}`}
    >
      <b
        className={`line-clamp-2 leading-[1.1] font-semibold ${narrow ? 'text-[11px]' : 'text-[12px]'}`}
      >
        {name}
      </b>
      <span className="grid place-items-center overflow-hidden">{picture}</span>
      <span
        className={`line-clamp-2 leading-[1.1] ${
          locked
            ? 'font-semibold text-[var(--critical)]'
            : 'font-(family-name:--font-mono) text-[var(--ink-soft)]'
        } ${narrow ? 'text-[9px]' : 'text-[9.5px]'}`}
      >
        {meta}
      </span>
      <span className="mt-[2px] font-(family-name:--font-mono) text-[9.5px] whitespace-nowrap">
        {price}
      </span>
    </button>
  );
}

function Tile({
  ref,
  buildingKey,
  view,
  narrow,
  lit,
  grip,
}: {
  ref?: Ref<HTMLButtonElement> | undefined;
  buildingKey: BuildingKey;
  view: PlayerView;
  narrow: boolean;
  lit: boolean;
  grip: Grip;
}) {
  const standing = view.me.buildings.filter((building) => building.key === buildingKey);
  /** **Sa pareille debout**, la plus basse : la tuile dit l'élévation et son prix, comme la
   *  maquette ; lâchée ailleurs sur la carte, elle bâtit toujours. */
  const lowest = standing.reduce<Building | null>(
    (low, building) => (low === null || building.level < low.level ? building : low),
    null,
  );
  const free = view.me.foundation.some((due) => due.key === buildingKey);
  const refusal = tileRefusalOf(view, buildingKey);
  const time = countdownLabel(view.buildCatalog[buildingKey].minutes * 60_000);
  return (
    <TileFrame
      ref={ref}
      name={fr.buildings[buildingKey]}
      narrow={narrow}
      locked={refusal !== null}
      lit={lit}
      grip={grip}
      picture={<BuildingPlate building={buildingKey} height={narrow ? 34 : 50} />}
      meta={
        refusal ??
        (lowest === null
          ? time
          : `${standing.length > 1 ? `${fr.personalBoard.tileCount(standing.length)} · ` : ''}${fr.personalBoard.raiseTo(lowest.level + 1)}`)
      }
      price={
        free ? (
          fr.construction.free
        ) : (
          <Price
            costs={lowest === null ? view.buildCatalog[buildingKey].cost : lowest.nextLevelCost}
            size={10}
          />
        )
      }
    />
  );
}

/** `Fantassin`, `Blindé MK2` — la marque seulement quand le rôle en a deux et que c'est la seconde. */
const pieceName = (role: UnitRole, tier: UnitTier): string => {
  const name = tier === 2 ? `${roleLabel(role, 1)} ${tierLabel(2)}` : roleLabel(role, 1);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
};

/** The words of a recruitment refusal, as the server would say them. */
const recruitRefusalText = ({ code, ...details }: RecruitRefusal): string =>
  fr.errors[code](details);

/**
 * **Le site sélectionné, dans la bande** (#163, comme dans Warcraft III) : les cartes des troupes
 * qu'il forme, leur prix, leur durée à son niveau (`spedMinutes`) et le refus que dit
 * `recruitRefusalOf`, la lecture même de `troops.recruit`. Un clic, un toucher ou Entrée sur une
 * carte la met en formation ici ; à droite, la file du site. Sa fiche s'ouvre d'ici.
 */
function SiteBand({
  view,
  seat,
  site,
  now,
  narrow,
  motion,
  observing,
  onSpent,
  onDeselect,
  onOpenSheet,
}: {
  view: PlayerView;
  seat: Seat;
  site: Building;
  now: number;
  narrow: boolean;
  motion: MapMotion;
  observing: boolean;
  onSpent: () => void;
  onDeselect: () => void;
  onOpenSheet: () => void;
}) {
  const workshop = useQuery(api.troops.workshop, seat);
  const recruit = useMutation(api.troops.recruit);
  const facility = workshop?.facilities.find((one) => one.id === site.id) ?? null;
  const region = view.me.regions.find((one) => one.id === site.regionId)?.name ?? site.regionId;
  const siteName = fr.buildings[site.key];
  const stocks = stocksAt(view, now);
  const cards = (workshop?.grid ?? [])
    .filter((entry) => projectionKeyOf(entry.role) === site.key)
    .flatMap((entry) => [
      { role: entry.role, tier: 1 as UnitTier, unit: entry.unit },
      ...(entry.unitTier2 === null
        ? []
        : [{ role: entry.role, tier: 2 as UnitTier, unit: entry.unitTier2 }]),
    ])
    .map((card) => {
      const refusal =
        workshop === undefined
          ? null
          : recruitRefusalOf(card.role, card.tier, site, {
              researched: view.me.research.researched,
              army: workshop.troopsInService + workshop.troopsQueued,
              siteQueue: facility?.queue.length ?? 0,
              costs: card.unit.costs,
              stocks,
            });
      return { ...card, refusal: refusal === null ? null : recruitRefusalText(refusal) };
    });
  const form = (card: (typeof cards)[number]) => {
    if (card.refusal !== null) return notify(card.refusal);
    recruit({ ...seat, buildingId: site.id as Id<'buildings'>, role: card.role, tier: card.tier })
      .then(() => {
        flySpent(card.unit.costs, site.point, motion);
        onSpent();
        notify(fr.personalBoard.formed(pieceName(card.role, card.tier)), 'info');
      })
      .catch((problem: unknown) => handleError(problem, (said) => notify(said)));
  };

  const link =
    'cursor-pointer py-[2px] text-[9.5px] tracking-[.14em] uppercase underline underline-offset-2';
  const head = (
    <div
      className={
        narrow
          ? 'flex flex-wrap items-center gap-x-[10px] gap-y-[4px]'
          : 'grid w-[132px] content-start gap-[5px] pr-1'
      }
    >
      <span className="flex items-center gap-[6px]">
        <BuildingPlate building={site.key} height={narrow ? 22 : 28} />
        <b className="text-[13px] leading-[1.1] font-semibold">{siteName}</b>
      </span>
      <span className="text-[11px] leading-[1.25] text-[var(--ink-soft)]">
        {region} · {fr.common.levelSpeed(site.level)}
      </span>
      <span className={`flex gap-[10px] ${narrow ? 'ml-auto' : 'mt-[2px] flex-col items-start'}`}>
        <button type="button" onClick={onOpenSheet} className={link}>
          {fr.personalBoard.siteSheet}
        </button>
        <button
          type="button"
          onClick={onDeselect}
          title={fr.personalBoard.siteLeaveTitle}
          className={link}
        >
          {fr.personalBoard.siteLeave}
        </button>
      </span>
    </div>
  );

  return (
    <>
      <section
        aria-label={fr.personalBoard.siteCards(siteName)}
        className={`grid min-w-0 ${
          narrow
            ? 'grid-cols-1 gap-[6px] px-[10px] py-[6px]'
            : 'grid-cols-[auto_1fr] gap-[10px] border-l border-[var(--ink)] py-[10px] pl-3'
        }`}
      >
        {head}
        {workshop === undefined ? (
          <p className="self-center text-[11.5px] text-[var(--ink-soft)]">
            {fr.production.opening}
          </p>
        ) : (
          <Rail narrow={narrow} motion={motion} label={fr.personalBoard.siteCards(siteName)}>
            {(grip) =>
              cards.map((card) => (
                <TileFrame
                  key={`${card.role}-${card.tier}`}
                  name={pieceName(card.role, card.tier)}
                  narrow={narrow}
                  locked={card.refusal !== null}
                  lit={false}
                  grip={grip(observing ? null : () => form(card), { lifts: false })}
                  picture={
                    <UnitSprite
                      nation={view.me.nation}
                      role={card.role}
                      tier={card.tier}
                      height={narrow ? 34 : 50}
                      width={narrow ? 60 : 84}
                    />
                  }
                  meta={
                    card.refusal ??
                    countdownLabel(spedMinutes(card.unit.minutes, site.level) * 60_000)
                  }
                  price={<Price costs={card.unit.costs} size={10} />}
                />
              ))
            }
          </Rail>
        )}
      </section>
      <section
        className={
          narrow
            ? 'border-t border-[var(--ink)] px-[10px] py-[8px]'
            : 'min-w-0 overflow-y-auto border-l border-[var(--ink)] px-3 py-[10px]'
        }
      >
        <div className="grid gap-[5px]">
          <span className="eyebrow">{fr.personalBoard.siteQueue}</span>
          {workshop === undefined || facility === null || facility.queue.length === 0 ? (
            <p className="text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
              {fr.personalBoard.siteQueueEmpty}
            </p>
          ) : (
            facility.queue.map((batch) => (
              <div key={batch.id} className="flex items-center gap-[8px] text-[12px] leading-[1.2]">
                <UnitSprite
                  nation={view.me.nation}
                  role={batch.role}
                  tier={batch.tier === 2 ? 2 : 1}
                  height={18}
                  width={30}
                />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {pieceName(batch.role, batch.tier === 2 ? 2 : 1)}
                </span>
                <small className="font-(family-name:--font-mono) text-[10px] text-[var(--ink-soft)]">
                  {countdownLabel(
                    currentMinutes(batch.minutesLeft, workshop.loadedAt, now) * 60_000,
                  )}
                </small>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------------------
// Works and harvest
// ---------------------------------------------------------------------------------------

/** Le chantier en tête en une ligne : nom, niveau, lieu, ce qui lui reste, la file derrière. */
function WorkLine({ view, now }: { view: PlayerView; now: number }) {
  const running = view.me.construction;
  if (running === null) return <>{fr.personalBoard.noWorks}</>;
  return (
    <>
      <b className="font-semibold text-[var(--ink)]">
        {fr.personalBoard.workAt(running.name, running.level, running.regionName)}
      </b>
      {fr.personalBoard.workTail(
        countdownLabel(currentMinutes(running.minutesLeft, view.loadedAt, now) * 60_000),
        view.me.constructionQueue.length,
      )}
    </>
  );
}

/**
 * **Le chantier en tête et la file derrière** : la seule échéance est celle de la tête, sa règle
 * avance ; une ligne en file se retire et se rembourse, un chantier commencé non
 * (`constructions.cancel`). Dessous, la récolte et les lots que le joueur commande. Au téléphone,
 * le tout replié en une ligne qu'on déplie au toucher.
 */
function Works({
  view,
  seat,
  now,
  narrow,
  observing,
  ledger,
  onReplay,
  onSpent,
}: {
  view: PlayerView;
  seat: Seat;
  now: number;
  narrow: boolean;
  observing: boolean;
  ledger: string;
  /** Rejouer la récolte : au téléphone, la bande n'a pas la place de sa ligne. */
  onReplay: (() => void) | null;
  onSpent: () => void;
}) {
  const drop = useMutation(api.constructions.cancel);
  const [error, setError] = useState<string | null>(null);
  const [unfolded, setUnfolded] = useState(false);
  const head = view.me.construction;
  const rows = [
    ...(head === null ? [] : [{ work: head, running: true as const }]),
    ...view.me.constructionQueue.map((work) => ({ work, running: false as const })),
  ];
  const list = (
    <div className="grid gap-[5px]">
      <span className="eyebrow">{fr.personalBoard.worksHeader}</span>
      {rows.length === 0 && (
        <p className="text-[11.5px] leading-[1.4] text-[var(--ink-soft)]">
          {fr.economy.constructionNone}
        </p>
      )}
      {rows.map(({ work, running }, index) => {
        const total =
          (running ? work.minutes : undefined) ??
          worksMinutes(work.key, work.level, view.me.hqLevel);
        const left = running ? currentMinutes(work.minutesLeft, view.loadedAt, now) : total;
        return (
          <div key={work.id} className="grid gap-[2px] text-[12px] leading-[1.2]">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1">
                <b className="font-semibold">
                  {fr.personalBoard.workRank(
                    index + 1,
                    fr.personalBoard.work(work.name, work.level),
                  )}
                </b>{' '}
                <span className="text-[var(--ink-soft)]">{work.regionName}</span>
              </span>
              {!running && !observing && (
                <button
                  type="button"
                  title={fr.economy.queueCancelTitle}
                  onClick={() => {
                    setError(null);
                    drop({ ...seat, constructionId: work.id as Id<'constructions'> }).then(
                      onSpent,
                      (problem: unknown) => handleError(problem, setError),
                    );
                  }}
                  className="cursor-pointer text-[9.5px] tracking-[.14em] uppercase underline underline-offset-2 hover:text-[var(--critical)]"
                >
                  {fr.economy.queueCancel}
                </button>
              )}
            </span>
            {running && (
              <span aria-hidden className="block h-[3px] bg-(--ink)/14">
                <i
                  className="block h-full bg-[var(--arc-mine)]"
                  style={{
                    width: `${total > 0 ? Math.min(100, ((total - left) / total) * 100) : 0}%`,
                  }}
                />
              </span>
            )}
            <small className="font-(family-name:--font-mono) text-[9.5px] leading-none text-[var(--ink-soft)]">
              {running
                ? fr.personalBoard.left(countdownLabel(left * 60_000))
                : fr.personalBoard.queuedLine(countdownLabel(total * 60_000))}
            </small>
          </div>
        );
      })}
      {view.me.hqLevel > 0 && (
        <small className="text-[9.5px] leading-[1.3] text-[var(--ink-soft)]">
          {fr.personalBoard.hqSpeed(fr.common.levelSpeed(view.me.hqLevel))}
        </small>
      )}
      {error !== null && <p className="text-[11px] text-[var(--critical)]">{error}</p>}
      <span className="mt-[4px] flex items-baseline gap-2">
        <span className="eyebrow">{fr.personalBoard.harvestHeader}</span>
        {onReplay !== null && (
          <button
            type="button"
            onClick={onReplay}
            className="ml-auto cursor-pointer text-[9.5px] tracking-[.14em] uppercase underline underline-offset-2"
          >
            {fr.personalBoard.harvestReplay}
          </button>
        )}
      </span>
      <p className="text-[11px] leading-[1.35] text-[var(--ink-soft)]">{ledger}</p>
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
  );
  if (!narrow)
    return (
      <section className="min-w-0 overflow-y-auto border-l border-[var(--ink)] px-3 py-[10px]">
        {list}
      </section>
    );
  return (
    <section className="border-t border-[var(--ink)] px-[10px] py-[6px]">
      <button
        type="button"
        aria-expanded={unfolded}
        onClick={() => setUnfolded((was) => !was)}
        className="flex w-full cursor-pointer items-center gap-[6px] px-[2px] py-[6px] text-left text-[12px] leading-[1.2]"
      >
        <span aria-hidden className="text-[10px]">
          {unfolded ? '▾' : '▸'}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <WorkLine view={view} now={now} />
        </span>
        <small className="font-(family-name:--font-mono) text-[10px] text-[var(--ink-soft)]">
          {fr.personalBoard.worksFold}
        </small>
      </button>
      {unfolded && list}
    </section>
  );
}

/** What travels under the hand: the tile, and what the place under it says. */
function Carried({ held, hint }: { held: BuildingKey; hint: Hint }) {
  return (
    <div className="relative -translate-x-1/2 -translate-y-1/2">
      <div className="grid rotate-[-3deg] justify-items-center border border-[var(--ink)] bg-[#efe5cc] p-[6px] shadow-[0_10px_18px_rgba(0,0,0,.45)]">
        <BuildingPlate building={held} height={34} />
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
 * **La main** : prendre une tuile, la porter, la lâcher. Suivie à la fenêtre et non à l'élément,
 * et la capture implicite d'un doigt est rendue au pointeur — sans quoi la carte ne verrait pas
 * le doigt passer, et le fantôme ne le suivrait pas.
 *
 * Une tuile au-dessus de la carte arme le fantôme de la pose (ADR 0029), qui dit le prix ou le
 * refus ; au-dessus de sa pareille, le fantôme se range et la main dit « élever ». Prise d'un
 * clic, d'un toucher ou par Entrée, une tuile laisse le fantôme armé : un clic sur la carte la
 * pose (#162). Une tuile que rien ne prendrait dit sa condition et rentre.
 */
function useHand({
  view,
  onSpent,
  seat,
  board,
  motion,
  onHoldTile,
  onPlaceTile,
}: {
  view: PlayerView;
  /** A spend made from the board: its reading is renewed, so the next harvest does not bill it. */
  onSpent: () => void;
  seat: Seat;
  board: { readonly current: HTMLElement | null };
  motion: MapMotion;
  onHoldTile: (key: BuildingKey | null) => void;
  onPlaceTile: () => boolean;
}) {
  const [held, setHeld] = useState<BuildingKey | null>(null);
  const [hint, setHint] = useState<Hint>(null);
  /** The hand has left the personal board: it folds to its head and gives the map back. */
  const [away, setAway] = useState(false);
  const chip = useRef<HTMLDivElement>(null);
  const start = useMutation(api.constructions.start);
  const latest = useRef(view);
  latest.current = view;
  // The release reads the board's callbacks as they are then: the ghost's point is not known at the grab.
  const callbacks = useRef({ onHoldTile, onPlaceTile, onSpent });
  callbacks.current = { onHoldTile, onPlaceTile, onSpent };
  const gesture = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => () => gesture.current?.cancel(), []);

  const take = (key: BuildingKey, { element, pointerId, x, y }: Grab): void => {
    gesture.current?.cancel();
    if (pointerId !== null && element.hasPointerCapture(pointerId))
      element.releasePointerCapture(pointerId);
    const origin = element.getBoundingClientRect();
    const home = { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2 };
    const from = pointerId === null ? home : { x, y };
    const refusal = tileRefusalOf(latest.current, key);
    let moved = false;
    let armed = false;
    let left = false;
    let lastHint: string | null = null;

    const say = (next: Hint) => {
      const said = next === null ? null : `${next.refused}-${next.text}`;
      if (said === lastHint) return;
      lastHint = said;
      setHint(next);
    };
    const arm = (on: boolean) => {
      if (refusal !== null || on === armed) return;
      armed = on;
      callbacks.current.onHoldTile(on ? key : null);
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
      const reading = readingOf(key, targetAt(x, y, board.current, latest.current), latest.current);
      arm(reading.kind === 'map');
      say(reading.hint);
      if (reading.kind !== 'board') leave();
      // Over the map the ghost is the tile: the one in hand would hide where it goes down.
      if (chip.current) chip.current.style.opacity = reading.kind === 'map' ? '0' : '';
    };

    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
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

    /** The hand opens at a point: the tile goes down there, or goes back. */
    const drop = (at: { x: number; y: number }) => {
      finish();
      if (refusal !== null) {
        say({ text: refusal, refused: true });
        return settle(false, at);
      }
      const reading = readingOf(
        key,
        targetAt(at.x, at.y, board.current, latest.current),
        latest.current,
      );
      if (reading.kind === 'map') {
        const placed = callbacks.current.onPlaceTile();
        if (placed) callbacks.current.onSpent();
        else callbacks.current.onHoldTile(null);
        return settle(placed, at);
      }
      arm(false);
      say(reading.hint);
      if (reading.kind !== 'act' || reading.hint?.refused !== false) return settle(false, at);
      settle(true, at);
      const building = reading.building;
      start({
        ...seat,
        building: building.key,
        regionId: building.regionId,
        point: { lon: building.point[0], lat: building.point[1] },
      }).then(
        () => {
          flySpent(building.nextLevelCost, building.point, motion);
          callbacks.current.onSpent();
          notify(fr.personalBoard.raised(building.name, building.level + 1), 'info');
        },
        (problem: unknown) => handleError(problem, (said) => notify(said)),
      );
    };

    /** Taken without a drag, the tile leaves the ghost armed and the hand empty. */
    const toClick = () => {
      if (refusal !== null) return drop(home);
      finish();
      setHeld(null);
      setHint(null);
    };

    function move(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > DRAG_THRESHOLD_PX)
        moved = true;
      hover(event.clientX, event.clientY);
    }
    function up(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      if (!moved) return toClick();
      drop({ x: event.clientX, y: event.clientY });
    }
    function abandon() {
      finish();
      arm(false);
      setHeld(null);
      setHint(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') abandon();
    }

    setHeld(key);
    follow(from.x, from.y);
    arm(true);
    say(refusal === null ? null : { text: refusal, refused: true });
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', abandon);
    window.addEventListener('keydown', escape);
    gesture.current = { cancel: abandon };
    if (pointerId === null) toClick();
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
 * (`upgradeHold`), ailleurs sur la carte le fantôme parle. Sur un mât regroupé, elle vise sa
 * pareille.
 */
function readingOf(
  held: BuildingKey,
  target: Target,
  view: PlayerView,
):
  | { readonly kind: 'board'; readonly hint: Hint }
  | { readonly kind: 'map'; readonly hint: Hint }
  | { readonly kind: 'act'; readonly hint: Hint; readonly building: Building } {
  if (target.kind === 'board') {
    return { kind: 'board', hint: { text: fr.personalBoard.dropBack, refused: false } };
  }
  const under = target.kind === 'buildings' ? target.buildings : [];
  const building = under.find((candidate) => candidate.key === held);
  if (building === undefined) return { kind: 'map', hint: null };
  const hold = upgradeHold(building, view, Date.now());
  return {
    kind: 'act',
    building,
    hint:
      hold === null
        ? {
            text: (speedsUp(building.key) ? fr.personalBoard.raiseSped : fr.personalBoard.raise)(
              building.name,
              building.level + 1,
            ),
            refused: false,
            cost: building.nextLevelCost,
          }
        : { text: upgradeHoldText(hold), refused: true },
  };
}
