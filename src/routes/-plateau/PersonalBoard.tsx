import { useMutation, useQuery } from 'convex/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { spedMinutes, speedsUp } from '@/domain/level-speed';
import { countdownLabel, fr, roleLabel, upgradeHoldText } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { keepTilesStep, readTilesStep } from '@/data/settings';
import { useMapMotion } from '@/data/mapMotion';
import type { Seat } from '@/data/session';
import { useClock } from '@/shell/clock';
import { bindSpots, centreOf, flightLayer, flyPastille, spent as flySpent } from '@/shell/flights';
import { notify } from '@/shell/notifications';
import { Price } from '@/shell/Price';
import { CueBubble } from '@/shell/CueBubble';
import { FOOT_ROW, useFoot } from '@/shell/foot';
import { ReserveCell } from '@/shell/ReserveCell';
import { BottomSheet, type KeepingHeight } from '@/shell/BottomSheet';
import { useSurfaceHeld } from '@/shell/sole-surface';
import { useNarrowScreen } from '@/shell/viewport';
import {
  keptLevelOf,
  keptOf,
  placementOf,
  reachesOf,
  tileBillOf,
  tileCostOf,
  upgradeHold,
} from '@/domain/construction';
import { billShortageText } from '@/domain/compass-works';
import { outpostReachKm } from '../../../convex/constants';
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
import { UnitSprite } from '@/emblems/UnitSprite';
import { CASCADE, enter } from './cascade';
import { buildingsOfMaquette, type MaquetteAt } from './board-markers';
import { conditionText } from './FoundationRows';
import { StageTabs, Volet, type StageTab } from './Volet';
import { Rail, type Grab, type Grip } from './Rail';
import { useOverflow } from './useOverflow';
import { RazeButton } from './RazeButton';

/** What the hand says over where it is: a verb with its bill, or the refusal in red. */
type Hint = { readonly text: string; readonly refused: boolean; readonly cost?: Cost } | null;

type Cost = Readonly<Partial<Record<ResourceKey, number>>>;

/** **Le refus d'une tuile touchée** (#579, #589) : elle tremble sur place, sans quitter sa rangée,
 *  puis sa phrase se dit — une notification au bureau, un feuillet au téléphone. */
const SHAKE: Keyframe[] = [
  { translate: '0 0' },
  { translate: '-6px 0' },
  { translate: '5px 0' },
  { translate: '-3px 0' },
  { translate: '0 0' },
];

/** Under this travel a press is a click, not a drag: the tile stays in hand for a click on the map. */
const DRAG_THRESHOLD_PX = 5;

/** The air left between the band and what rises over it. */
const MAT_GAP_PX = 8;

/**
 * **Le plateau personnel, en sous-main** (issue #122, maquette B) : une bande sur toute la largeur
 * au pied de la table. Au bureau, sa barre garde les bacs — on en glisse des jetons sur un
 * transport sans la déplier —, les tuiles de bâtiments debout qu'on fait défiler (#579), le
 * chantier en tête et la récolte ; dépliée, la file des chantiers monte au-dessus. Au téléphone,
 * la bande dépliée porte les réserves, le rang des tuiles et la file des chantiers. Un site de projection sélectionné sur la carte y met ses cartes de
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
  onUnfold,
  onOpen,
  onResearch,
  onHoldTile,
  onPlaceTile,
  maquetteAt,
  placing,
  onTakeTokens,
  cue = null,
}: {
  view: PlayerView;
  seat: Seat;
  /** Au bureau, dépliée : la fenêtre `personalBoard` de l'adresse, que sa poignée bascule. Au
   *  téléphone l'étage n'est pas dans l'adresse (#589) : la fenêtre ouverte par un mât ne fait que
   *  le sortir de sa barre, et son repli la ferme. */
  open: boolean;
  /** `replace` : l'étage se replie sans pousser d'entrée, « retour » n'a rien à y défaire. */
  onOpen: (open: boolean, replace?: boolean) => void;
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
  /** **L'étage vient de sortir de sa barre** : ce qu'il couvre de la carte change, et le sujet
   *  touché se recadre s'il est caché. */
  onUnfold?: () => void;
  /** Arms the map's ghost for the tile in hand, or disarms it (ADR 0029). */
  onHoldTile: (key: BuildingKey | null) => void;
  /** The tile let go over the map, put down where the ghost stands: `true` when it went. */
  onPlaceTile: () => boolean;
  /** The maquette the map draws under a point (`MapEngine.maquetteAtPoint`), once the map is ready. */
  maquetteAt: MaquetteAt | null;
  /** The building whose ghost the map holds: its tile is lit, and Échap is the ghost's. */
  placing: BuildingKey | null;
}) {
  const narrow = useNarrowScreen();
  const now = useClock();
  const motion = useMapMotion();
  const board = useRef<HTMLElement>(null);
  const binRefs = useRef(new Map<ResourceKey, HTMLElement>());
  const observing = view.me.defeated;

  /** **L'étage des tuiles** (#589), sous le seuil et en Mondiale : une feuille posée au-dessus de la
   *  barre. Deux états : le cran choisi (retenu par appareil) et « cédé » — une autre surface tient
   *  la place, ou la main a quitté l'étage —, éphémère, qui le cache sans le fermer. */
  const staged = narrow && view.mode !== 'blitz';
  const surfaceHeld = useSurfaceHeld();
  const [step, setStep] = useState<KeepingHeight>(() => (open ? 'peek' : readTilesStep()));
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  const [refused, setRefused] = useState<BuildingKey | null>(null);
  /** L'onglet de l'étage : un état local, ni dans l'adresse ni dans l'historique (#590). */
  const [tab, setTab] = useState<StageTab>('works');
  const barRef = useCallback((node: HTMLElement | null) => {
    board.current = node;
    setBar(node);
  }, []);
  /** Une fenêtre que le mât d'un bâtiment ouvre sort l'étage de sa barre. */
  const [seenOpen, setSeenOpen] = useState(open);
  if (open !== seenOpen) {
    setSeenOpen(open);
    if (open && step === 'collapsed') setStep('peek');
  }

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
  const { held, hint, away, take, chip, taken } = useHand({
    view,
    onSpent: mark,
    seat,
    board,
    motion,
    onHoldTile,
    onPlaceTile,
    maquetteAt,
    onRefuse: narrow ? setRefused : null,
  });
  /** **Armer une tuile replie le volet** (#580), au bureau, sans toucher l'adresse : il ne se
   *  rouvre pas seul au désarmement, la poignée le rouvre. Un site sélectionné a sa bande. */
  const [shut, setShut] = useState(false);
  if (!narrow && placing !== null && open && !shut) setShut(true);
  if (shut && !open) setShut(false);
  /** La main qui quitte la bande lui rend la carte : elle se replie le temps du geste. */
  const folded = !open || research || away || (shut && site === null);
  const ceded = staged && (surfaceHeld || away);
  const stageUp = staged && !ceded;
  // The pose files its tile on the queue of works, and takes the size of the tile that was taken
  // while its stage is up (#592): a stage ceded has no tile to fly, the ring stays alone.
  const cededNow = useRef(ceded);
  useLayoutEffect(() => {
    cededNow.current = ceded;
  });
  useEffect(
    () =>
      bindSpots({
        tile: (key) => {
          const box = taken.current;
          return box === null || box.key !== key || cededNow.current ? null : box;
        },
        queue: () => {
          const column = narrow
            ? null
            : document.querySelector<HTMLElement>('[data-volet-column="works"]');
          // A folded volet is inert, and its column keeps its box under the clip.
          if (column !== null && column.closest('[inert]') === null) return centreOf(column);
          return board.current === null ? null : centreOf(board.current);
        },
      }),
    [narrow, taken],
  );
  const collapsed = step === 'collapsed';
  /** Le feuillet d'une tuile refusée ne survit ni au repli, ni à l'étage cédé, ni à son refus. */
  const live = refused !== null ? refusalSheetOf(view, refused, now) : null;
  const refusal = stageUp && !collapsed ? live : null;
  if (refused !== null && refusal === null) setRefused(null);
  const chooseStep = (next: KeepingHeight) => {
    if (next === step) return;
    setStep(next);
    keepTilesStep(next);
    if (next === 'collapsed') {
      setRefused(null);
      if (open) onOpen(false, narrow);
    } else if (collapsed) onUnfold?.();
  };
  // Le focus qui tenait l'étage quand une surface l'a pris retombe sur body : il revient au pli.
  const heldFocus = useRef(false);
  useLayoutEffect(() => {
    if (ceded) heldFocus.current = sheet?.contains(document.activeElement) ?? false;
    else if (heldFocus.current) {
      heldFocus.current = false;
      if (document.activeElement === document.body) sheet?.querySelector('button')?.focus();
    }
  }, [ceded, sheet]);
  const foot = useFoot();
  const claim = foot?.claim;
  // La coque mesure le sommet de ce qui couvre le pied de la carte : l'étage tant qu'il est là,
  // sinon la barre.
  const topmost = narrow ? (stageUp && sheet !== null ? sheet : bar) : null;
  useEffect(() => {
    if (claim === undefined || !narrow) return;
    claim(topmost);
    return () => claim(null);
  }, [claim, narrow, topmost]);
  const handleRef = useRef<HTMLButtonElement>(null);
  useMatRise(
    () => (narrow ? [bar, stageUp ? sheet : null] : [board.current]),
    `${narrow}-${folded}-${stageUp}-${step}-${research}-${cue?.text ?? ''}-${bar !== null}-${sheet !== null}`,
  );
  useUnfoldCascade(board, open && !research && !(shut && site === null), narrow, motion);
  const swap = useRef<HTMLDivElement>(null);
  const workshop = useQuery(api.troops.workshop, narrow ? 'skip' : seat);
  useSiteSwap(
    swap,
    site?.id ?? null,
    site === null || workshop !== undefined,
    open && !research && !(shut && site === null),
    narrow,
    motion,
  );

  // Escape lets the selected site go, or folds the band, when no window stands in front of it.
  const selected = site !== null;
  useEffect(() => {
    if (narrow || !front || folded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || held !== null || placing !== null) return;
      if (selected) onDeselectSite();
      else onOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [narrow, front, held, placing, folded, onOpen, selected, onDeselectSite]);

  // Folded, the focus that was inside the band (or that it took to the body) goes to its handle.
  const wasFolded = useRef(folded);
  useEffect(() => {
    const was = wasFolded.current;
    wasFolded.current = folded;
    if (narrow || was || !folded || away || shut) return;
    const active = document.activeElement;
    if (active === null || active === document.body || board.current?.contains(active))
      handleRef.current?.focus({ preventScroll: true });
  }, [narrow, folded, away, shut]);

  const focusedBuilding = view.me.buildings.find((building) => building.id === focused) ?? null;
  const focusedKey = focusedBuilding?.key ?? null;

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
  // Au bureau les tuiles sont debout, plateau replié (#579) : rien à déplier, la bulle les désigne.
  // Au téléphone elle se pose sur l'étage, au rang ou à la moitié : au plein, elle couvrirait le bandeau.
  const rackCued = narrow ? stageUp && !collapsed : !research && placing === null;

  /** La poignée du bureau : le titre de la bande, qui la bascule. */
  const handle = (
    <button
      ref={handleRef}
      type="button"
      aria-expanded={!folded}
      aria-label={folded ? fr.footBar.grip.open : fr.footBar.grip.fold}
      onClick={() => {
        onResearch(false);
        if (folded && open && shut) setShut(false);
        else onOpen(folded);
      }}
      className="relative grid w-[28px] shrink-0 cursor-pointer place-items-center content-center gap-[6px] self-stretch border-r border-[var(--ink)] font-(family-name:--font-body) text-[10px] leading-none font-bold tracking-[.1em] whitespace-nowrap uppercase hover:bg-(--ink)/8"
    >
      {/* Debout, la barre n'a pas la place du titre : la poignée dit son geste (#579). */}
      <span aria-hidden className="rotate-180 [writing-mode:vertical-rl]">
        {folded ? fr.personalBoard.unfold : fr.personalBoard.fold}
      </span>
      <span aria-hidden className="font-(family-name:--font-body) text-[11px]">
        {folded ? '▴' : '▾'}
      </span>
    </button>
  );
  const researchButton = (
    <button
      type="button"
      aria-expanded={research}
      onClick={() => onResearch(!research)}
      className={`relative shrink-0 cursor-pointer border border-[var(--ink)] px-[9px] py-[5px] text-[10px] font-semibold tracking-[.14em] uppercase hover:bg-(--ink)/8 ${
        research ? 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]' : ''
      }`}
    >
      {fr.research.header}
      {researchCue !== null && !research && !narrow && (
        <CueBubble
          text={researchCue}
          place="first-step-cue--corner absolute right-0 bottom-[calc(100%+9px)]"
        />
      )}
    </button>
  );
  /** Les cinq réserves : la ligne repliée, et le haut du plateau tiré. */
  const reserves = (
    <div className="flex h-full min-w-0 flex-1">
      {RESOURCES.map((resource) => (
        <ReserveCell key={resource} {...bin(resource)} />
      ))}
    </div>
  );

  const chipPortal = createPortal(
    <div
      ref={chip}
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[var(--z-notice)]"
      style={{ display: held === null ? 'none' : 'block' }}
    >
      {held !== null && <Carried held={held} hint={hint} />}
    </div>,
    document.body,
  );

  if (narrow)
    return (
      <>
        {/* **Le pied** : les réserves et la clé des surfaces, comme `FootBar` ; l'étage des tuiles
            se pose au-dessus. */}
        <section
          ref={barRef}
          aria-label={fr.footBar.label}
          className="hud paper-grain float fixed z-[var(--z-band)] flex items-stretch border border-[var(--ink)] text-[var(--ink)]"
          style={{
            left: 0,
            right: 0,
            bottom: 'calc(var(--safe-bottom) / var(--hud-scale))',
            height: FOOT_ROW,
            borderWidth: '1px 0 0',
          }}
        >
          {/* Sous le seuil, la clé des surfaces est la dernière case de la barre : le pas de
              recherche la désigne, la recherche s'ouvrant depuis son menu. */}
          {researchCue !== null && !research && (
            <CueBubble
              text={researchCue}
              place="first-step-cue--corner absolute right-0 bottom-[calc(100%+9px)]"
            />
          )}
          {reserves}
          {foot?.key}
        </section>
        {staged && (
          <BottomSheet
            stage
            hug
            title={fr.personalBoard.header}
            aside={
              <span className="min-w-0 truncate text-[11px] leading-[1.2] text-[var(--ink-soft)]">
                <WorkLine view={view} now={now} />
              </span>
            }
            onClose={() => chooseStep('collapsed')}
            height={step}
            onHeight={chooseStep}
            ceded={ceded}
            sheetRef={setSheet}
            crest={
              rackCue !== null &&
              rackCued &&
              step !== 'full' && (
                <CueBubble
                  text={rackCue}
                  place="absolute bottom-[calc(100%+9px)] left-1/2 -translate-x-1/2"
                />
              )
            }
          >
            <div ref={swap} className="relative flex h-full min-h-0 flex-col overflow-hidden">
              <div className="shrink-0">
                {focusedBuilding !== null && (
                  <FocusedBuilding building={focusedBuilding} view={view} />
                )}
                <Tiles
                  view={view}
                  now={now}
                  narrow
                  focusedKey={focusedKey}
                  held={held}
                  placing={placing}
                  motion={motion}
                  compact={step === 'full'}
                  onTake={observing ? null : take}
                />
              </div>
              {/* Le rang ne montre que les tuiles ; la moitié et le plein y ajoutent les onglets. */}
              {(step === 'half' || step === 'full') && (
                <StageTabs
                  tab={tab}
                  onTab={setTab}
                  view={view}
                  seat={seat}
                  now={now}
                  observing={observing}
                  ledger={ledger}
                  onReplay={harvest === null ? null : replay}
                  onSpent={mark}
                />
              )}
            </div>
          </BottomSheet>
        )}
        {refusal !== null && (
          <RefusalSheet refusal={refusal} motion={motion} onClose={() => setRefused(null)} />
        )}
        {chipPortal}
      </>
    );

  return (
    <>
      <section
        ref={board}
        aria-label={fr.personalBoard.header}
        className="hud paper-grain float fixed flex flex-col border border-[var(--ink)] text-[var(--ink)]"
        style={{
          left: 'calc((var(--board-left) + var(--table-gap)) / var(--hud-scale))',
          right: 'calc((var(--board-left) + var(--table-gap)) / var(--hud-scale))',
          bottom: 'calc(var(--table-margin) / var(--hud-scale))',
          // Over the to-do card of the column, which it would otherwise hide.
          zIndex: 'calc(var(--z-band) + 1)',
        }}
      >
        {rackCue !== null && rackCued && (
          <CueBubble
            text={rackCue}
            // Over the standing tiles.
            place="absolute bottom-[calc(100%+9px)] left-[360px]"
          />
        )}
        <div
          className="mat-fold grid min-h-0"
          style={{
            gridTemplateRows: folded ? '0px' : 'var(--volet-h)', // A site holds the volet's height (#581): the fold's step never plays beside the cascade.
          }}
          inert={folded}
        >
          <div
            ref={swap}
            className="relative grid min-h-0 overflow-hidden"
            style={{
              gridTemplateColumns: site === null ? '1fr' : '1fr 160px',
              gridTemplateRows: 'minmax(0, 1fr)',
            }}
          >
            {site === null ? (
              <Volet
                view={view}
                seat={seat}
                now={now}
                observing={observing}
                ledger={ledger}
                onReplay={harvest === null ? null : replay}
                onSpent={mark}
              />
            ) : (
              <SiteBand
                key={site.id}
                view={view}
                seat={seat}
                site={site}
                now={now}
                motion={motion}
                observing={observing}
                onSpent={mark}
                onDeselect={onDeselectSite}
                onOpenSheet={onOpenSiteSheet}
              />
            )}
          </div>
        </div>
        <div
          className={`flex h-[77px] shrink-0 items-stretch ${folded ? '' : 'border-t border-[var(--ink)]'}`}
        >
          {handle}
          <div className="flex w-[315px] shrink-0 border-r border-[var(--ink)]">{reserves}</div>
          <Tiles
            view={view}
            now={now}
            narrow={false}
            focusedKey={focusedKey}
            held={held}
            placing={placing}
            motion={motion}
            onTake={observing ? null : take}
          />
          <div className="flex w-[177px] shrink-0 flex-col justify-center gap-[6px] border-l border-[var(--ink)] px-[10px]">
            <span className="line-clamp-2 text-[11px] leading-[1.2] text-[var(--ink-soft)]">
              <WorkLine view={view} now={now} />
            </span>
            <span className="flex items-center justify-between gap-[6px]">
              {harvest !== null && (
                <button
                  type="button"
                  title={`${fr.personalBoard.harvestReplay} — ${ledger}`}
                  onClick={replay}
                  className="inline-flex min-w-0 shrink cursor-pointer items-center overflow-hidden gap-[8px] px-[6px] py-[4px] font-(family-name:--font-mono) text-[11px] font-semibold whitespace-nowrap"
                >
                  <em className="font-(family-name:--font-display) text-[12px] font-medium text-[var(--ink-soft)]">
                    {fr.personalBoard.harvestSince(harvest.hours)}
                  </em>
                  {harvest.deltas
                    .filter(({ amount, lost }) => amount !== 0 || lost > 0)
                    .map(({ resource, amount, lost }) => (
                      <span
                        key={resource}
                        className="inline-flex items-center gap-[2px]"
                        style={amount < 0 ? { color: 'var(--critical)' } : undefined}
                      >
                        <ResourcePlate resource={resource} height={18} width={18} />
                        {amount !== 0 && fr.personalBoard.delta(amount)}
                        {lost > 0 && (
                          <span
                            aria-hidden
                            title={fr.personalBoard.lost(lost)}
                            className="ml-[2px] inline-grid h-[11px] w-[11px] place-items-center rounded-full bg-[var(--critical)] font-(family-name:--font-body) text-[8px] leading-none font-bold text-[var(--paper)]"
                          >
                            !
                          </span>
                        )}
                      </span>
                    ))}
                </button>
              )}
              {researchButton}
            </span>
          </div>
        </div>
      </section>
      {chipPortal}
    </>
  );
}

/**
 * **Ce que la bande prend au pied de la table**, publié en `--mat-rise` (pixels d'écran, du bas
 * de l'écran au-dessus d'elle et de ce qu'elle pose au-dessus d'elle : la recherche, la bulle ;
 * sous le seuil, la barre et l'étage des tuiles quand il est là) :
 * ce qui se pose au bas de la carte se lève d'autant (`MAT_LIFT`) au lieu de passer dessous.
 * `shape` change quand ce qu'elle pose change : on remesure, et on observe les nouvelles pièces.
 */
function useMatRise(nodes: () => ReadonlyArray<HTMLElement | null>, shape: string) {
  useEffect(() => {
    const held = nodes().filter((node): node is HTMLElement => node !== null);
    if (held.length === 0) return;
    const parts = held.flatMap((node) => [
      node,
      ...node.querySelectorAll<HTMLElement>('[data-mat-part], .first-step-cue'),
    ]);
    const root = document.documentElement.style;
    // The stage rises into place (an animation moves its box, no resize says so): its top at rest is
    // the bar's top less its own height, and what it carries (a bubble) is read again when it ends.
    const topOf = (part: HTMLElement) =>
      part.hasAttribute('data-stage')
        ? held[0]!.getBoundingClientRect().top - part.getBoundingClientRect().height
        : part.getBoundingClientRect().top;
    const publish = () => {
      const top = Math.min(...parts.map(topOf));
      root.setProperty('--mat-rise', `${Math.round(window.innerHeight - top + MAT_GAP_PX)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    for (const part of parts) observer.observe(part);
    for (const node of held) node.addEventListener('animationend', publish);
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      for (const node of held) node.removeEventListener('animationend', publish);
      window.removeEventListener('resize', publish);
      root.removeProperty('--mat-rise');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shape` says when the nodes changed
  }, [shape]);
}

/** Each column cascades on its own: a long queue must not use up the others' share. */
function cascadeVolet(node: ParentNode) {
  node.querySelectorAll('[data-volet-column]').forEach((column) => {
    enter(column.matches('.mat-line') ? [column] : [...column.querySelectorAll('.mat-line')]);
  });
}

/** How long the old row takes to fade out before the new one comes in (the prototype's). */
const SWAP_FADE_MS = 120;

/**
 * **Le rang qui change de contenu** (#581) : quand le site sélectionné change (tuiles → site,
 * site → site, site → tuiles), l'ancien rang s'efface en 120 ms, puis le nouveau entre en cascade.
 * La cascade attend que ses cartes existent (`ready`) et ne part qu'une fois par changement ; le
 * dépliage et le repli à la main ne la rejouent pas. « actives » : fondu puis cascade ; « réduites » :
 * le nouveau contenu fond en 120 ms ; « coupées » : aucun mouvement. Au bureau seulement.
 */
function useSiteSwap(
  node: { readonly current: HTMLElement | null },
  siteId: string | null,
  ready: boolean,
  unfolded: boolean,
  narrow: boolean,
  motion: MapMotion,
) {
  const was = useRef(siteId);
  const wasUnfolded = useRef(unfolded);
  const pending = useRef(false);
  /** The row as the last commit left it: the ghost of the next change. */
  const last = useRef<HTMLElement | null>(null);
  /** Whether the row's DOM moved since `last` was cloned: only then is a new clone worth it. */
  const moved = useRef(true);
  const watcher = useRef<MutationObserver | null>(null);
  useEffect(() => () => watcher.current?.disconnect(), []);
  useLayoutEffect(() => {
    const row = node.current;
    // The volet opening in this very commit plays its own cascade (`useUnfoldCascade`): one trigger.
    const opened = unfolded && !wasUnfolded.current;
    wasUnfolded.current = unfolded;
    const changed = siteId !== was.current;
    was.current = siteId;
    if (row === null || narrow || motion === 'off') return;
    if (opened) pending.current = false;
    else if (changed) {
      pending.current = true;
      if (motion === 'full' && last.current !== null) {
        const ghost = last.current;
        ghost
          .querySelectorAll('[data-volet-column]')
          .forEach((one) => one.removeAttribute('data-volet-column'));
        ghost.dataset.swapGhost = '';
        ghost.inert = true;
        Object.assign(ghost.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
        row.append(ghost);
        ghost
          .animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: SWAP_FADE_MS,
            easing: CASCADE.easing,
            fill: 'forwards',
          })
          .finished.then(
            () => ghost.remove(),
            () => ghost.remove(),
          );
      }
    }
    if (pending.current && ready) {
      pending.current = false;
      if (motion === 'reduced') row.animate([{ opacity: 0 }, { opacity: 1 }], SWAP_FADE_MS);
      else {
        const mine = (one: Element) => one.closest('[data-swap-ghost]') === null;
        enter([...row.querySelectorAll('[data-site-card]')].filter(mine));
        cascadeVolet(row);
      }
    }
    if (motion !== 'full') last.current = null;
    else {
      watcher.current ??= new MutationObserver(() => (moved.current = true));
      watcher.current.observe(row, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      if (watcher.current.takeRecords().length > 0) moved.current = true;
      if (moved.current || last.current === null) {
        moved.current = false;
        const copy = row.cloneNode(true) as HTMLElement;
        copy.querySelector('[data-swap-ghost]')?.remove();
        copy.querySelectorAll('[id]').forEach((one) => one.removeAttribute('id'));
        last.current = copy;
      }
    }
  });
}

/**
 * **Le dépliage en cascade** (#251) : quand l'utilisateur ouvre le volet — pas quand la main le
 * replie le temps d'un geste —, ses lignes entrent (`.mat-line`, les 8 premières de chaque colonne, #580).
 * « actives » seulement ; au bureau seulement, le téléphone tire sa feuille.
 */
function useUnfoldCascade(
  board: { readonly current: HTMLElement | null },
  unfolded: boolean,
  narrow: boolean,
  motion: MapMotion,
) {
  const was = useRef(unfolded);
  useEffect(() => {
    const opened = unfolded && !was.current;
    was.current = unfolded;
    const node = board.current;
    if (!opened || node === null || narrow || motion !== 'full') return;
    cascadeVolet(node);
  }, [board, unfolded, narrow, motion]);
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
    const flights = harvest.deltas.flatMap(({ resource, amount, lost }, rank) =>
      pastilleShares(amount).map((share, index, shares) =>
        flyToBin(layer, resource, bins.current.get(resource), amount > 0, motion, {
          delay: 250 + rank * 120 + index * 160,
          // Un bac plein refuse la dernière : elle rebondit sur son bord, « perdu ».
          spills: lost > 0 && amount > 0 && index === shares.length - 1,
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
 * — de la table — en arc (`flyPastille`, partagé avec les échanges). Le bac sursaute à son arrivée
 * (« actives »), ou dit « perdu » quand le sien était plein.
 */
function flyToBin(
  layer: HTMLElement,
  resource: ResourceKey,
  bin: HTMLElement | undefined,
  gain: boolean,
  motion: MapMotion,
  { delay, spills }: { delay: number; spills: boolean },
): Promise<void> {
  if (bin === undefined) return Promise.resolve();
  const box = bin.getBoundingClientRect();
  const atBin = { x: box.left + box.width / 2, y: box.top + Math.min(18, box.height / 2) };
  const table = { x: atBin.x + (Math.random() - 0.5) * 120, y: Math.max(40, box.top - 220) };
  const [from, to] = gain ? [table, atBin] : [atBin, table];
  return flyPastille(
    layer,
    resource,
    { from, to, rest: atBin, fade: !gain, bounce: spills },
    motion,
    { delay },
  ).then(() => {
    if (!gain) return;
    if (spills) return say(bin, fr.personalBoard.spilled, motion);
    if (motion === 'full')
      bin.animate(
        [
          { transform: 'scale(1)' },
          { transform: 'scale(1.07)', offset: 0.35 },
          { transform: 'scale(1)' },
        ],
        {
          duration: 260,
          easing: 'ease-out',
        },
      );
  });
}

/** A word on the bin for a moment, in the tag the counters use. */
function say(bin: HTMLElement, word: string, motion: MapMotion) {
  const tag = document.createElement('span');
  tag.className = `reserve-tag ${motion === 'reduced' ? 'reserve-tag--quiet' : ''}`;
  tag.textContent = word;
  Object.assign(tag.style, {
    left: '50%',
    top: '-4px',
    transform: 'translateX(-50%)',
    background: 'var(--critical)',
  });
  tag.addEventListener('animationend', () => tag.remove());
  bin.append(tag);
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
  const { condition } = placementOf(view, key, reachesOf({ me: view.me }, outpostReachKm));
  return condition === null ? null : conditionText(condition);
}

/** **Le rang des tuiles de bâtiments** : au téléphone dans la bande, tant qu'aucun site n'est
 *  sélectionné ; au bureau debout dans la barre, plateau replié ou non (#579). */
function Tiles({
  view,
  now,
  narrow,
  focusedKey,
  held,
  placing,
  motion,
  compact = false,
  onTake,
}: {
  view: PlayerView;
  now: number;
  narrow: boolean;
  focusedKey: BuildingKey | null;
  held: BuildingKey | null;
  placing: BuildingKey | null;
  motion: MapMotion;
  /** The full step (#590): the row shrinks to names and figures, in a fade (nothing when off). */
  compact?: boolean;
  onTake: ((key: BuildingKey, grab: Grab) => void) | null;
}) {
  const lit = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    lit.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focusedKey]);
  // The row's form changes with the step: it fades in its new form, but not on the first draw.
  const [was, setWas] = useState(compact);
  const [changed, setChanged] = useState(false);
  if (was !== compact) {
    setWas(compact);
    setChanged(true);
  }
  const fade = changed && motion !== 'off' ? 'tab-fade' : '';
  return (
    <section
      key={compact ? 'compact' : 'whole'}
      className={`min-w-0 ${narrow ? (compact ? 'px-[10px] py-[4px]' : 'px-[10px] py-[6px]') : 'relative flex-1'} ${fade}`}
    >
      <Rail
        narrow={narrow}
        standing={!narrow}
        motion={motion}
        label={narrow ? fr.personalBoard.tilesNotePhone : fr.personalBoard.tilesNote}
      >
        {(grip) =>
          BUILDABLE_BUILDINGS.map((key) => (
            <Tile
              key={key}
              ref={key === focusedKey ? lit : undefined}
              buildingKey={key}
              view={view}
              now={now}
              narrow={narrow}
              compact={compact}
              lit={key === focusedKey || key === placing || (narrow && key === held)}
              inHand={key === held}
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
  lifts = true,
  wide = false,
  compact = false,
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
  /** A tile that lifts keeps the finger's upward gesture for itself (`touch-pan-x`); one that
   *  does not lets the column scroll under it. */
  lifts?: boolean;
  /** A troop card of the site band: wide and tall enough to say its refusal whole. */
  wide?: boolean;
  /** The full step's row (#590): the name and the figure alone, so the tabs keep the room. What
   *  the tile says (price, time, refusal) stays in its label and in the refusal at the touch. */
  compact?: boolean;
  picture: ReactNode;
  meta: string;
  price: ReactNode;
}) {
  const label = `${name} — ${meta}`;
  if (compact)
    return (
      <button
        ref={ref}
        type="button"
        {...grip}
        title={label}
        aria-label={label}
        className={`group relative flex min-h-[calc(44px/var(--hud-scale))]! w-[96px] shrink-0 touch-pan-x snap-start items-center gap-[5px] border border-[var(--ink)] px-[5px] text-left text-[var(--ink)] select-none focus-visible:outline-2 focus-visible:outline-[var(--ochre)] ${
          locked ? 'border-dashed bg-transparent' : 'bg-[#efe5cc] shadow-[0_2px_0_var(--ink)]'
        } ${'onClick' in grip ? 'cursor-pointer' : ''} ${lit ? 'outline-2 outline-offset-1 outline-[var(--ochre)]' : ''}`}
      >
        <span aria-hidden className="grid shrink-0 place-items-center overflow-hidden">
          {picture}
        </span>
        <b className="line-clamp-2 min-w-0 text-[10.5px] leading-[1.1] font-semibold">{name}</b>
      </button>
    );
  return (
    <button
      ref={ref}
      type="button"
      {...grip}
      title={label}
      aria-label={label}
      data-site-card={wide ? '' : undefined}
      className={`group relative grid shrink-0 ${lifts ? 'touch-pan-x' : 'touch-pan-x touch-pan-y'} snap-start grid-rows-[auto_1fr_auto_auto] border border-[var(--ink)] text-left text-[var(--ink)] select-none focus-visible:outline-2 focus-visible:outline-[var(--ochre)] ${
        narrow
          ? 'h-[98px] w-[84px] px-[5px] pt-[4px] pb-[5px]'
          : wide
            ? 'h-[130px] w-[108px] px-[6px] pt-[5px] pb-[6px]'
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
        className={`leading-[1.1] ${
          locked
            ? `${wide && !narrow ? 'line-clamp-3' : 'line-clamp-2'} font-semibold text-[var(--critical)]`
            : `line-clamp-2 font-(family-name:--font-mono) text-[var(--ink-soft)]`
        } ${narrow ? 'text-[9px]' : 'text-[9.5px]'}`}
      >
        {meta}
      </span>
      <span className="mt-[2px] font-(family-name:--font-mono) text-[9.5px] whitespace-nowrap">
        {price}
      </span>
      {/* Retenue, la carte dit son refus entier, au survol ou au focus (la tuile le porte déjà en
          `aria-label`). */}
      {locked && !narrow && (
        <span
          aria-hidden
          className="mat-refusal paper-grain absolute inset-[20px_3px_3px] hidden overflow-hidden border-t border-[var(--critical)] p-[4px] text-[10px] leading-[1.25] font-semibold text-[var(--critical)] group-hover:block group-focus-visible:block"
        >
          {meta}
        </span>
      )}
    </button>
  );
}

/** **Ce que dit une tuile de sa clé**, pour sa face et pour son feuillet de refus : les pareilles
 *  debout, la plus basse d'entre elles, la fondation offerte, la réserve de l'Évacuation et la
 *  facture. */
function tileStateOf(view: PlayerView, key: BuildingKey, now: number) {
  const standing = view.me.buildings.filter((building) => building.key === key);
  /** **Sa pareille debout**, la plus basse : la tuile dit l'élévation et son prix, comme la
   *  maquette ; lâchée ailleurs sur la carte, elle bâtit toujours. */
  const lowest = standing.reduce<Building | null>(
    (low, building) => (low === null || building.level < low.level ? building : low),
    null,
  );
  const free = view.me.foundation.some((due) => due.key === key);
  /** **La réserve de l'Évacuation** (ADR 0039 §5) : la prochaine pose payée coûte un niveau 1 et
   *  sort au niveau gardé, sous le plafond du QG. Elle prend la ligne et le prix de la tuile : une
   *  ligne de plus serait tronquée au bureau ; posée sur sa pareille, la main dit l'élévation. */
  const kept = keptOf(view.me.evacuated, key);
  /** La facture que la tuile affiche, lue par la même fonction que le fantôme de pose. */
  const bill = tileBillOf(
    tileCostOf(free, kept, lowest, view.buildCatalog[key].cost),
    (resource) => view.me.resources[resource],
    view.loadedAt,
    now,
  );
  return { standing, lowest, free, kept, bill };
}

/** **Le refus d'une tuile, dit en entier** (#589) : la phrase du refus de pose s'il y en a une,
 *  sinon le manque, et chaque matière contre le stock. `null` : la tuile s'arme, rien à dire. */
function refusalSheetOf(view: PlayerView, key: BuildingKey, now: number) {
  const refusal = tileRefusalOf(view, key);
  if (refusal === null) return null;
  const { bill } = tileStateOf(view, key, now);
  return { name: fr.buildings[key], key, text: refusal, bill };
}

type Refusal = NonNullable<ReturnType<typeof refusalSheetOf>>;

/**
 * **Le feuillet du refus d'une tuile** (#589, finaliste « refus-tuile ») : posé juste au-dessus de
 * l'étage, il dit la phrase entière et, matière par matière, ce que le joueur tient contre ce que la
 * tuile coûte. Il se ferme par sa croix. Il se lève en 200 ms ; en « réduites », un fondu de 120 ms ;
 * en « coupées », il paraît tel quel.
 */
function RefusalSheet({
  refusal,
  motion,
  onClose,
}: {
  refusal: Refusal;
  motion: MapMotion;
  onClose: () => void;
}) {
  const node = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (motion === 'off') return;
    node.current?.animate?.(
      motion === 'full'
        ? [
            { opacity: 0, translate: '0 12px' },
            { opacity: 1, translate: '0 0' },
          ]
        : [{ opacity: 0 }, { opacity: 1 }],
      { duration: motion === 'full' ? 200 : 120, easing: 'ease-out' },
    );
  }, [motion, refusal.key]);
  return (
    <aside
      ref={node}
      role="status"
      aria-label={fr.personalBoard.refusalOf(refusal.name)}
      className="hud paper-grain float fixed z-[var(--z-band)] grid gap-[3px] border border-[var(--critical)] border-l-[4px] px-[12px] py-[8px] text-[var(--ink)]"
      style={{
        left: 'calc(10px / var(--hud-scale))',
        right: 'calc(10px / var(--hud-scale))',
        bottom: 'calc(var(--mat-rise, 0px) / var(--hud-scale))',
      }}
    >
      <span className="flex items-center gap-[8px]">
        <BuildingPlate building={refusal.key} height={26} />
        <b className="min-w-0 flex-1 truncate font-(family-name:--font-display) text-[15px]">
          {refusal.name}
        </b>
        <button
          type="button"
          aria-label={fr.personalBoard.refusalClose}
          onClick={onClose}
          className="shrink-0 cursor-pointer px-[10px] text-[16px] leading-none"
        >
          ✕
        </button>
      </span>
      {refusal.bill.map((line) => (
        <span
          key={line.resource}
          className="text-[12px] leading-[1.25]"
          style={line.missing > 0 ? { color: 'var(--critical)' } : undefined}
        >
          {fr.resources[line.resource]}{' '}
          <b className="font-(family-name:--font-mono) font-semibold">{Math.floor(line.held)}</b>
          {' / '}
          {line.due}
        </span>
      ))}
      <p className="text-[12px] leading-[1.3] font-semibold text-[var(--critical)]">
        {refusal.text}
      </p>
    </aside>
  );
}

function Tile({
  ref,
  buildingKey,
  view,
  now,
  narrow,
  compact,
  lit,
  inHand,
  grip,
}: {
  ref?: Ref<HTMLButtonElement> | undefined;
  buildingKey: BuildingKey;
  view: PlayerView;
  now: number;
  narrow: boolean;
  compact: boolean;
  lit: boolean;
  inHand: boolean;
  grip: Grip;
}) {
  const { standing, lowest, free, kept, bill } = tileStateOf(view, buildingKey, now);
  const refusal = tileRefusalOf(view, buildingKey);
  const time = countdownLabel(view.buildCatalog[buildingKey].minutes * 60_000);
  const name = fr.buildings[buildingKey];
  const meta =
    kept !== null
      ? fr.personalBoard.tileKept(kept, keptLevelOf(kept, view.me.hqLevel))
      : lowest === null
        ? time
        : `${standing.length > 1 ? `${fr.personalBoard.tileCount(standing.length)} · ` : ''}${fr.personalBoard.raiseTo(lowest.level, lowest.level + 1)}`;
  const costs = Object.fromEntries(bill.map((line) => [line.resource, line.due]));
  if (narrow)
    return (
      <TileFrame
        ref={ref}
        name={name}
        narrow
        compact={compact}
        locked={refusal !== null}
        lit={lit}
        grip={grip}
        picture={<BuildingPlate building={buildingKey} height={compact ? 24 : 34} />}
        meta={refusal ?? meta}
        price={free ? fr.construction.free : <Price costs={costs} size={10} />}
      />
    );
  // Le refus de placement d'abord, le manque ensuite : une tuile courte reste armable (#579).
  const shortage = refusal === null ? billShortageText(bill) : null;
  const said = refusal ?? shortage ?? meta;
  const held = Object.fromEntries(bill.map((line) => [line.resource, line.held]));
  return (
    <button
      ref={ref}
      type="button"
      {...grip}
      aria-label={`${name} — ${said}`}
      className={`desk-tile relative grid h-[70px] w-[102px] shrink-0 snap-start touch-pan-x gap-x-[5px] gap-y-[2px] border border-[var(--ink)] px-[6px] pt-[4px] pb-[3px] text-left text-[var(--ink)] select-none focus-visible:outline-2 focus-visible:outline-[var(--ochre)] ${
        refusal === null
          ? 'grid-cols-[27px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-[#efe5cc] shadow-[0_2px_0_var(--ink)]'
          : 'grid-cols-[23px_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] border-dashed bg-[#efe5cc]/45'
      } ${inHand ? 'border-dashed opacity-35 shadow-none' : ''} ${
        'onClick' in grip ? 'cursor-pointer' : ''
      } ${lit ? 'outline-2 outline-offset-1 outline-[var(--ochre)]' : ''}`}
    >
      <b className="col-span-2 truncate text-[11px] leading-[1.1] font-semibold">{name}</b>
      <span
        className={`grid min-h-0 place-items-center overflow-hidden ${refusal === null ? '' : 'opacity-75'}`}
      >
        <BuildingPlate building={buildingKey} height={28} />
      </span>
      {refusal === null ? (
        <>
          <span className="flex min-w-0 flex-col justify-center font-(family-name:--font-mono) text-[10px] leading-[1.15]">
            {free ? fr.construction.free : <Price costs={costs} held={held} size={10} stacked />}
          </span>
          <span className="col-span-2 truncate font-(family-name:--font-mono) text-[10px] leading-[1.15] text-[var(--ink-soft)]">
            {meta}
          </span>
        </>
      ) : (
        <span className="line-clamp-3 self-center text-[10px] leading-[1.15] font-semibold text-[var(--critical)]">
          {refusal}
        </span>
      )}
      {/* Levée, la tuile dit chaque matière contre le stock, puis son refus ou son manque entier. */}
      <span
        aria-hidden
        data-refused={refusal === null ? undefined : true}
        className={`desk-tile-more grid content-start gap-[2px] text-[10.5px] leading-[1.25] ${
          refusal === null ? 'bg-[#efe5cc]' : 'bg-[var(--paper)]'
        }`}
      >
        {bill.map((line) => (
          <span
            key={line.resource}
            className="whitespace-nowrap"
            style={line.missing > 0 ? { color: 'var(--critical)' } : undefined}
          >
            {fr.resources[line.resource]}{' '}
            <b className="font-(family-name:--font-mono) font-semibold">{Math.floor(line.held)}</b>
            {' / '}
            {line.due}
          </span>
        ))}
        <span
          className={
            refusal === null && shortage === null ? 'text-[var(--ink-soft)]' : 'font-semibold'
          }
          style={refusal === null && shortage === null ? undefined : { color: 'var(--critical)' }}
        >
          {said}
        </span>
      </span>
    </button>
  );
}

/**
 * **Le bâtiment dont le mât a ouvert la bande, nommé** (#347) : au doigt, la bande n'a pas de ligne
 * par bâtiment, et le mât touché est le seul qu'on désigne. « Raser » y dit lequel il rase.
 */
function FocusedBuilding({ building, view }: { building: Building; view: PlayerView }) {
  const region = view.me.regions.find((one) => one.id === building.regionId)?.name;
  return (
    <section className="border-b border-(color:--ink)/32">
      <p className="px-[10px] pt-[6px] text-[11px] leading-[1.3] text-[var(--ink-soft)]">
        <b className="font-semibold text-[var(--ink)]">{building.name}</b>
        {region === undefined ? '' : ` · ${region}`}
      </p>
      <RazeButton view={view} building={building} className="px-[10px] pb-[9px]" />
    </section>
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
  motion: MapMotion;
  observing: boolean;
  onSpent: () => void;
  onDeselect: () => void;
  onOpenSheet: () => void;
}) {
  const workshop = useQuery(api.troops.workshop, seat);
  const recruit = useMutation(api.troops.recruit);
  const queue = useRef<HTMLElement>(null);
  const more = useOverflow(queue, 'y');
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
    <div className="grid w-[104px] content-start gap-[5px] pr-1">
      <span className="flex items-center gap-[6px]">
        <BuildingPlate building={site.key} height={28} />
        <b className="text-[13px] leading-[1.1] font-semibold">{siteName}</b>
      </span>
      <span className="text-[11px] leading-[1.25] text-[var(--ink-soft)]">
        {region} · {fr.common.levelSpeed(site.level)}
      </span>
      <span className="mt-[2px] flex flex-col items-start gap-[10px]">
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
        className="grid min-w-0 grid-cols-[auto_1fr] gap-[10px] border-l border-[var(--ink)] py-[6px] pl-3"
      >
        {head}
        {workshop === undefined ? (
          <p className="self-center text-[11.5px] text-[var(--ink-soft)]">
            {fr.production.opening}
          </p>
        ) : (
          <Rail narrow={false} motion={motion} label={fr.personalBoard.siteCards(siteName)}>
            {(grip) =>
              cards.map((card) => (
                <TileFrame
                  key={`${card.role}-${card.tier}`}
                  name={pieceName(card.role, card.tier)}
                  narrow={false}
                  locked={card.refusal !== null}
                  lit={false}
                  grip={grip(observing ? null : () => form(card), { lifts: false })}
                  lifts={false}
                  wide
                  picture={
                    <UnitSprite
                      nation={view.me.nation}
                      role={card.role}
                      tier={card.tier}
                      height={50}
                      width={84}
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
        ref={queue}
        data-after={more.after}
        className="mat-more min-w-0 overflow-y-auto border-l border-[var(--ink)] px-3 py-[10px]"
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
        {fr.personalBoard.workAt(
          running.name,
          running.kept === undefined ? running.level : keptLevelOf(running.kept, view.me.hqLevel),
          running.regionName,
        )}
      </b>
      {fr.personalBoard.workTail(
        countdownLabel(currentMinutes(running.minutesLeft, view.loadedAt, now) * 60_000),
        view.me.constructionQueue.length,
      )}
    </>
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
  maquetteAt,
  onRefuse,
}: {
  view: PlayerView;
  /** **Une tuile refusée, touchée sans glisser** : au téléphone son feuillet (#589), au bureau la
   *  phrase seule (`null`). */
  onRefuse: ((key: BuildingKey) => void) | null;
  /** A spend made from the board: its reading is renewed, so the next harvest does not bill it. */
  onSpent: () => void;
  seat: Seat;
  board: { readonly current: HTMLElement | null };
  motion: MapMotion;
  onHoldTile: (key: BuildingKey | null) => void;
  onPlaceTile: () => boolean;
  maquetteAt: MaquetteAt | null;
}) {
  const [held, setHeld] = useState<BuildingKey | null>(null);
  const [hint, setHint] = useState<Hint>(null);
  /** The hand has left the personal board: it folds to its head and gives the map back. */
  const [away, setAway] = useState(false);
  const chip = useRef<HTMLDivElement>(null);
  const start = useMutation(api.constructions.start);
  const latest = useRef(view);
  // The release reads the board's callbacks as they are then: the ghost's point is not known at the grab.
  const callbacks = useRef({ onHoldTile, onPlaceTile, onSpent, maquetteAt });
  // Written after the commit and not during the render (#189): a ref written while rendering
  // keeps the compiler off this hook, and `take` changed identity at every tick of the clock —
  // the board's eleven tiles rendered again every second.
  useLayoutEffect(() => {
    latest.current = view;
    callbacks.current = { onHoldTile, onPlaceTile, onSpent, maquetteAt };
  });
  const gesture = useRef<{ cancel: () => void } | null>(null);
  /** The tile last taken, as it stood on its stage: the pose's flight takes its size (#592). */
  const taken = useRef<{ key: BuildingKey; width: number; height: number } | null>(null);

  /** The refusal's sentence waits for the shake: unmounted before, it never comes. */
  const saying = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      gesture.current?.cancel();
      window.clearTimeout(saying.current);
    },
    [],
  );

  const take = (key: BuildingKey, { element, pointerId, x, y }: Grab): void => {
    gesture.current?.cancel();
    // A finger's capture is implicit, on what it touched — the plate's image inside the tile —
    // and kept the moves from the map: the ghost never moved (#205).
    if (pointerId !== null)
      for (const node of [element, ...element.querySelectorAll('*')])
        if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
    const origin = element.getBoundingClientRect();
    taken.current = { key, width: origin.width, height: origin.height };
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
      const reading = readingOf(
        key,
        targetAt(x, y, board.current, latest.current, callbacks.current.maquetteAt),
        latest.current,
      );
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
        targetAt(at.x, at.y, board.current, latest.current, callbacks.current.maquetteAt),
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

    /** Taken without a drag, the tile leaves the ghost armed and the hand empty. Refused at the
     *  desk, it shakes where it stands, then its sentence comes (#579). */
    const toClick = () => {
      if (refusal !== null) {
        abandon();
        if (motion === 'full') element.animate(SHAKE, { duration: 220, easing: 'ease-out' });
        saying.current = window.setTimeout(
          () => (onRefuse === null ? notify(refusal) : onRefuse(key)),
          motion === 'full' ? 220 : 0,
        );
        return;
      }
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

  return { held, hint, away, take, chip, taken };
}

/** What lies under the hand: the personal board itself, the player's buildings at one mast (a
 *  grouped mast names several), or the map. */
type Target =
  | { readonly kind: 'board' }
  | { readonly kind: 'buildings'; readonly buildings: ReadonlyArray<Building> }
  | { readonly kind: 'map' };

function targetAt(
  x: number,
  y: number,
  board: HTMLElement | null,
  view: PlayerView,
  maquetteAt: MaquetteAt | null,
): Target {
  const under = document.elementsFromPoint(x, y);
  if (under.some((element) => board?.contains(element) === true || element.closest('[data-stage]')))
    return { kind: 'board' };
  for (const element of under) {
    const ids = element.closest<HTMLElement>('[data-building-id]')?.dataset.buildingId?.split(',');
    const buildings = view.me.buildings.filter((one) => ids?.includes(one.id) === true);
    if (buildings.length > 0) return { kind: 'buildings', buildings };
  }
  const drawn = buildingsOfMaquette(view.me.buildings, maquetteAt?.(x, y) ?? null);
  return drawn.length > 0 ? { kind: 'buildings', buildings: drawn } : { kind: 'map' };
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
