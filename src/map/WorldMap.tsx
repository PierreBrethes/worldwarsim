// Le moteur de carte est une classe impérative reçue en ref, à qui on assigne des
// callbacks (`.onSelect`, `.onRegionHover`, …) — React Compiler lit ça comme une
// mutation interdite. Exclusion volontaire : le moteur n'importe pas React (CLAUDE.md).
'use no memo';

import { SweepOverlay, type SweepRequest } from './SweepOverlay';
import { clusterSheetOf, type Pin } from '@/domain/pins';
import { ClusterSheet } from './ClusterSheet';
import type { TourAct } from '@/domain/cargo-tag';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { countryLabel, fr } from '@/i18n/fr';
import {
  loadRegionIndex,
  loadRegionTypes,
  type HoveredRegion,
  type RegionIdentity,
} from '@/domain/world';
import type { LonLat } from '@/domain/geo';
import type { Ground } from '@/domain/routing';
import type { Atlas } from '@/domain/atlas';
import type { Shore } from './engine/sea';
import { loadNearAtlas } from '@/data/atlas';
import type { Theatre } from '@/domain/theatres';
import type { MapLabel, Reach } from '@/domain/labels';
import type { IndicatorToggles } from '@/domain/indicators';
import {
  isOrder,
  type CompassAction,
  type CompassTarget,
  type OrderAction,
  type Compass,
} from '@/domain/compass-rose';
import {
  type ArcView,
  type JournalDispatch,
  type ReplayView,
  type TroopStation,
  type TroopView,
} from '@/domain/player-view';
import { asClockTime } from '@/domain/duration';
import { inkBursts } from '@/domain/ink-bursts';
import { bindSpots } from '@/shell/flights';
import type { ReplayStep } from '@/domain/replay';
import { aboardOf, descentesOf, sortiesOf } from './cues';
import { raisedReaches, type ReachedOutpost } from '@/domain/outpost-reach-ink';
import { markGestureHintSeen, readHudScale, gestureHintSeen } from '@/data/settings';
import { shareUnchanged } from '@/data/shareUnchanged';
import { useDayCycle } from '@/data/dayCycle';
import { useContourWeight } from '@/data/contourWeight';
import { useMapMotion } from '@/data/mapMotion';
import { usePieceScale } from '@/data/pieceScale';
import { useMouseMapping } from '@/data/mouseMapping';
import type { MouseMapping } from '@/domain/mouse-mapping';
import { MAT_LIFT_HUD, useBoardInsets, useCoarsePointer, useNarrowScreen } from '@/shell/viewport';
import { Price } from '@/shell/Price';
import type { Cost } from '@/domain/player-view';
import { RouteScale } from './RouteScale';
import type { CargoAim } from './CargoTags';
import { MapLabels } from './MapLabels';
import { EdgeIndicators } from './EdgeIndicators';
import { CompassRose } from './CompassRose';
import {
  DropHintChip,
  hintOfReading,
  ringOfHint,
  type DropHint,
  type DropFuel,
  type DropNote,
  type PieceFrom,
} from './DropHint';
import { insideStroke } from '@/domain/selection';
import { dropReadingOf, turnChoice, type DropReading } from '@/domain/drop-order';
import type { TakeDepot } from './MapLabels';
import type { TourLoop } from './engine/tour-ink';
export type { TourLoop };

const NO_LOOPS: ReadonlyArray<TourLoop> = [];
import {
  DETACH_MS,
  MapEngine,
  type CarryTarget,
  type HeldClaim,
  type PieceClick,
  type PieceHold,
  type HeldPlacing,
  type PlacingMagnet,
  type PlacingSpot,
  type PlacingThread,
  type SearchArea,
  type StandingMaquette,
  type StandingPile,
  type SurveyedCamp,
} from './engine';
import { ADVERSE_INK } from './engine/palette';

type Props = {
  /** The atlas at its far level; the near one is fetched after the board (ADR 0034). */
  atlas: Atlas;
  /** La grille de routage, chargée avec l'atlas : la visée la lit dès le premier clic. */
  shore: Shore;
  arcs: ReadonlyArray<ArcView>;
  /** My troops: a movement's wear is read on them, the arc does not carry strength. */
  troops: ReadonlyArray<TroopView>;
  /** The dispatches the player already receives: the only thing the map is allowed to stamp. */
  journal: ReadonlyArray<JournalDispatch>;
  labels: ReadonlyArray<MapLabel>;
  /** My piles standing at a point, which the board dresses in figurines up close. */
  standing: ReadonlyArray<StandingPile>;
  /** The enemy's surveyed camps, which the board annotates in ink up close. */
  camps: ReadonlyArray<SurveyedCamp>;
  /** Every piece far away, a pin (#234): mine at my ink, what I surveyed hollow. */
  pins: ReadonlyArray<Pin>;
  /** Buildings, surveyed installations and objectives, which the board stands as maquettes up close. */
  maquettes: ReadonlyArray<StandingMaquette>;
  /**
   * **Qui tient quelles régions, et de quelle encre** (ADR 0033) — servi par `control.held`,
   * jamais recalculé ici : la carte dessine ce qu'on lui tend.
   */
  held: ReadonlyArray<HeldClaim>;
  /** My outposts: when one stands up or is raised, the map inks the reach it now holds. */
  outposts: ReadonlyArray<ReachedOutpost>;
  /**
   * **My regions that lost their colour** (ADR 0020 §6), and those where something of mine
   * produces: a region that loses it under a producer is stamped « hors réseau » beside its
   * maquette. The colour is what is diffed, not the sites — a producer finished on ground already
   * cut was never cut.
   */
  cut?: { readonly unlinked: ReadonlyArray<string>; readonly producing: ReadonlySet<string> };
  selectedCountry: string | null;
  playerNation: string | null;
  /** The categories whose off-frame entities fold to the screen edge. */
  indicators: IndicatorToggles;
  /** The id of the movement the timeline designates — the matching arc rises in intensity. */
  accentedMovement: string | null;
  /** **Ce qui se range sous l'échelle du trajet**, au coin droit : un refus d'ordre s'empile sous
   *  elle au lieu de la recouvrir. */
  underRouteScale?: ReactNode;
  /** A Blitz keeps the scale for crossings only: a one-medium route is on the order card. */
  quietRouteScale?: boolean;
  onSelect: (name: string | null) => void;
  /** A click on a building's mast opens its surface instead of selecting the country. */
  onOpenBuilding?: (buildingId: string, clientX: number, clientY: number) => void;
  /**
   * **Le clic sur l'étiquette d'une adresse à moi** : une pile posée se lève (toute la pile), un
   * mât d'avant-poste ouvre sa garnison. Il rend vrai quand le clic **pose** la pièce en main sur
   * cette pile — elle devient la destination, et la carte ouvre la rose comme au clic « agir ».
   */
  onOpenStack?: (station: TroopStation, clientX: number, clientY: number) => boolean;
  /** **La pièce en main** (ADR 0026 §6), que le moteur porte sous le pointeur. */
  holding?: PieceHold | null;
  /** Compte les ordres partis : la pièce lâchée après l'un d'eux ne rentre pas chez elle, son
   *  pion prend le relais. */
  departures?: number;
  /** Un groupe de figurines pris au clic ; vrai quand le clic pose sur cette pile. */
  onPieceClick?: ((hit: PieceClick) => boolean) | undefined;
  /** **Le glisser prend une pièce** (15/10) : vrai quand elle est en main. */
  /** `single`: a long press on a squad takes the one troop pressed (POC du 16/10). */
  onPieceCarry?: ((from: PieceFrom, single: boolean) => boolean) | undefined;
  /** **La pièce portée, lâchée sur une pile à moi** : poser — la rose s'ouvre alors sur sa
   *  cible —, embarquer, ou reposer. */
  onPieceDrop?: ((on: PieceFrom) => 'pose' | 'board' | 'back') | undefined;
  /** Ce que le lâcher ferait sur une pièce de la même adresse ; `undefined` ailleurs, où la rose
   *  le dit. */
  dropHintOf?: ((on: PieceFrom) => DropHint | null | undefined) | undefined;
  /**
   * **Le pointeur s'est arrêté, pièce en main** : le premier ordre que la rose y offrirait, à
   * faire chiffrer par le serveur — `null` quand il n'y en a pas, ou que le pointeur repart.
   */
  onRestAim?: (action: OrderAction | null, at: { x: number; y: number }) => void;
  /** La rose s'est refermée sans ordre : la pièce en main se repose. */
  onRoseDismiss?: () => void;
  /** **La rose de la pile en main**, celle que son étiquette ouvrirait, `null` sans pile posée :
   *  la fiche latérale y lit « fonder ». */
  onHeldCompass?: (compass: Compass | null) => void;
  /** Opens a read-only private sighting; nearby ids are ordered for click cycling. */
  onOpenLoot?: (sightingIds: ReadonlyArray<string>, clientX: number, clientY: number) => void;
  /** Un clic sur un camp relevé ouvre son cartouche — ce qu'on en sait, et rien de plus. */
  onOpenCamp?: (campId: string, clientX: number, clientY: number) => void;
  onOpenObjective?: (objectiveId: string, clientX: number, clientY: number) => void;
  onOpenStrategic?: (pointId: string, clientX: number, clientY: number) => void;
  /** L'étiquette désignée par le plateau : une troupe posée, cliquée seule. */
  selectedLabel?: string | null;
  /** The address whose garrison window is open: the sheet of a transport stored there opens. */
  openStation?: string | null;
  selectedLootLabel?: string | null;
  /**
   * **Le cercle que le plateau tient ouvert**, par-dessous celui du survol : le rayon de
   * détection d'une troupe désignée. Le survol l'emporte tant qu'il dure et le rend ensuite —
   * une seule onde à l'écran, jamais deux qui se disputent l'anneau.
   */
  reach?: Reach | null;
  onCountryHover?: (adm0: string | null) => void;
  onRegionHover?: (region: HoveredRegion | null) => void;
  /**
   * **La couche admin-1 est arrivée** : la carte tend au plateau de quoi nommer la région sous un
   * point, par la même lecture que le survol. Un cartouche de pile en a besoin, et il est écrit
   * au plateau, pas ici.
   */
  onRegionsLoaded?: (regionAt: (lonLat: LonLat) => RegionIdentity | null) => void;
  /** **La carte prête** tend au plateau de quoi nommer la maquette sous un point : une
   *  tuile du plateau personnel se lâche sur une maquette (#205). */
  onMaquetteLookup?: (maquetteAt: (clientX: number, clientY: number) => string | null) => void;
  onArcHover?: (id: string | null) => void;
  onLabelHover?: (id: string | null) => void;
  /** The press card a hovered piece wears; the map places it, the board writes it. */
  poster?: (label: MapLabel) => ReactNode;
  /** What the target allows. The map asks the question; it does not know the view. */
  compassOf: (target: CompassTarget) => Compass | null;
  /** **Blitz** (B18) : en visée, une colonne adverse en vue est une cible qu'on poursuit, pas le
   *  sol sous elle. Le théâtre est le cadre que la carte dessine. */
  blitz?: { readonly theatre: Theatre } | null;
  /** `at` is the aimed point, in the map's own coordinates: what an action anchors a panel to. */
  onCompassAction: (action: CompassAction, at: { x: number; y: number }) => void;
  /**
   * **A building held over the board, waiting for the point it goes down on** (ADR 0029). The
   * ghost follows the pointer and leaps onto what its magnet picks; the board hears every point
   * it moves onto, and the click hands back the one it holds. What it costs, what it is called,
   * what refuses it and when it ends stay on the board.
   */
  placing?: PlacingBuilding | null;
  /** **Sonder la carte** (#249) : l'onde, ses cartouches et sa dépêche, jusqu'à `onSweepEnd`. */
  sweep?: SweepRequest | null;
  onSweepEnd?: () => void;
  /** The line the sweep's button says beside it (#249). */
  onSweepStatus?: (status: string | null) => void;
  onPlacePoint?: (spot: PlacingSpot) => void;
  /** The acting button over the map while a building is held: it goes back (#162). */
  onPlacingDismiss?: () => void;
  onPlacingAim?: (spot: PlacingSpot | null) => void;
  /** A column is armed: the cursor becomes the aim and the right click names a march. */
  aiming?: boolean;
  /**
   * What the camera is asked to fly to: label ids, plus the plain places that carry no marker —
   * a column left on open ground is one. The nonce is what makes a second request on the same
   * target land: asking twice for the same building is an ordinary gesture, and an
   * identity-compared prop would swallow the second one.
   */
  focus?: {
    readonly ids: ReadonlyArray<string>;
    readonly places?: ReadonlyArray<LonLat>;
    /** Pixels dont le sujet monte au-dessus du centre : ce qu'une feuille basse couvrira. */
    readonly lift?: number;
    /** La distance d'arrivée, quand le sujet est un lieu à regarder de près — le combat d'une
     *  dépêche — et non une étiquette à retrouver : seule cette demande rapproche la caméra. */
    readonly distance?: number;
    readonly nonce: number;
  } | null;
  /**
   * **Sous le seuil, la rose du doigt** (lot mobile-3, §1) : la place que la feuille basse
   * réserve au pied du plateau. La carte ne lit pas le seuil — le plateau le lui dit.
   */
  fingerRose?: { readonly floor: number } | null;
  /** **Une pièce posée là où rien ne la prend rentre chez elle** : la pastille l'a déjà dit en
   *  rouge, il n'y a pas de rose à ouvrir sur un refus. */
  onDropRefused?: () => void;
  /** L'arrivée lue au pointeur arrêté, que la pastille porte sous son verbe. */
  dropNotes?: ReadonlyArray<DropNote>;
  /** Le plein que la route mangerait, en jauge sous le verbe (#250). */
  dropFuel?: DropFuel | null;
  /** **The server's road under the resting pointer**: the ribbon of the piece in hand follows it. */
  aimRoute?: ReadonlyArray<LonLat> | null;
  /** My piles whose transport could take the hand: their rings beat while it is held. */
  availablePiles?: ReadonlyArray<string>;
  /** Le glisser est fini — lâché, reposé ou annulé : la fiche peut revenir. */
  onCarryEnd?: () => void;
  /** Passengers stepping off from a transport's tag (POC du 16/10). */
  onDisembark?: ((troopIds: ReadonlyArray<string>) => void) | undefined;
  /** **Des jetons en main** (ADR 0028 §4) : toutes les étiquettes de transport se montrent. */
  carriersShown?: boolean;
  /** Prendre des jetons au dépôt d'un avant-poste, depuis son étiquette. */
  onTakeDepot?: TakeDepot | undefined;
  /** La tournée depuis l'étiquette d'un transport : lancer, effacer, rappeler. */
  onTour?: ((carrierId: string, act: TourAct) => void) | undefined;
  /** La bulle des premiers pas, sur la pièce à lever. */
  cue?: { readonly labelId: string; readonly text: string } | null;
  /** **Mes piles prises ensemble** (#130), chacune cerclée comme la pièce en main. */
  selectedPiles?: ReadonlyArray<string>;
  /** **Le lasso** (Maj + glisser sur le plateau) : les piles qu'il entoure, à chaque pas. */
  onLasso?: ((pileIds: ReadonlyArray<string>, done: boolean) => void) | undefined;
  /** **Un doigt tenu sur le plateau** : la sélection commence, les touchers ajoutent. */
  onSelectHold?: (() => void) | undefined;
  /** La barre au-dessus de la sélection : combien, quoi, les verbes. */
  selectionBar?: ReactNode;
  /** **Les boucles de mes tournées**, tracées à l'encre (ADR 0028) : celle qu'on trace aussi. */
  tourLoops?: ReadonlyArray<TourLoop>;
  /** Une fenêtre couvre le plateau sous le seuil : une rose ouverte n'y désignerait plus rien, et
   *  la carte cesse de dessiner (#189). */
  covered?: boolean;
  /** The journal's public uncertainty; no rumor identity or private fact crosses this boundary. */
  searchArea?: SearchArea | null;
  /**
   * **Un point de la carte qu'une feuille basse va couvrir**, en coordonnées du plateau : la
   * carte le remonte au milieu de ce qui reste visible au-dessus de `floor` pixels — la règle de
   * la garnison (A7), appliquée à ce qui n'a pas de marqueur à cadrer, un chantier visé.
   */
  reveal?: {
    readonly x: number;
    readonly y: number;
    readonly floor: number;
    readonly nonce: number;
  } | null;
  /**
   * **Le rejeu d'un combat** (surface 4.7) : tant qu'il est là, la carte le joue ; parti, la
   * caméra revient où elle était. `stepping` est une flèche, à nonce comme `focus` — deux fois la
   * même flèche avancent deux fois.
   */
  replay?: {
    readonly view: ReplayView;
    readonly playing: boolean;
    readonly stepping: { readonly direction: 1 | -1; readonly nonce: number } | null;
  } | null;
  /** Chaque étape à son début, et la fin quand le rejeu a tout joué (`ended`). */
  onReplayStep?: (step: ReplayStep, ended: boolean) => void;
  /** La part basse de l'écran que le plateau couvre pendant le rejeu : la scène se cadre au-dessus. */
  replayBelow?: number;
};

/**
 * What the board is holding: its plate, its magnet, and the card that follows the pointer. The
 * card's lines arrive written (ADR 0016): the map prices nothing, names nothing and refuses
 * nothing — `refusal` is the placement rule's sentence for the point the ghost holds.
 */
export type PlacingBuilding = {
  readonly sprite: string | null;
  readonly magnet: PlacingMagnet;
  /** The outposts' reach, drawn while the building is in hand (#239). */
  readonly reaches: HeldPlacing['reaches'];
  readonly title: string;
  readonly name: string;
  readonly cost: Cost;
  /** Owed by the foundation on the point aimed at: the price line says so instead. */
  readonly free: boolean;
  readonly duration: string;
  readonly refusal: string | null;
  /** No deposit the pose takes (#239): the nearest free one, named. */
  readonly nearest: string | null;
};

/** The value of the last render when this one is equal to it (`shareUnchanged`), so that the
 *  effects that read it do not run again for nothing. */
function useShared<T>(value: T): T {
  const last = useRef(value);
  const shared = shareUnchanged(last.current, value);
  useLayoutEffect(() => {
    last.current = shared;
  });
  return shared;
}

/** A stable empty list: a fresh `[]` default would rebuild the highlight on every render. */
const NO_REGIONS: ReadonlyArray<string> = [];
const NO_PILES: ReadonlyArray<string> = [];
/** How far above a finger the drop chip stands, clear of the fingertip (#250). @a-mesurer */
const FINGER_LIFT_PX = 56;
/** How far beside a finger it stands when the top leaves no room above. @a-mesurer */
const FINGER_SIDE_PX = 36;
const NO_CUT = { unlinked: NO_REGIONS, producing: new Set<string>() };

export function WorldMap({
  atlas,
  shore,
  arcs,
  troops,
  journal,
  labels: servedLabels,
  standing: servedStanding,
  camps: servedCamps,
  pins: servedPins,
  maquettes,
  held,
  outposts,
  cut = NO_CUT,
  selectedCountry,
  playerNation,
  indicators,
  accentedMovement,
  underRouteScale,
  quietRouteScale = false,
  onSelect,
  onOpenBuilding,
  onOpenStack,
  holding = null,
  departures = 0,
  onPieceClick,
  onPieceCarry,
  onPieceDrop,
  dropHintOf,
  onRestAim,
  onRoseDismiss,
  onHeldCompass,
  onOpenLoot,
  onOpenCamp,
  onOpenObjective,
  onOpenStrategic,
  selectedLabel = null,
  openStation = null,
  selectedLootLabel = null,
  reach = null,
  onCountryHover,
  onRegionHover,
  onRegionsLoaded,
  onMaquetteLookup,
  onArcHover,
  onLabelHover,
  poster,
  compassOf,
  blitz = null,
  onCompassAction,
  placing = null,
  sweep = null,
  onSweepEnd = noSweepEnd,
  onSweepStatus,
  onPlacePoint,
  onPlacingDismiss,
  onPlacingAim,
  aiming = false,
  focus = null,
  searchArea = null,
  fingerRose = null,
  onDropRefused,
  dropNotes,
  dropFuel = null,
  aimRoute = null,
  availablePiles = NO_PILES,
  onCarryEnd,
  onDisembark,
  carriersShown = false,
  onTakeDepot,
  onTour,
  cue = null,
  selectedPiles: servedSelection = NO_PILES,
  onLasso,
  onSelectHold,
  selectionBar = null,
  tourLoops = NO_LOOPS,
  covered = false,
  reveal = null,
  replay = null,
  onReplayStep,
  replayBelow = 0,
}: Props) {
  // **Une liste rebâtie mais égale reste la même** (#199) : marquer le journal lu change la vue du
  // joueur, le plateau rebâtit piles, camps, sélection et étiquettes à l'identique, et chaque effet
  // qui les lit réveillait la carte une seconde et demie à soixante images.
  const labels = useShared(servedLabels);
  const standing = useShared(servedStanding);
  const camps = useShared(servedCamps);
  const pins = useShared(servedPins);
  const selectedPiles = useShared(servedSelection);
  const container = useRef<HTMLDivElement>(null);
  const insets = useBoardInsets();
  /** Read when the regions land, a beat after mount: a ref, so the engine is not rebuilt for a
   *  callback that changed identity. */
  const regionsLoaded = useRef(onRegionsLoaded);
  useEffect(() => {
    regionsLoaded.current = onRegionsLoaded;
  }, [onRegionsLoaded]);
  const engine = useRef<MapEngine | null>(null);
  const [rose, setRose] = useState<OpenRose | null>(null);
  /** Une rose rouverte est une autre rose : elle se mesure et se recale à son tour. */
  const openings = useRef(0);
  const [hoveredReach, setHoveredReach] = useState<Reach | null>(null);
  const [gestureHint, setGestureHint] = useState(false);
  const mapping = useMouseMapping();
  const motion = useMapMotion();
  const dayCycle = useDayCycle();
  const contourWeight = useContourWeight();
  const pieces = usePieceScale();
  // The label layer can only attach once the engine exists: it needs the instance, not a
  // ref that triggers no render.
  const [readyEngine, setReadyEngine] = useState<MapEngine | null>(null);
  useEffect(() => {
    if (readyEngine) onMaquetteLookup?.((x, y) => readyEngine.maquetteAtPoint(x, y));
  }, [readyEngine, onMaquetteLookup]);

  useEffect(() => {
    if (!container.current) return;
    const instance = new MapEngine(container.current, atlas, shore);
    engine.current = instance;
    setReadyEngine(instance);
    if (import.meta.env.DEV || import.meta.env.VITE_BANC === '1')
      (window as unknown as { mapEngine?: MapEngine }).mapEngine = instance;

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);

    // The board does not wait for the regions' facts, and their failure is mute — but the
    // possession colour hangs on them too since ADR 0020: no regions, no ground to ink.
    let abandoned = false;
    // Two frames on: the sea and the countries are drawn before anything else is asked for.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        Promise.all([loadRegionTypes(), loadRegionIndex()])
          .then(([types, { point }]) => {
            if (abandoned) return;
            instance.displayRegions(types, point);
            regionsLoaded.current?.((lonLat) => instance.regionAtLonLat(lonLat));
          })
          .catch(() => {});
        loadNearAtlas()
          .then((near) => {
            if (!abandoned) instance.displayNearAtlas(near);
          })
          .catch(() => {})
          // The coast at rest (#224), never racing the near level: Safari has no idle callback.
          .finally(() =>
            (window.requestIdleCallback ?? setTimeout)(() => {
              if (!abandoned) instance.loadCoast();
            }),
          );
      });
    });

    return () => {
      abandoned = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      instance.dispose();
      engine.current = null;
      setReadyEngine(null);
    };
  }, [atlas, shore]);

  // La Blitz n'exploite rien : ses gisements ne diraient rien qu'on puisse en faire.
  const basinsShown = indicators.deposits && blitz === null;
  useEffect(() => {
    readyEngine?.setDepositBasins(basinsShown);
  }, [readyEngine, basinsShown]);

  useEffect(() => {
    if (engine.current) engine.current.onSelect = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (engine.current) engine.current.onCountryHover = onCountryHover ?? (() => {});
  }, [onCountryHover]);

  useEffect(() => {
    if (engine.current) engine.current.onRegionHover = onRegionHover ?? (() => {});
  }, [onRegionHover]);

  useEffect(() => {
    if (engine.current) engine.current.onArcHover = onArcHover ?? (() => {});
  }, [onArcHover]);

  /**
   * **Le verbe choisi pendant le geste**, retrouvé au lâcher par la signature de ses ordres : la
   * même cible rend le même choix, une autre repart du premier. Tab ou un chiffre le changent.
   */
  const choice = useRef({ signature: '', index: 0 });
  const reading = useRef<DropReading | null>(null);
  /** Un lâcher de glisser, et non le clic d'une pièce levée : seul le premier rentre au refus. */
  const dragging = useRef(false);
  const chosenOf = useCallback((verbs: ReadonlyArray<CompassAction>): number => {
    const signature = verbs.map((verb) => `${verb.key}:${verb.label}`).join('|');
    if (choice.current.signature !== signature) choice.current = { signature, index: 0 };
    return Math.min(choice.current.index, verbs.length - 1);
  }, []);
  useEffect(() => {
    if (holding === null) return;
    const turn = (event: KeyboardEvent) => {
      const read = reading.current;
      if (read?.kind !== 'orders' || read.verbs.length < 2) return;
      const digit = Number.parseInt(event.key, 10);
      const count = read.verbs.length;
      const at = chosenOf(read.verbs);
      const next =
        event.key === 'Tab'
          ? turnChoice(count, at, event.shiftKey ? -1 : 1)
          : digit >= 1 && digit <= count
            ? digit - 1
            : null;
      if (next === null) return;
      event.preventDefault();
      choice.current.index = next;
      setHint(hintOfReading(read, chosenOf, holding.forbidden ?? null));
    };
    addEventListener('keydown', turn);
    return () => removeEventListener('keydown', turn);
  }, [holding, chosenOf]);

  // One rose at a time, and the camera holds still while it is open: aiming at an action on
  // a map drifting under the pointer is aiming twice.
  /** La dernière visée qui a ouvert la rose : relue quand la côte arrive (#224). */
  const lastAim = useRef<{ target: CompassTarget; clientX: number; clientY: number } | null>(null);
  const openRose = useCallback(
    (target: CompassTarget, clientX: number, clientY: number) => {
      lastAim.current = { target, clientX, clientY };
      let drawn = compassOf(target);
      const rect = container.current?.getBoundingClientRect();
      if (rect === undefined) return;
      const fromDrag = aiming && dragging.current;
      if (drawn === null) {
        if (fromDrag) onDropRefused?.();
        return;
      }
      const at = { x: clientX - rect.left, y: clientY - rect.top };
      /** **La pièce se pose là où l'ordre se lit** — sous une rose ou une carte d'ordre — et pas
       *  quand le geste part droit au serveur : un refus la laisserait figée au sol. */
      const setDown = () => {
        if (holding !== null) engine.current?.setDownPiece(clientX, clientY);
      };
      /** **Lâcher, c'est ordonner** (POC « Manipuler les pions », 16/10) : le verbe que la
       *  pastille montrait part tel quel ; au doigt, sans molette ni clavier, une rose réduite
       *  aux ordres de pièce laisse choisir quand il y en a plusieurs. */
      const reading = aiming ? dropReadingOf(drawn) : null;
      /** Une attente (la côte arrive) ouvre la rose sur son motif, pièce en main : la rose se
       *  relit à l'arrivée de la côte (`onCoast`). */
      if (reading !== null && reading.kind !== 'orders' && reading.kind !== 'pending' && fromDrag) {
        setRose(null);
        if (reading.kind === 'refused') engine.current?.refuseDrop();
        onDropRefused?.();
        return;
      }
      // Lifted by a click, a pose with nothing to order opens the rose on its reason, in hand.
      if (reading?.kind === 'orders') {
        setDown();
        if (fingerRose === null || reading.verbs.length === 1) {
          setRose(null);
          onCompassAction(reading.verbs[chosenOf(reading.verbs)]!, at);
          return;
        }
        drawn = { ...drawn, actions: reading.verbs };
      }
      const margin = (ROSE_MARGIN * readHudScale()) / 100;
      /** Sous le doigt, la rose reste sur ce qu'elle désigne : c'est la carte qui se recale
       *  sous elle une fois mesurée (`CompassRose`, `fitShift`). */
      const exact = fingerRose !== null;
      openings.current += 1;
      setRose({
        opening: openings.current,
        compass: drawn,
        x: exact ? at.x : clamp(at.x, margin, rect.width),
        y: exact ? at.y : clamp(at.y, margin, rect.height),
        width: rect.width,
        height: rect.height,
      });
    },
    [compassOf, fingerRose, aiming, onDropRefused, onCompassAction, holding, chosenOf],
  );

  const fitRose = useCallback((dx: number, dy: number) => {
    engine.current?.nudge(dx, dy);
    setRose((open) => (open === null ? null : { ...open, x: open.x + dx, y: open.y + dy }));
  }, []);

  const closeRose = useCallback(() => setRose(null), []);

  /**
   * **Une seule lecture de la plage** (décision 72a, #224) : le moteur répond avec
   * `isLandingShore`, la fonction même dont le serveur tire son refus. Le fan ne peut donc pas
   * offrir une plage que la mutation renverrait (ADR 0015).
   */
  const coastAt = useCallback((lonLat: LonLat) => engine.current?.coastAt(lonLat) ?? false, []);
  const groundAt = useCallback(
    (lonLat: LonLat): Ground => engine.current?.groundAt(lonLat) ?? 'sea',
    [],
  );
  /** L'eau ouverte de la grille avant `coast.json` : une coque n'a pas encore de verdict (#224). */
  const coastPendingAt = useCallback(
    (lonLat: LonLat) => engine.current?.coastPendingAt(lonLat) ?? false,
    [],
  );
  const walkableAt = useCallback(
    (lonLat: LonLat) => engine.current?.walkableAt(lonLat) ?? true,
    [],
  );

  /** **La côte arrive, la rose se relit** (#224) : une visée en attente sur l'eau de la grille
   *  retrouve ses ordres sans qu'on la referme. */
  useEffect(() => {
    if (readyEngine === null) return;
    readyEngine.onCoast = () => {
      const aim = lastAim.current;
      if (rose === null || aim === null || aim.target.kind !== 'point') return;
      if (aim.target.coastPending !== true) return;
      const lonLat: LonLat = [aim.target.lon, aim.target.lat];
      openRose(
        {
          ...aim.target,
          ground: groundAt(lonLat),
          coastal: coastAt(lonLat),
          coastPending: false,
        },
        aim.clientX,
        aim.clientY,
      );
    };
    return () => {
      readyEngine.onCoast = undefined;
    };
  }, [readyEngine, rose, openRose, groundAt, coastAt]);

  useEffect(() => {
    if (!readyEngine) return;
    readyEngine.onAct = ({ country, region, point, clientX, clientY }) => {
      /** **Rien ne s'ouvre pendant qu'on tient un bâtiment** : le mode de pose attend un point,
       *  et une rose posée par-dessus offrirait un second geste au même clic. */
      if (placing !== null) {
        setRose(null);
        return;
      }
      /**
       * **Aiming, the board answers everywhere.** The place under the pointer is a lon/lat at
       * every scale and over water too, so the silence the player used to get when zoomed out —
       * or off a coast — is structurally gone (ADR 0019 §1). The region travels alongside it
       * because a foundation still needs one; the fan sorts out which type takes which.
       */
      if (aiming) {
        const aimed = pointTarget(
          country,
          region,
          point,
          point !== null && coastAt(point),
          point === null ? 'sea' : groundAt(point),
          point !== null && coastPendingAt(point),
          point === null || walkableAt(point),
        );
        if (aimed === null) {
          setRose(null);
          return;
        }
        openRose(aimed, clientX, clientY);
        return;
      }
      if (country === null) {
        setRose(null);
        return;
      }
      // Up close the aim lands on a region — a building goes on a region, never on a country.
      // Beyond the regions' fade, the country is what the map shows and what it targets.
      const target: CompassTarget =
        region === null
          ? { kind: 'country', country }
          : { kind: 'region', id: region.id, name: region.name, country };
      openRose(target, clientX, clientY);
    };
    return () => {
      readyEngine.onAct = () => {};
    };
  }, [readyEngine, openRose, aiming, placing, coastAt, groundAt, coastPendingAt, walkableAt]);

  // The hint fires on the first orientation drag, never on arrival: shown when the board
  // opens, it would answer a question the player has not asked yet.
  useEffect(() => {
    if (!readyEngine) return;
    readyEngine.onOrientationStarted = () => {
      if (gestureHintSeen()) return;
      markGestureHintSeen();
      setGestureHint(true);
    };
    return () => {
      readyEngine.onOrientationStarted = () => {};
    };
  }, [readyEngine]);

  useEffect(() => {
    if (!gestureHint) return;
    const timer = setTimeout(() => setGestureHint(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [gestureHint]);

  /** What a label names under the pointer: its own target, or — aiming — the ground it covers. */
  const labelTarget = useCallback(
    (label: MapLabel, clientX: number, clientY: number): CompassTarget | null => {
      const map = engine.current;
      const country = map?.countryAtPoint(clientX, clientY) ?? null;
      /** La région dessinée sous le clic : c'est elle qui dit si le sol est déjà le mien, la
       *  seule chose qui sépare une fondation possible d'un `FRIENDLY_TARGET`. */
      const region = map?.regionAtPoint(clientX, clientY) ?? null;
      const target = targetOfLabel(label, country, region, coastAt, groundAt, walkableAt);
      /**
       * **Aiming, a label hides nothing.** An outpost is a target one marches at and keeps its
       * own fan; every other pictogram — a column in flight, a construction — hands the aim back
       * to the ground it covers. Without this, a right click landing on a mark would be the last
       * place on the board where aiming answers nothing.
       *
       * A posted pile keeps its own target: a friendly transport can now be joined at its exact
       * address (Pierre, 08/09). Falling through to the cursor's ground point would leave the
       * arriving troops beside it, at another address, unable to form a shared garrison.
       *
       * **Un bâtiment à soi est une destination en visée** (décision 64b, révision du 54a) : la
       * colonne vient y entrer en garnison, et la rose armée le dit ou dit pourquoi non. Au repos
       * il garde sa rose d'élévation — la grammaire de la visée ne change toujours pas d'un
       * signe, elle a seulement une adresse de plus. Un chantier, lui, n'a pas de bâtiment et
       * rend son sol. **Un relevé — camp, installation, caisse — et un objectif gardent leur
       * cible** : leur rose armée est l'attaque, l'expédition ou le ramassage, que le sol nu
       * n'offre pas.
       */
      if (!aiming || map === null || (target !== null && target.kind !== 'country')) return target;
      const ground = map.pointAt(clientX, clientY);
      const chased =
        blitz !== null && label.anchor.kind === 'movementHead'
          ? arcs.find((arc) => arc.id === (label.anchor as { arc: string }).arc)
          : undefined;
      if (chased?.state === 'enemyDetected' && ground !== null) {
        return {
          kind: 'track',
          id: chased.id,
          point: ground,
          country,
          ground: groundAt(ground),
          coastal: coastAt(ground),
          walkable: walkableAt(ground),
          name: fr.compass.enemyColumn,
        };
      }
      return pointTarget(
        country,
        region,
        ground,
        ground !== null && coastAt(ground),
        ground === null ? 'sea' : groundAt(ground),
        ground !== null && coastPendingAt(ground),
        ground === null || walkableAt(ground),
      );
    },
    [aiming, coastAt, groundAt, coastPendingAt, walkableAt, blitz, arcs],
  );

  const onLabelAct = useCallback(
    (label: MapLabel, clientX: number, clientY: number) => {
      const aimed = labelTarget(label, clientX, clientY);
      if (aimed !== null) openRose(aimed, clientX, clientY);
    },
    [openRose, labelTarget],
  );

  const onLabelOpen = useCallback(
    (label: MapLabel, clientX: number, clientY: number) => {
      if (label.station === null) return;
      if (onOpenStack?.(label.station, clientX, clientY) === true)
        onLabelAct(label, clientX, clientY);
    },
    [onOpenStack, onLabelAct],
  );

  /**
   * **Porter une pièce, la lâcher** (glisser-déposer, 15/10). Le moteur dit d'où et sur quoi ; ici
   * se lit ce que c'est — une de mes piles, sa garnison au pied d'un mât, ou une étiquette — et
   * l'étiquette où la rose s'ouvrira si le lâcher est une pose.
   */
  const [hint, setHint] = useState<DropHint | null>(null);
  /** **The transport under the hand**, its tag open on the seats the drop would take. */
  const [cargoAim, setCargoAim] = useState<CargoAim | null>(null);
  /** My transports that could take the hand, by the label their luggage tag hangs from. */
  const availableLabels = useMemo(
    () =>
      new Set(
        availablePiles.map((id) => {
          const at = standing.find((pile) => pile.id === id)?.at;
          return at !== undefined && 'beside' in at ? at.beside : id;
        }),
      ),
    [availablePiles, standing],
  );
  // A new hand starts from the first verb, and an empty one has no chip left to show.
  useEffect(() => {
    choice.current = { signature: '', index: 0 };
    if (holding !== null) return;
    reading.current = null;
    setHint(null);
  }, [holding]);
  /** **L'anneau de l'appui long** sur une escouade : il se remplit, puis dit « une seule ». */
  const [detaching, setDetaching] = useState<{ x: number; y: number; done: boolean } | null>(null);
  const hintNode = useRef<HTMLDivElement>(null);
  const hintAt = useRef('');
  const hintPointer = useRef<{ x: number; y: number } | null>(null);
  /** Whether the last press was a finger's, read per event as the map does (`pointerType`). */
  const fingerHand = useRef(false);
  useEffect(() => {
    const press = (event: PointerEvent) => {
      fingerHand.current = event.pointerType === 'touch';
    };
    addEventListener('pointerdown', press, true);
    return () => removeEventListener('pointerdown', press, true);
  }, []);
  /** La place de la puce par rapport au pointeur : sous la main à droite, retournée contre les
   *  bords. Elle se mesure sur la puce telle qu'elle est — et se refait quand ses notes arrivent. */
  const placeHint = (clientX: number, clientY: number) => {
    const chip = hintNode.current;
    const width = chip?.offsetWidth ?? 0;
    const height = chip?.offsetHeight ?? 0;
    // Under a finger the hand hides what is below it: the chip, and its gauge, stand above —
    // or, too near the top for that, beside the finger, on the side with more room.
    const above = clientY - height - FINGER_LIFT_PX;
    const beside = fingerHand.current && above < 8;
    const x = beside
      ? clientX > innerWidth / 2
        ? clientX - width - FINGER_SIDE_PX
        : clientX + FINGER_SIDE_PX
      : fingerHand.current
        ? clientX - width / 2
        : clientX + 26 + width > innerWidth - 12
          ? clientX - width - 22
          : clientX + 26;
    const y = beside
      ? clientY - height / 2
      : fingerHand.current
        ? above
        : clientY + 22 + height > innerHeight - 12
          ? clientY - height - 18
          : clientY + 22;
    /** Ni retournée ni à droite elle ne tient sur un écran étroit : elle reste alors dans le cadre. */
    hintAt.current = `translate(${Math.max(8, Math.min(x, innerWidth - width - 8))}px, ${Math.max(8, y)}px)`;
    if (chip !== null) chip.style.transform = hintAt.current;
  };
  /** Née après le geste qui l'a demandée, la puce prend la dernière place connue du pointeur ;
   *  les notes de la route, qui l'élargissent après l'arrêt, la replacent. */
  useLayoutEffect(() => {
    if (hintNode.current === null) return;
    if (hintPointer.current !== null && dropNotes !== undefined)
      placeHint(hintPointer.current.x, hintPointer.current.y);
    hintNode.current.style.transform = hintAt.current;
  }, [hint, rose, dropNotes, dropFuel]);
  useEffect(() => {
    if (!readyEngine) return;
    const read = (
      target: CarryTarget,
      clientX: number,
      clientY: number,
    ): { from: PieceFrom | null; label: MapLabel | undefined } => {
      if (target.kind === 'canvas') {
        // A garrison is aimed at by its building's mast.
        const at = standing.find((pile) => pile.id === target.pick.pileId)?.at;
        const labelId = at !== undefined && 'beside' in at ? at.beside : target.pick.pileId;
        return {
          from: { kind: 'piece', hit: { ...target.pick, clientX, clientY } },
          label: labels.find((candidate) => candidate.id === labelId),
        };
      }
      const label = labels.find((candidate) => candidate.id === target.labelId);
      return {
        from:
          label?.type === 'stack' && label.station !== null
            ? { kind: 'stack', station: label.station }
            : null,
        label,
      };
    };
    readyEngine.onPieceCarry =
      onPieceCarry &&
      ((target, clientX, clientY, single) => {
        const { from } = read(target, clientX, clientY);
        dragging.current = from !== null && onPieceCarry(from, single);
        return dragging.current;
      });
    readyEngine.onCarryEnd = () => {
      dragging.current = false;
      onCarryEnd?.();
    };
    readyEngine.onDetach = (phase, clientX, clientY) => {
      const rect = container.current?.getBoundingClientRect();
      setDetaching(
        phase === 'end'
          ? null
          : {
              x: clientX - (rect?.left ?? 0),
              y: clientY - (rect?.top ?? 0),
              done: phase === 'done',
            },
      );
    };
    readyEngine.onPieceDrop =
      onPieceDrop &&
      ((target, clientX, clientY) => {
        const { from, label } = read(target, clientX, clientY);
        const outcome = from === null ? 'pose' : onPieceDrop(from);
        if (outcome === 'board') readyEngine.boardInto(clientX, clientY);
        if (outcome === 'pose' && label !== undefined) onLabelAct(label, clientX, clientY);
      });
    readyEngine.onCarryCancel = onDropRefused;
    readyEngine.onCarryOver = (target, clientX, clientY) => {
      // The prototype's place: below right of the hand, flipped against the screen's edges.
      hintPointer.current = { x: clientX, y: clientY };
      placeHint(clientX, clientY);
      const over =
        target === null || target.kind === 'ground'
          ? null
          : (read(target, clientX, clientY).label?.id ?? null);
      const tell = (hint: DropHint | null) => {
        setHint(hint);
        const aim =
          hint?.boarding === undefined || over === null
            ? null
            : { labelId: over, ...hint.boarding };
        setCargoAim((was) => (JSON.stringify(was) === JSON.stringify(aim) ? was : aim));
        readyEngine.markDrop(
          hint === null || hint.tone === 'calm' ? 'none' : hint.tone,
          hint === null || hint.tone === 'calm' ? null : ringOfHint(hint),
        );
      };
      if (target === null) {
        reading.current = null;
        tell(null);
        return;
      }
      if (target.kind !== 'ground') {
        const { from } = read(target, clientX, clientY);
        const here = from === null ? undefined : dropHintOf?.(from);
        if (here !== undefined) {
          reading.current = null;
          tell(here);
          return;
        }
      }
      const label = target.kind === 'ground' ? undefined : read(target, clientX, clientY).label;
      const aimed =
        label !== undefined
          ? labelTarget(label, clientX, clientY)
          : (() => {
              const point = readyEngine.pointAt(clientX, clientY);
              return pointTarget(
                readyEngine.countryAtPoint(clientX, clientY),
                readyEngine.regionAtPoint(clientX, clientY),
                point,
                point !== null && coastAt(point),
                point === null ? 'sea' : groundAt(point),
                point !== null && coastPendingAt(point),
                point === null || walkableAt(point),
              );
            })();
      reading.current = dropReadingOf(aimed === null ? null : compassOf(aimed));
      tell(hintOfReading(reading.current, chosenOf, holding?.forbidden ?? null));
    };
  }, [
    holding,
    readyEngine,
    standing,
    labels,
    onPieceCarry,
    onPieceDrop,
    dropHintOf,
    onLabelAct,
    labelTarget,
    compassOf,
    coastAt,
    groundAt,
    coastPendingAt,
    walkableAt,
    chosenOf,
    onDropRefused,
    onCarryEnd,
  ]);

  useEffect(() => {
    if (!readyEngine) return;
    readyEngine.onPieceClick =
      onPieceClick &&
      ((hit) => {
        if (!onPieceClick(hit)) return;
        // A garrison is aimed at by its building's mast.
        const at = standing.find((pile) => pile.id === hit.pileId)?.at;
        const labelId = at !== undefined && 'beside' in at ? at.beside : hit.pileId;
        const label = labels.find((candidate) => candidate.id === labelId);
        if (label !== undefined) onLabelAct(label, hit.clientX, hit.clientY);
      });
  }, [readyEngine, onPieceClick, labels, onLabelAct, standing]);

  const departed = useRef(departures);
  useEffect(() => {
    readyEngine?.holdPiece(holding, departed.current !== departures);
    departed.current = departures;
  }, [readyEngine, holding, departures]);

  /** Lue sur le point de la pile et non sous un pointeur : la fiche n'a pas de clic à suivre. */
  useEffect(() => {
    if (onHeldCompass === undefined) return;
    const label = holding === null ? undefined : labels.find((c) => c.id === holding.pileId);
    if (label === undefined || label.anchor.kind !== 'ground') {
      onHeldCompass(null);
      return;
    }
    const region = readyEngine?.regionAtLonLat(label.anchor.lonLat) ?? null;
    const target = targetOfLabel(label, null, region, coastAt, groundAt, walkableAt);
    onHeldCompass(target === null ? null : compassOf(target));
  }, [readyEngine, holding, labels, compassOf, coastAt, groundAt, walkableAt, onHeldCompass]);

  /** **La route ne se montre qu'à l'arrêt** (ADR 0026 §6) : la cible est ce que la pose lirait
   *  là — l'étiquette sous le pointeur ou le sol —, et l'ordre est le premier que la rose y
   *  offrirait. */
  useEffect(() => {
    if (!readyEngine) return;
    readyEngine.onRest = ({ country, region, point, clientX, clientY, labelId }) => {
      const rect = container.current?.getBoundingClientRect();
      const label =
        labelId === null ? undefined : labels.find((candidate) => candidate.id === labelId);
      const target =
        label !== undefined
          ? labelTarget(label, clientX, clientY)
          : point === null
            ? null
            : pointTarget(
                country,
                region,
                point,
                coastAt(point),
                groundAt(point),
                coastPendingAt(point),
                walkableAt(point),
              );
      /** La route du verbe choisi, celui que le lâcher donnerait. */
      const read = dropReadingOf(target === null ? null : compassOf(target));
      const verb = read.kind === 'orders' ? read.verbs[chosenOf(read.verbs)] : undefined;
      const order = verb !== undefined && isOrder(verb) ? verb : undefined;
      onRestAim?.(order ?? null, {
        x: clientX - (rect?.left ?? 0),
        y: clientY - (rect?.top ?? 0),
      });
    };
    readyEngine.onRestless = () => onRestAim?.(null, { x: 0, y: 0 });
  }, [
    readyEngine,
    compassOf,
    onRestAim,
    coastAt,
    groundAt,
    coastPendingAt,
    walkableAt,
    labels,
    labelTarget,
    chosenOf,
  ]);

  /**
   * **Hors champ, le drapeau d'un de mes mouvements s'annonce au bord**, nommé (carte-lisible,
   * 03/10) — un toucher y recentre. Les destinations de la colonne armée ne s'y nomment plus
   * (retour de Pierre, 08/10) : en visée, une rangée de cartouches au bord de l'écran gênait et ne
   * disait rien que les cercles et la feuille ne disent déjà.
   */
  const edgeNames = useMemo<ReadonlyMap<string, string>>(
    () =>
      new Map(
        labels
          .filter((label) => label.type === 'arrival')
          .map((label) => [label.id, lineText(label, 'nature') ?? ''] as const),
      ),
    [labels],
  );

  // **Effet immédiat, sans rechargement** : le moteur reçoit le mappage comme il reçoit une
  // bascule, et un glisser en cours garde le sien jusqu'au relâchement.
  useEffect(() => {
    readyEngine?.setMouseMapping(mapping);
  }, [readyEngine, mapping]);

  useEffect(() => {
    readyEngine?.setPieceScale(pieces);
  }, [readyEngine, pieces]);

  useEffect(() => {
    readyEngine?.setMapMotion(motion);
  }, [readyEngine, motion]);

  useEffect(() => {
    readyEngine?.setDayCycle(dayCycle);
  }, [readyEngine, dayCycle]);

  useEffect(() => {
    readyEngine?.setContourWeight(contourWeight);
  }, [readyEngine, contourWeight]);

  useEffect(() => {
    readyEngine?.setEdgeInsets(insets);
  }, [readyEngine, insets]);

  useEffect(() => {
    readyEngine?.freezeOrbit(rose !== null);
  }, [readyEngine, rose]);

  useEffect(() => {
    engine.current?.setPlayerNation(playerNation);
  }, [playerNation]);

  useEffect(() => {
    readyEngine?.setAiming(aiming);
  }, [readyEngine, aiming]);

  /** Re-armed only when what is held changes, never when its card is rewritten: the ghost keeps
   *  its point while the board re-reads the refusal under it. */
  const heldSprite = placing?.sprite ?? null;
  const heldMagnet = placing?.magnet ?? null;
  const heldReaches = placing?.reaches ?? null;
  const heldPlacing = useMemo(
    () =>
      heldMagnet === null
        ? null
        : { sprite: heldSprite, magnet: heldMagnet, reaches: heldReaches ?? [] },
    [heldSprite, heldMagnet, heldReaches],
  );
  useEffect(() => {
    readyEngine?.setPlacing(heldPlacing);
  }, [readyEngine, heldPlacing]);

  const refused = placing?.refusal != null;
  useEffect(() => {
    readyEngine?.setPlacingRefused(refused);
  }, [readyEngine, refused]);

  useEffect(() => {
    if (engine.current) engine.current.onPlacePoint = onPlacePoint ?? (() => {});
  }, [onPlacePoint]);

  useEffect(() => {
    if (engine.current) engine.current.onPlacingAim = onPlacingAim ?? (() => {});
  }, [onPlacingAim]);

  useEffect(() => {
    if (engine.current) engine.current.onPlacingDismiss = onPlacingDismiss ?? (() => {});
  }, [onPlacingDismiss]);

  /**
   * **Sous le doigt, un voyage referme la rose** : le toucher qui l'a ouverte a aussi ouvert une
   * surface qui recadre la carte — une garnison, un site, une dépêche —, et une rose posée sur
   * une carte qui glisse ne désigne plus ce qu'elle nomme. Au bureau, la rose ne s'ouvre pas
   * avec ces portes-là.
   */
  const finger = useRef(fingerRose !== null);
  useEffect(() => {
    finger.current = fingerRose !== null;
  }, [fingerRose]);
  useEffect(() => {
    if (focus === null) return;
    if (finger.current) setRose(null);
    readyEngine?.journeyTo(focus.ids, focus.places ?? [], focus.lift ?? 0, focus.distance);
  }, [readyEngine, focus]);

  const replayStep = useRef(onReplayStep);
  /** Lu au lancement : la caméra ne bouge pas si l'écran tourne en plein rejeu. */
  const below = useRef(replayBelow);
  useEffect(() => {
    replayStep.current = onReplayStep;
    below.current = replayBelow;
  }, [onReplayStep, replayBelow]);
  const replayView = replay?.view ?? null;
  useEffect(() => {
    if (!readyEngine || replayView === null) return;
    setRose(null);
    // « Terrain tenu », the account's own stamp, pressed on the board too as the account opens.
    const held = replayView.won
      ? {
          kind: 'held' as const,
          at: [replayView.point.lon, replayView.point.lat] as const,
          words: { word: fr.replay.held, hour: asClockTime(replayView.at) },
        }
      : null;
    // Once a replay: stepping back and forth through the account does not stamp it again.
    let stamped = false;
    readyEngine.playReplay(
      replayView,
      (step, ended) => {
        if (held !== null && step === 'compte-rendu' && !stamped) {
          stamped = true;
          readyEngine.inkBurst(held);
        }
        replayStep.current?.(step, ended);
      },
      below.current,
    );
    return () => {
      readyEngine.stopReplay();
      // « Quitter » takes the account's stamp with it: it belonged to the replay.
      if (stamped) readyEngine.liftStamps('held');
    };
  }, [readyEngine, replayView]);
  const replayPlaying = replay?.playing ?? true;
  useEffect(() => {
    if (readyEngine && replayView !== null) readyEngine.setReplayAutoplay(replayPlaying);
  }, [readyEngine, replayView, replayPlaying]);
  const replayStepping = replay?.stepping ?? null;
  useEffect(() => {
    if (readyEngine && replayStepping !== null) readyEngine.stepReplay(replayStepping.direction);
  }, [readyEngine, replayStepping]);

  useEffect(() => {
    if (covered) setRose(null);
  }, [covered]);
  useEffect(() => {
    readyEngine?.cover(covered);
  }, [readyEngine, covered]);
  const holdOver = useCallback(
    (labelId: string, clientX: number, clientY: number) =>
      engine.current?.pointerOverLabel(labelId, clientX, clientY),
    [],
  );

  useEffect(() => {
    const rect = container.current?.getBoundingClientRect();
    if (reveal === null || rect === undefined) return;
    const visible = rect.height - reveal.floor;
    if (reveal.y <= visible - REVEAL_MARGIN) return;
    readyEngine?.nudge(0, visible / 2 - reveal.y);
  }, [readyEngine, reveal]);

  useEffect(() => {
    readyEngine?.showSearchArea(searchArea);
  }, [readyEngine, searchArea]);

  useEffect(() => {
    engine.current?.accentArc(accentedMovement);
  }, [accentedMovement]);

  // The segmented scale rides the same highlight bridge as the thread's accent: the
  // timeline and the map designate the same movement, there is one source to read.
  const theatre = blitz?.theatre ?? null;
  useEffect(() => {
    readyEngine?.setTheatre(theatre);
  }, [readyEngine, theatre]);

  const designatedArc = arcs.find((arc) => arc.id === accentedMovement) ?? null;

  useEffect(() => {
    engine.current?.displayArcs(arcs, troops);
  }, [arcs, troops]);

  useEffect(() => {
    readyEngine?.displayStanding(standing);
  }, [readyEngine, standing]);

  useEffect(() => {
    readyEngine?.setAimRoute(aimRoute);
  }, [readyEngine, aimRoute]);

  useEffect(() => {
    readyEngine?.showTours(tourLoops);
  }, [readyEngine, tourLoops]);

  useEffect(() => {
    readyEngine?.setAvailable(availablePiles);
  }, [readyEngine, availablePiles]);

  useEffect(() => {
    readyEngine?.setSelected(selectedPiles);
  }, [readyEngine, selectedPiles]);

  /** **Ce que le lasso entoure** : le milieu de chaque pile à l'écran, ses figurines ou son point. */
  useEffect(() => {
    if (!readyEngine) return;
    readyEngine.onSelectHold = onSelectHold;
    readyEngine.onLasso =
      onLasso &&
      ((stroke, done) => {
        const box = container.current?.getBoundingClientRect();
        const caught = standing.flatMap((pile) => {
          const rect = readyEngine.pieceRect(pile.id);
          const at =
            rect !== null
              ? {
                  x: (rect.left + rect.right) / 2 + (box?.left ?? 0),
                  y: (rect.top + rect.bottom) / 2 + (box?.top ?? 0),
                }
              : 'lonLat' in pile.at
                ? readyEngine.screenOf(pile.at.lonLat)
                : null;
          return at !== null && insideStroke(stroke, at.x, at.y) ? [pile.id] : [];
        });
        onLasso(caught, done);
      });
  }, [readyEngine, onLasso, onSelectHold, standing]);

  /** The bar stands over the labels of the piles taken: a garrison's is its mast's. */
  const bar = useMemo(
    () =>
      selectionBar === null
        ? null
        : {
            labelIds: selectedPiles.map((id) => {
              const at = standing.find((pile) => pile.id === id)?.at;
              return at !== undefined && 'beside' in at ? at.beside : id;
            }),
            node: selectionBar,
          },
    [selectionBar, selectedPiles, standing],
  );

  useEffect(() => {
    readyEngine?.displayCamps(camps);
  }, [readyEngine, camps]);

  useEffect(() => {
    readyEngine?.displayPins(pins);
  }, [readyEngine, pins]);

  useEffect(() => {
    readyEngine?.selectPin(selectedLabel);
  }, [readyEngine, selectedLabel]);

  /** **La grappe ouverte** (#234) : ses pièces, et où pend sa fiche dans la carte. */
  const [cluster, setCluster] = useState<{
    readonly ids: ReadonlyArray<string>;
    readonly x: number;
    readonly y: number;
  } | null>(null);
  useEffect(() => {
    if (!readyEngine) return;
    readyEngine.onClusterOpen = (opened) => {
      const box = container.current?.getBoundingClientRect();
      setCluster(
        opened === null
          ? null
          : {
              ids: opened.ids,
              x: opened.clientX - (box?.left ?? 0),
              y: opened.clientY - (box?.top ?? 0),
            },
      );
    };
    return () => {
      readyEngine.onClusterOpen = undefined;
    };
  }, [readyEngine]);
  const clusterSheet = useMemo(() => {
    if (cluster === null) return null;
    const typeOf = new Map(labels.map((label) => [label.id, label.type] as const));
    return clusterSheetOf(cluster.ids.flatMap((id) => typeOf.get(id) ?? []));
  }, [cluster, labels]);

  useEffect(() => {
    readyEngine?.displayMaquettes(maquettes);
  }, [readyEngine, maquettes]);

  // The exchanges fly to a place of this board, and press their stamps on it.
  useEffect(() => {
    if (readyEngine === null) return;
    return bindSpots({
      onMap: (at) => readyEngine.screenOf(at),
      stamp: (burst) => readyEngine.inkBurst(burst),
    });
  }, [readyEngine]);

  const reachedBefore = useRef<ReadonlyArray<ReachedOutpost> | null>(null);
  useEffect(() => {
    const before = reachedBefore.current;
    reachedBefore.current = outposts;
    if (before === null) return;
    for (const { at, km } of raisedReaches(before, outposts)) readyEngine?.inkReach(at, km);
  }, [outposts, readyEngine]);

  // A recruit steps out of its barracks' door and walks to its rank (#268). Nothing on the first view.
  const troopsKnown = useRef<ReadonlySet<string> | null>(null);
  useEffect(() => {
    const known = troopsKnown.current;
    troopsKnown.current = new Set(troops.map((troop) => troop.id));
    if (known === null) return;
    for (const sortie of sortiesOf(known, standing))
      readyEngine?.cue({ kind: 'sortie', ...sortie });
  }, [troops, standing, readyEngine]);

  // A troop steps down from a truck: its tailgate falls (ADR 0036). Nothing on the first view.
  const aboardKnown = useRef<ReadonlyMap<string, string> | null>(null);
  useEffect(() => {
    const known = aboardKnown.current;
    aboardKnown.current = aboardOf(troops);
    if (known === null) return;
    for (const groupId of descentesOf(known, troops, standing))
      readyEngine?.cue({ kind: 'descente', groupId });
  }, [troops, standing, readyEngine]);

  const cutBefore = useRef<ReadonlyArray<string> | null>(null);
  useEffect(() => {
    const before = cutBefore.current;
    cutBefore.current = cut.unlinked;
    if (before === null || readyEngine === null) return;
    const hour = asClockTime(Date.now());
    for (const regionId of cut.unlinked)
      if (!before.includes(regionId) && cut.producing.has(regionId))
        readyEngine.inkCut(regionId, { word: fr.stamps.unlinked, hour });
  }, [cut, readyEngine]);

  const inked = useRef<{ arcs: ReadonlyArray<ArcView>; seenAt: number } | null>(null);
  useEffect(() => {
    const latest = Math.max(0, ...journal.map((dispatch) => dispatch.at));
    const before = inked.current;
    inked.current = { arcs, seenAt: latest };
    if (before === null) return;
    const vanished = before.arcs.flatMap((arc) =>
      arc.state === 'mine' && !arcs.some((still) => still.id === arc.id) ? [arc.to] : [],
    );
    for (const burst of inkBursts(journal, before.seenAt, vanished))
      engine.current?.inkBurst(burst);
  }, [arcs, journal]);

  useEffect(() => {
    engine.current?.showHeldRegions(held);
  }, [held]);

  useEffect(() => {
    engine.current?.select(selectedCountry);
  }, [selectedCountry]);

  /** **Le rayon d'un détecteur, montré au doigt et rangé aussitôt** (fiche 03) : c'est le chiffre
   *  qui décide où on plante la chose, et il n'était nulle part sur la carte. Une troupe désignée
   *  tient le sien ouvert tant qu'elle l'est ; le survol passe devant et le lui rend. */
  useEffect(() => {
    readyEngine?.showReach(hoveredReach ?? reach);
  }, [readyEngine, hoveredReach, reach]);

  return (
    <div ref={container} className="relative h-full w-full overflow-hidden">
      <div aria-hidden className="map-veil" />
      <div aria-hidden className="map-grain" />
      <MapLabels
        labels={labels}
        engine={readyEngine}
        selected={selectedLabel}
        secondarySelected={selectedLootLabel}
        onMovementHover={onLabelHover ?? (() => {})}
        onReachHover={setHoveredReach}
        poster={poster ?? noPoster}
        onSelect={onSelect}
        onOpenBuilding={onOpenBuilding ?? (() => {})}
        onOpenStack={onLabelOpen}
        onOpenLoot={onOpenLoot ?? (() => {})}
        onOpenCamp={onOpenCamp ?? (() => {})}
        onOpenObjective={onOpenObjective ?? (() => {})}
        onOpenStrategic={onOpenStrategic ?? (() => {})}
        onAct={onLabelAct}
        mapping={mapping}
        holding={holding !== null}
        onCancelHeld={() => onDropRefused?.()}
        onHoldOver={holdOver}
        muted={placing !== null}
        openStation={openStation}
        groupFar={blitz !== null}
        nation={playerNation ?? null}
        onDisembark={onDisembark}
        carriersShown={carriersShown}
        onTakeDepot={onTakeDepot}
        onTour={onTour}
        cue={cue}
        cargoAim={cargoAim}
        availableLabels={availableLabels}
        selectionBar={bar}
      />
      <EdgeIndicators
        labels={labels}
        engine={readyEngine}
        toggles={indicators}
        destinations={edgeNames}
      />
      {/* Au coin droit, sous la réglette : au gauche, la fiche de la pièce en main la recouvrait.
          Ce qu'on y range d'autre s'empile dessous, jamais par-dessus. */}
      {(designatedArc !== null || underRouteScale) && (
        <div
          className="pointer-events-none absolute z-[var(--z-band)] flex flex-col items-end gap-2"
          style={{ top: insets.top + 16, left: insets.left + 16, right: insets.right + 16 }}
        >
          {designatedArc && <RouteScale arc={designatedArc} hideSingleMedium={quietRouteScale} />}
          {underRouteScale}
        </div>
      )}
      {gestureHint && <GestureHint mapping={mapping} />}
      {placing && <PlacingOverlay engine={readyEngine} placing={placing} container={container} />}
      {sweep && (
        <SweepOverlay
          key={sweep.nonce}
          engine={readyEngine}
          sweep={sweep}
          onEnd={onSweepEnd}
          onStatus={onSweepStatus}
        />
      )}
      {/* Une rose ouverte dit déjà ce que la pastille disait. */}
      {hint !== null && rose === null && (
        <DropHintChip
          ref={hintNode}
          hint={hint}
          fuel={dropFuel}
          {...(dropNotes ? { notes: dropNotes } : {})}
        />
      )}
      {detaching !== null && <DetachRing {...detaching} />}
      {cluster !== null && clusterSheet !== null && (
        <ClusterSheet
          sheet={clusterSheet}
          x={cluster.x}
          y={cluster.y}
          onApproach={() => readyEngine?.approachCluster(cluster.ids)}
          onClose={() => readyEngine?.closeCluster()}
        />
      )}
      {rose && (
        <CompassRose
          key={rose.opening}
          compass={rose.compass}
          x={rose.x}
          y={rose.y}
          width={rose.width}
          height={rose.height}
          onClose={() => {
            closeRose();
            onRoseDismiss?.();
          }}
          finger={fingerRose === null ? null : { floor: fingerRose.floor, onFit: fitRose }}
          onAction={(action) => {
            closeRose();
            onCompassAction(action, { x: rose.x, y: rose.y });
          }}
        />
      )}
    </div>
  );
}

/**
 * **L'appui long qui détache** (POC du 16/10) : un anneau d'encre ocre se remplit sous le pointeur
 * pendant `DETACH_MS` ; plein, il porte « 1 » — le glisser ne prendra que la troupe pressée. Il ne
 * paraît qu'après `RING_DELAY_S` : un simple clic sur l'escouade ne le fait pas clignoter.
 */
const RING_DELAY_S = 0.15;
function DetachRing({ x, y, done }: { x: number; y: number; done: boolean }) {
  const length = 2 * Math.PI * 17;
  return (
    <svg
      aria-hidden
      width={48}
      height={48}
      viewBox="0 0 48 48"
      className="pointer-events-none absolute z-[var(--z-popin)]"
      style={{ left: x - 24, top: y - 24 }}
    >
      <g opacity={done ? 1 : 0}>
        {!done && (
          <animate
            attributeName="opacity"
            to={1}
            begin={`${RING_DELAY_S}s`}
            dur="0.1s"
            fill="freeze"
          />
        )}
        <circle
          cx={24}
          cy={24}
          r={17}
          fill="var(--paper)"
          fillOpacity={0.8}
          stroke="var(--ink)"
          strokeOpacity={0.25}
        />
        <circle
          cx={24}
          cy={24}
          r={17}
          fill="none"
          stroke="var(--arc-mine)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={done ? 0 : length}
          transform="rotate(-90 24 24)"
        >
          {!done && (
            <animate
              attributeName="stroke-dashoffset"
              from={length}
              to={0}
              dur={`${DETACH_MS}ms`}
              fill="freeze"
            />
          )}
        </circle>
        {done && (
          <text
            x={24}
            y={28.5}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fill="var(--ink)"
          >
            1
          </text>
        )}
      </g>
    </svg>
  );
}

type OpenRose = {
  opening: number;
  compass: Compass;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * The menu's footprint around its center. It opens on the clicked point, except flush with
 * an edge: a medallion falling off the board would be an action seen but untakeable. The
 * margin follows the HUD scale, which zooms the whole menu.
 */
const ROSE_MARGIN = 70;

/** Ce qu'un point garde d'air au-dessus d'une feuille avant que la carte le remonte. */
const REVEAL_MARGIN = 48;

/** Enough to read the sentence twice, too short for it to become furniture. */
const HINT_MS = 7000;

/**
 * **What the player is holding, beside the pointer.** It follows the mouse rather than the
 * ghost: the ghost is where the building *would* go, the card is what the hand is carrying, and
 * pinning the words to the quay would leave the eye reading a caption at the other end of a bay.
 *
 * It is written entirely by the board (ADR 0016) — a name, a bill, a way out. The map prices
 * nothing.
 */
function PlacingCard({
  placing,
  container,
  thread,
}: {
  placing: PlacingBuilding;
  container: RefObject<HTMLDivElement | null>;
  thread: PlacingThread | null;
}) {
  const [at, setAt] = useState<{ x: number; y: number; flipX: boolean; flipY: boolean } | null>(
    null,
  );
  const narrow = useNarrowScreen();
  const insets = useBoardInsets();

  /** **Le carton ne sort pas de l'écran** : sur la moitié droite ou basse il passe de l'autre côté
   *  du pointeur, sinon un refus lu à la frontière se lirait hors champ. */
  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    const follow = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      // Au-dessus du pointeur dès le tiers haut passé : au téléphone, la feuille couvre le bas.
      setAt({ x, y, flipX: x > rect.width * 0.6, flipY: y > rect.height * 0.35 });
    };
    element.addEventListener('pointermove', follow);
    const forget = () => setAt(null);
    element.addEventListener('pointerleave', forget);
    return () => {
      element.removeEventListener('pointermove', follow);
      element.removeEventListener('pointerleave', forget);
    };
  }, [container]);

  /** **Au téléphone, la fiche est le pied de l'écran** (#239) : le doigt couvrirait une fiche
   *  qui le suit, et le point visé se tient au-dessus de lui. */
  if (narrow)
    return (
      <div
        className="pointer-events-none absolute inset-x-0 z-[var(--z-band)]"
        style={{ bottom: insets.bottom }}
      >
        <PlacingLines placing={placing} docked />
      </div>
    );
  if (at === null) return null;
  // Le carton se range de l'autre côté du fil : il en couvrirait le nom (#239).
  const long = thread?.long ?? null;
  const flipX = long === null ? at.flipX : long.to.x > long.from.x;
  /** Placé hors du `.hud`, qui porte un `zoom` : sa position serait zoomée avec lui. */
  return (
    <div
      className="pointer-events-none absolute z-[var(--z-band)]"
      style={{
        left: at.x + (flipX ? -PLACING_CARD_GAP : PLACING_CARD_GAP),
        top: at.y + (at.flipY ? -PLACING_CARD_GAP : PLACING_CARD_GAP),
        transform: `translate(${flipX ? '-100%' : '0'}, ${at.flipY ? '-100%' : '0'})`,
      }}
    >
      <PlacingLines placing={placing} />
    </div>
  );
}

function PlacingLines({ placing, docked = false }: { placing: PlacingBuilding; docked?: boolean }) {
  const coarse = useCoarsePointer();
  return (
    <div
      className={`hud paper-grain px-[10px] py-[7px] font-(family-name:--font-body) text-[12px] text-[var(--ink)] ${
        docked
          ? 'border-t border-[var(--ink)] px-[16px] pb-[12px]'
          : 'float max-w-[240px] border border-[var(--ink)]'
      }`}
    >
      <span className="block font-semibold">{placing.title}</span>
      <span className="block text-[11.5px] text-[var(--ink-soft)]">{placing.name}</span>
      {/* Le prix sur sa propre ligne : ses pictos ne chevauchent rien, à 1440 comme à 390. */}
      <span className="mt-[2px] flex items-center gap-[6px] font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
        {placing.free ? fr.construction.free : <Price costs={placing.cost} size={11} />}
        <span>· {placing.duration}</span>
      </span>
      {placing.refusal !== null && (
        <span className="mt-[4px] block text-[11px] font-semibold text-[var(--critical)] first-letter:uppercase">
          {placing.refusal}
        </span>
      )}
      {placing.nearest !== null && (
        <span className="mt-[2px] block text-[11px] text-[var(--ink-soft)]">{placing.nearest}</span>
      )}
      {(placing.refusal === null || docked) && (
        <span className="mt-[4px] block text-[11px] text-[var(--ink-soft)]">
          {coarse ? fr.placing.hintTouch : fr.placing.hint}
        </span>
      )}
    </div>
  );
}

/** The maquette's inks of a thread (`bassin.html`): the designated ochre, the adverse red. */
const THREAD_INK = 'var(--notable)';
const THREAD_REFUSED_INK = ADVERSE_INK;

/** The share of the thread, from the ghost, where its name stands: by the basin it names. */
const THREAD_LABEL_AT = 2 / 3;

/**
 * **What a held building draws over the map** (#239): its thread and its card. The thread comes
 * from the map at each rendered frame (`onPlacingThread`), so nothing moves at rest; it is kept
 * here and not in `WorldMap`, which would render again at each frame of the aim.
 */
function PlacingOverlay({
  engine,
  placing,
  container,
}: {
  engine: MapEngine | null;
  placing: PlacingBuilding;
  container: RefObject<HTMLDivElement | null>;
}) {
  const [thread, setThread] = useState<PlacingThread | null>(null);
  useEffect(() => {
    if (engine === null) return;
    engine.onPlacingThread = setThread;
    engine.invalidate();
    return () => {
      engine.onPlacingThread = undefined;
    };
  }, [engine]);
  return (
    <>
      {thread !== null && <PlacingThreadInk thread={thread} />}
      <PlacingCard placing={placing} container={container} thread={thread} />
    </>
  );
}

/**
 * **Le fil de la pose** (#239, maquette « Bassin et fil ») : du fantôme au gisement prenable le
 * plus proche, en pointillé qui ploie, son nom et sa distance près du bassin, une flèche au bord
 * de l'écran quand il est hors champ ; tendu, du pointeur — ou du doigt — à l'épingle. Au sommet
 * de chaque rayon d'avant-poste, son nom.
 */
function PlacingThreadInk({ thread }: { thread: PlacingThread }) {
  const { long, taut, rings } = thread;
  const label = long === null ? null : fr.placing.thread(long.deposit, long.place, long.km);
  // The point of the quadratic at `THREAD_LABEL_AT`.
  const t = THREAD_LABEL_AT;
  const labelAt =
    long === null
      ? null
      : {
          x: (1 - t) ** 2 * long.from.x + 2 * (1 - t) * t * long.bend.x + t * t * long.to.x,
          y: (1 - t) ** 2 * long.from.y + 2 * (1 - t) * t * long.bend.y + t * t * long.to.y,
        };
  return (
    <svg className="pointer-events-none absolute inset-0 z-[var(--z-band)] h-full w-full overflow-visible">
      {rings.map((ring) => (
        <text
          key={`${ring.top.x},${ring.top.y}`}
          x={ring.top.x}
          y={ring.top.y - 6}
          textAnchor="middle"
          className="font-(family-name:--font-display) text-[12px] italic"
          // Le liseré papier des noms de la carte : lisible sur la feuille de nuit.
          style={{
            fill: 'var(--ink-soft)',
            stroke: 'var(--paper)',
            strokeWidth: 3,
            paintOrder: 'stroke',
          }}
        >
          {fr.placing.reach(ring.km)}
        </text>
      ))}
      {long !== null && (
        <g style={{ stroke: THREAD_INK }} fill="none">
          <path
            d={`M${long.from.x} ${long.from.y}Q${long.bend.x} ${long.bend.y} ${long.to.x} ${long.to.y}`}
            strokeWidth={1.6}
            strokeDasharray="4 4"
          />
          {long.off && (
            <path
              d={`M${long.to.x} ${long.to.y}l${-Math.cos(long.angle - 0.4) * 10} ${-Math.sin(long.angle - 0.4) * 10}L${long.to.x - Math.cos(long.angle + 0.4) * 10} ${long.to.y - Math.sin(long.angle + 0.4) * 10}Z`}
              style={{ fill: THREAD_INK }}
            />
          )}
        </g>
      )}
      {taut !== null && (
        <line
          x1={taut.from.x}
          y1={taut.from.y}
          x2={taut.to.x}
          y2={taut.to.y}
          style={{ stroke: thread.refused ? THREAD_REFUSED_INK : THREAD_INK }}
          strokeWidth={2}
        />
      )}
      {labelAt !== null && label !== null && (
        <foreignObject
          x={Math.round(labelAt.x) - 120}
          y={Math.round(labelAt.y) - 24}
          width={240}
          height={20}
        >
          <div className="flex justify-center">
            <span className="border border-[var(--notable)] bg-[rgb(241_232_210/94%)] px-[5px] font-(family-name:--font-body) text-[11px] leading-[16px] font-semibold whitespace-nowrap text-[var(--ink)]">
              {label}
            </span>
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

const noSweepEnd = () => {};

/** Clear of the cursor's own drawing, which is twenty-nine pixels wide (`TROWEL_CURSOR`). */
const PLACING_CARD_GAP = 22;

/**
 * The first-time hint. It asks nothing and does not close by hand: its work was done the
 * moment it was read, and the controls card takes over afterwards.
 */
function GestureHint({ mapping }: { mapping: MouseMapping }) {
  const hint = fr.mapUi.gestureHint(mapping);
  return (
    <div
      style={{ marginBottom: MAT_LIFT_HUD }}
      className="hud paper-grain pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 border border-[var(--ink)] px-[14px] py-[7px] font-(family-name:--font-body) text-[12px] whitespace-nowrap text-[var(--ink)] float"
    >
      {hint.orient}
      <span className="text-[var(--ink-soft)]">{hint.separator}</span>
      {hint.pan}
      <span className="text-[var(--ink-soft)]">{hint.separator}</span>
      {hint.lift}
    </div>
  );
}

const clamp = (value: number, margin: number, extent: number): number =>
  extent < margin * 2 ? extent / 2 : Math.min(Math.max(value, margin), extent - margin);

/**
 * The place under the pointer, in the shape the aim names it at every scale (ADR 0019 §1): a
 * lon/lat, plus the region that happens to be drawn there because a foundation still needs one.
 * The fan sorts out which type takes which.
 */
function pointTarget(
  country: string | null,
  region: RegionIdentity | null,
  point: LonLat | null,
  coastal: boolean,
  ground: Ground,
  coastPending: boolean,
  walkable: boolean,
): CompassTarget | null {
  if (point === null) return null;
  return {
    kind: 'point',
    lon: point[0],
    lat: point[1],
    regionId: region?.id ?? null,
    country,
    name:
      /** Un lac se nomme lac, même dans le dessin d'une région qui ne l'a pas évidé. */
      ground === 'lake'
        ? fr.compass.lake
        : (region?.name ?? (country === null ? fr.compass.openWater : countryLabel(country))),
    coastal,
    ground,
    coastPending,
    walkable,
  };
}

/**
 * A marker label designates the entity it carries; any other — construction, movement head —
 * falls back to the land aimed beneath, which is the only target the game can honor today.
 */
export function targetOfLabel(
  label: MapLabel,
  country: string | null,
  region: RegionIdentity | null,
  /** **La côte se lit sur le point du label, jamais sous le curseur** : un mât plein cadre
   *  déborde sa cellule, et une colonne embarquée débarque à l'ancre, pas là où on a cliqué. */
  coastAt: (lonLat: LonLat) => boolean,
  groundAt: (lonLat: LonLat) => Ground,
  /** Une route à pied aboutit-elle au point du label (`isWalkableCell`, #224) ? */
  walkableAt: (lonLat: LonLat) => boolean = () => true,
): CompassTarget | null {
  if (label.type === 'outpost' && label.hostCountry !== null && label.station?.kind === 'outpost') {
    return {
      kind: 'outpost',
      /**
       * **L'identité Convex du point, jamais la clé du marqueur** : le mât est posé sous
       * `outpost-<id>` pour ne pas collider avec les autres calques, et la rose comme le serveur
       * lisent un `Id<'outposts'>` brut — l'un compare à `me.outposts`, l'autre y ouvre un ordre.
       * Le préfixe rendait « élever » muet et faisait répondre `UNKNOWN_OUTPOST` à la marche.
       */
      id: label.station.outpostId,
      hostCountry: label.hostCountry,
      name: lineText(label, 'nature') ?? fr.compass.fallbackOutpost,
      coastal: label.anchor.kind === 'ground' && coastAt(label.anchor.lonLat),
    };
  }
  /**
   * **Le mât d'un bâtiment est une cible** (décisions 54a, 56a) : le clic droit y ouvre la rose
   * qui monte un niveau. La poignée est celle du label — clé, niveau, région — et non le sol
   * relevé sous le curseur : un mât plein cadre déborde sa région dessinée, et la rose doit
   * facturer l'élévation de ce bâtiment-ci, pas de ce qu'il recouvre.
   */
  if (label.type === 'building' && label.building !== null) {
    return { kind: 'building', ...label.building };
  }
  /**
   * **Une installation relevée est une cible d'expédition** (S8) : la poignée est celle du
   * relevé — identité, clé, région — et jamais le sol sous le curseur, qu'un mât plein cadre
   * déborde. Elle n'ouvre rien au repos : la rose s'y referme sans colonne armée.
   */
  if (label.installation !== null) {
    return {
      kind: 'installation',
      ...label.installation,
      name: lineText(label, 'nature') ?? fr.buildings[label.installation.key],
    };
  }
  /** La caisse : le relevé possédé, et le sol lu sous son propre point — pas sous le curseur. */
  if (label.lootSightingId !== null) {
    return {
      kind: 'loot',
      id: label.lootSightingId,
      point: label.anchor.kind === 'ground' ? label.anchor.lonLat : [0, 0],
      current: label.lootCurrent,
      ground: label.anchor.kind === 'ground' ? groundAt(label.anchor.lonLat) : 'sea',
      coastal: label.anchor.kind === 'ground' && coastAt(label.anchor.lonLat),
      name: lineText(label, 'nature') ?? fr.loot.cardKicker,
    };
  }
  /**
   * **Un objectif neutre est une cible**, et la seule qu'on vise sans l'avoir relevée : il est
   * public par nature. La poignée est le mât lui-même — identité, nom, palier — et jamais le sol
   * sous le curseur, qu'un mât plein cadre déborde.
   */
  if (label.objective !== null) {
    return {
      kind: 'objective',
      id: label.objective.id,
      point: label.anchor.kind === 'ground' ? label.anchor.lonLat : [0, 0],
      country,
      name: label.objective.name,
      tier: label.objective.tier,
    };
  }
  /** **Un point stratégique est une cible publique** (P2) : la poignée est le mât lui-même. */
  if (label.strategic !== null) {
    return {
      kind: 'strategic',
      id: label.strategic.id,
      point: label.anchor.kind === 'ground' ? label.anchor.lonLat : [0, 0],
      country,
      name: label.strategic.name,
    };
  }
  /**
   * **Un camp relevé est une cible d'attaque** (ADR 0024 §4) : la poignée est le relevé lui-même
   * — son identité et son point — et jamais le sol sous le curseur. Au repos il n'ouvre rien :
   * sans colonne armée il n'y a pas d'ordre à donner là.
   */
  if (label.camp !== null) {
    return {
      kind: 'camp',
      id: label.camp.id,
      point: label.anchor.kind === 'ground' ? label.anchor.lonLat : [0, 0],
      country,
      /** Sur le point du mât, jamais sous le curseur : un mât plein cadre déborde sa cellule, et
       *  une flotte vise le mouillage relevé, pas le pixel cliqué. */
      ground: label.anchor.kind === 'ground' ? groundAt(label.anchor.lonLat) : 'sea',
      coastal: label.anchor.kind === 'ground' && coastAt(label.anchor.lonLat),
      walkable: label.anchor.kind !== 'ground' || walkableAt(label.anchor.lonLat),
      name: fr.camps.marker,
    };
  }
  if (label.type === 'stack') {
    return {
      kind: 'force',
      id: label.id,
      country,
      name: label.force?.composition ?? fr.compass.fallbackForce,
      headcount: label.force?.headcount ?? 0,
      ground: label.anchor.kind === 'ground' ? groundAt(label.anchor.lonLat) : 'sea',
      /** Son adresse : on fonde où l'on se tient, donc c'est le point que la branche plantera. */
      station: label.station,
      regionId: region?.id ?? null,
    };
  }
  return country === null ? null : { kind: 'country', country };
}

function lineText(label: MapLabel, role: 'nature'): string | null {
  const line = label.lines.find((candidate) => candidate.role === role);
  return line === undefined || !('text' in line) ? null : line.text;
}

const noPoster = (): ReactNode => null;
