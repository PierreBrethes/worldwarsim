// Le moteur de carte est une classe impérative reçue en ref, à qui on assigne des
// callbacks (`.onSelect`, `.onRegionHover`, …) — React Compiler lit ça comme une
// mutation interdite. Exclusion volontaire : le moteur n'importe pas React (CLAUDE.md).
'use no memo';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { countryLabel, fr } from '@/i18n/fr';
import { loadRegions, type RegionIdentity, type World } from '@/domain/world';
import type { LonLat } from '@/domain/geo';
import type { MapLabel, Reach } from '@/domain/labels';
import type { IndicatorToggles } from '@/domain/indicators';
import {
  isDestinationAction,
  type CompassAction,
  type CompassTarget,
  type Compass,
  withheldUnderFinger,
} from '@/domain/compass-rose';
import {
  PREVIEW_ARC_ID,
  type ArcView,
  type JournalDispatch,
  type TroopStation,
} from '@/domain/player-view';
import { inkBursts } from '@/domain/ink-bursts';
import { markGestureHintSeen, readHudScale, gestureHintSeen } from '@/data/settings';
import { useMapMotion } from '@/data/mapMotion';
import { useMouseMapping } from '@/data/mouseMapping';
import type { MouseMapping } from '@/domain/mouse-mapping';
import { RouteScale } from './RouteScale';
import { MapLabels, type StackHover } from './MapLabels';
import { EdgeIndicators } from './EdgeIndicators';
import { CompassRose } from './CompassRose';
import {
  MapEngine,
  type BuiltRegions,
  type HeldClaim,
  type SearchArea,
  type StandingPile,
} from './engine';

type Props = {
  world: World;
  arcs: ReadonlyArray<ArcView>;
  /** The dispatches the player already receives: the only thing the map is allowed to stamp. */
  journal: ReadonlyArray<JournalDispatch>;
  labels: ReadonlyArray<MapLabel>;
  /** My piles standing at a point, which the board dresses in figurines up close. */
  standing: ReadonlyArray<StandingPile>;
  inkByCountry: ReadonlyMap<string, string>;
  /**
   * **Qui tient quelles régions, et de quelle encre** (ADR 0020 §1) — servi par `control.held`,
   * jamais recalculé ici : la carte dessine ce qu'on lui tend.
   */
  held: ReadonlyArray<HeldClaim>;
  /**
   * What the player has built, and his ink to lay it in. Opposing buildings are absent from
   * `PlayerView`, so no region but his own can ever be inked here (ADR 0005).
   */
  built: BuiltRegions;
  selectedCountry: string | null;
  playerNation: string | null;
  /** The categories whose off-frame entities fold to the screen edge. */
  indicators: IndicatorToggles;
  /** The id of the movement the timeline designates — the matching arc rises in intensity. */
  accentedMovement: string | null;
  onSelect: (name: string | null) => void;
  /** A click on a building's mast opens its surface instead of selecting the country. */
  onOpenBuilding?: (buildingId: string, clientX: number, clientY: number) => void;
  /**
   * Un clic sur une pile posée ouvre sa garnison — la porte que le mât n'a pas, faute de mât.
   *
   * **Il rend vrai quand le clic a désigné une troupe**, et la rose s'ouvre alors sur le sprite
   * avec le cartouche : la popin lit, la rose agit (décision Pierre, 30/08). Faux quand c'est la
   * fenêtre de garnison qui répond — un menu posé par-dessus un panneau ferait deux réponses à un
   * seul clic. La règle qui sépare les deux reste au plateau, qui seul sait ce qui se tient là.
   */
  onOpenStack?: (station: TroopStation, clientX: number, clientY: number) => boolean;
  /** Opens a read-only private sighting; nearby ids are ordered for click cycling. */
  onOpenLoot?: (sightingIds: ReadonlyArray<string>, clientX: number, clientY: number) => void;
  /** Un clic sur un camp relevé ouvre son cartouche — ce qu'on en sait, et rien de plus. */
  onOpenCamp?: (campId: string, clientX: number, clientY: number) => void;
  onOpenObjective?: (objectiveId: string, clientX: number, clientY: number) => void;
  /** L'étiquette désignée par le plateau : une troupe posée, cliquée seule. */
  selectedLabel?: string | null;
  /** Le visage de la pile mise en avant — ce qui est coché, et non la majorité de la pile. */
  selectedPlate?: string | null;
  selectedLootLabel?: string | null;
  /**
   * **Le cercle que le plateau tient ouvert**, par-dessous celui du survol : le rayon de
   * détection d'une troupe désignée. Le survol l'emporte tant qu'il dure et le rend ensuite —
   * une seule onde à l'écran, jamais deux qui se disputent l'anneau.
   */
  reach?: Reach | null;
  onCountryHover?: (adm0: string | null) => void;
  onRegionHover?: (region: RegionIdentity | null) => void;
  /**
   * **La couche admin-1 est arrivée** : la carte tend au plateau de quoi nommer la région sous un
   * point, par la même lecture que le survol. Un cartouche de pile en a besoin, et il est écrit
   * au plateau, pas ici.
   */
  onRegionsLoaded?: (regionAt: (lonLat: LonLat) => RegionIdentity | null) => void;
  onArcHover?: (id: string | null) => void;
  onLabelHover?: (id: string | null) => void;
  onStackHover?: (hover: StackHover | null) => void;
  /** What the target allows. The map asks the question; it does not know the view. */
  compassOf: (target: CompassTarget) => Compass | null;
  /** `at` is the aimed point, in the map's own coordinates: what an action anchors a panel to. */
  onCompassAction: (action: CompassAction, at: { x: number; y: number }) => void;
  /** The board wears the trowel while a construction panel is open. */
  building?: boolean;
  /**
   * **A building held over one region, waiting for the point it goes down on** (ADR 0013,
   * revision of 04/09) — the port and nothing else so far. The ghost snaps onto the coast cells
   * of that region; the click hands back the one it landed on, and everything else about the
   * mode — what it costs, what it is called, when it ends — stays on the board.
   */
  placing?: PlacingBuilding | null;
  onPlacePoint?: (point: LonLat) => void;
  /** A column is armed: the cursor becomes the aim and the right click names a march. */
  aiming?: boolean;
  /**
   * The regions an armed mobilisation key accepts, and the click that names one. The map holds
   * no rule of its own here: the list arrives computed (`placementOf`), and the click hands
   * back a region id — what happens to it is the board's business.
   */
  designatedRegions?: ReadonlyArray<string>;
  onDesignateRegion?: (regionId: string | null) => void;
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
  /**
   * **Au doigt, la rose d'une pile à soi qui n'a rien à proposer ne s'ouvre pas** (décision 2a
   * du 05/10) : le toucher lit et agit d'un seul geste, et une rose de refus doublait la feuille
   * de la troupe en se calant sur le bandeau. Son motif ne se tait pas (ADR 0015) — il remonte
   * ici, mot pour mot, et la feuille le porte. `null` quand la rose s'ouvre.
   */
  onForceMotive?: (labelId: string, motive: string | null) => void;
  /**
   * **Les destinations d'une colonne armée, cerclées sur la carte et nommées au bord** quand
   * elles sont hors champ (lot mobile-3, A8). Le plateau l'allume sous le seuil ; la carte
   * décide lesquelles, par la même rose que le geste ouvrirait.
   */
  showDestinations?: boolean;
  /** **Ces destinations, rendues au plateau**, de la plus proche à la plus lointaine de
   *  `aimOrigin` — l'étiquette d'où la colonne part : la feuille en offre les trois premières
   *  sous le pouce (refonte mobile, 1b). */
  aimOrigin?: string | null;
  onDestinations?: (destinations: ReadonlyArray<Destination>) => void;
  /**
   * **Sous le seuil, une cible visée ouvre la feuille d'ordre, pas la rose** (refonte mobile,
   * 1c) : le type d'ordre s'y choisit. Le plateau rend vrai quand il a pris la cible — une rose
   * qui ne porte que son motif de refus s'ouvre encore, c'est elle qui sait le dire.
   */
  onOrderTarget?: ((compass: Compass, at: { x: number; y: number }) => boolean) | undefined;
  /** Une fenêtre couvre le plateau sous le seuil : une rose ouverte n'y désignerait plus rien. */
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
};

/**
 * What the board is holding: the region the ghost may land in, its plate, and the card that
 * follows the pointer while it looks for a shore. The card's lines arrive written (ADR 0016):
 * the map prices nothing and names nothing.
 */
export type PlacingBuilding = {
  readonly regionId: string;
  readonly sprite: string | null;
  readonly title: string;
  readonly figures: string;
};

/**
 * **Une destination de la colonne armée** : l'étiquette qui la porte, le nom que sa rose
 * écrit, et cette rose même — c'est elle qu'un raccourci de la feuille rejoue, jamais une copie.
 */
export type Destination = {
  readonly labelId: string;
  readonly name: string;
  readonly compass: Compass;
};

/** A stable empty list: a fresh `[]` default would rebuild the highlight on every render. */
const NO_REGIONS: ReadonlyArray<string> = [];
const NO_DESTINATIONS: ReadonlyArray<Destination> = [];

export function WorldMap({
  world,
  arcs,
  journal,
  labels,
  standing,
  inkByCountry,
  held,
  built,
  selectedCountry,
  playerNation,
  indicators,
  accentedMovement,
  onSelect,
  onOpenBuilding,
  onOpenStack,
  onOpenLoot,
  onOpenCamp,
  onOpenObjective,
  selectedLabel = null,
  selectedPlate = null,
  selectedLootLabel = null,
  reach = null,
  onCountryHover,
  onRegionHover,
  onRegionsLoaded,
  onArcHover,
  onLabelHover,
  onStackHover,
  compassOf,
  onCompassAction,
  building = false,
  placing = null,
  onPlacePoint,
  aiming = false,
  designatedRegions = NO_REGIONS,
  onDesignateRegion,
  focus = null,
  searchArea = null,
  fingerRose = null,
  onForceMotive,
  showDestinations = false,
  aimOrigin = null,
  onDestinations,
  onOrderTarget,
  covered = false,
  reveal = null,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
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
  // The label layer can only attach once the engine exists: it needs the instance, not a
  // ref that triggers no render.
  const [readyEngine, setReadyEngine] = useState<MapEngine | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const instance = new MapEngine(container.current, world);
    engine.current = instance;
    setReadyEngine(instance);
    if (import.meta.env.DEV) (window as unknown as { mapEngine?: MapEngine }).mapEngine = instance;

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);

    // The board does not wait for these 500 KB, and their failure is mute — but the possession
    // colour hangs on them too since ADR 0020: no regions, no ground to ink.
    let abandoned = false;
    loadRegions()
      .then((data) => {
        if (abandoned) return;
        instance.displayRegions(data);
        regionsLoaded.current?.((lonLat) => instance.regionAtLonLat(lonLat));
      })
      .catch(() => {});

    return () => {
      abandoned = true;
      observer.disconnect();
      instance.dispose();
      engine.current = null;
      setReadyEngine(null);
    };
  }, [world]);

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

  // One rose at a time, and the camera holds still while it is open: aiming at an action on
  // a map drifting under the pointer is aiming twice.
  const openRose = useCallback(
    (target: CompassTarget, clientX: number, clientY: number) => {
      const drawn = compassOf(target);
      const rect = container.current?.getBoundingClientRect();
      if (drawn === null || rect === undefined) return;
      const at = { x: clientX - rect.left, y: clientY - rect.top };
      if (aiming && onOrderTarget?.(drawn, at) === true) {
        setRose(null);
        return;
      }
      if (target.kind === 'force') {
        const withheld = fingerRose !== null && withheldUnderFinger(target, drawn);
        onForceMotive?.(target.id, withheld ? drawn.refusal : null);
        if (withheld) {
          setRose(null);
          return;
        }
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
    [compassOf, fingerRose, aiming, onOrderTarget, onForceMotive],
  );

  const fitRose = useCallback((dx: number, dy: number) => {
    engine.current?.nudge(dx, dy);
    setRose((open) => (open === null ? null : { ...open, x: open.x + dx, y: open.y + dy }));
  }, []);

  const closeRose = useCallback(() => setRose(null), []);

  /**
   * **Une seule lecture de la côte, celle de la grille de routage** (décision 72a) : le moteur
   * répond avec `isCoastCell`, la fonction même dont le serveur tire son refus. Le fan ne peut
   * donc pas offrir une plage que la mutation renverrait (ADR 0015).
   */
  const coastAt = useCallback((lonLat: LonLat) => engine.current?.coastAt(lonLat) ?? false, []);
  const landAt = useCallback((lonLat: LonLat) => engine.current?.landAt(lonLat) ?? false, []);

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
          point !== null && landAt(point),
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
  }, [readyEngine, openRose, aiming, placing, coastAt, landAt]);

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

  /**
   * **Le clic gauche sur un sprite de troupe ouvre les deux à la fois** (décision Pierre, 30/08) :
   * le cartouche en lecture, la rose en action. La cible est celle du clic droit, mot pour mot —
   * `targetOfLabel`, jamais un éventail parallèle — donc les deux gestes répondent la même chose
   * sur le même sprite.
   */
  const onLabelOpen = useCallback(
    (label: MapLabel, clientX: number, clientY: number) => {
      if (label.station === null) return;
      const map = engine.current;
      const target = targetOfLabel(
        label,
        map?.countryAtPoint(clientX, clientY) ?? null,
        map?.regionAtPoint(clientX, clientY) ?? null,
        coastAt,
        landAt,
      );
      /** **Sous le doigt, en visée, une destination ne se désigne pas** : le même toucher agit
       *  juste après (`onAct`), et désigner aurait réarmé la colonne sous la rose qui l'emmène —
       *  « embarquer » partait avec le cargo pour seul passager. */
      if (
        aiming &&
        fingerRose !== null &&
        target !== null &&
        compassOf(target)?.actions.some(isDestinationAction) === true
      )
        return;
      if (onOpenStack?.(label.station, clientX, clientY) !== true) return;
      /** **Une autre pile désignée en visée n'ouvre pas de rose** : `compassOf` la lirait encore
       *  avec la colonne que ce clic vient de remplacer. */
      if (target === null || (aiming && label.id !== aimOrigin)) return;
      openRose(target, clientX, clientY);
    },
    [onOpenStack, openRose, compassOf, aiming, aimOrigin, fingerRose, coastAt, landAt],
  );

  const onLabelAct = useCallback(
    (label: MapLabel, clientX: number, clientY: number) => {
      const map = engine.current;
      const country = map?.countryAtPoint(clientX, clientY) ?? null;
      /** La région dessinée sous le clic : c'est elle qui dit si le sol est déjà le mien, la
       *  seule chose qui sépare une fondation possible d'un `FRIENDLY_TARGET`. */
      const region = map?.regionAtPoint(clientX, clientY) ?? null;
      const target = targetOfLabel(label, country, region, coastAt, landAt);
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
       * rend son sol.
       */
      const ground = map?.pointAt(clientX, clientY) ?? null;
      const aimed =
        aiming &&
        target?.kind !== 'outpost' &&
        target?.kind !== 'force' &&
        target?.kind !== 'building' &&
        map !== null
          ? pointTarget(
              country,
              region,
              ground,
              ground !== null && coastAt(ground),
              ground !== null && landAt(ground),
            )
          : target;
      if (aimed === null) return;
      openRose(aimed, clientX, clientY);
    },
    [openRose, aiming, coastAt, landAt],
  );

  /**
   * **Où la colonne armée peut aller, lu par la rose qu'un toucher y ouvrirait** (lot mobile-3,
   * A8) : une étiquette est une destination quand sa rose porte une marche, une expédition ou un
   * ramassage — la même fonction que le geste, donc jamais un cercle sur ce que la rose refuse
   * (ADR 0015). Le sol nu n'y est pas : il est partout.
   */
  const destinations = useMemo<ReadonlyArray<Destination>>(() => {
    if (!aiming || !showDestinations) return NO_DESTINATIONS;
    const found = labels.flatMap((label): ReadonlyArray<Destination> => {
      const target = targetOfLabel(label, null, null, coastAt, landAt);
      if (target === null || target.kind === 'country' || target.kind === 'point') return [];
      const fan = compassOf(target);
      if (fan === null || !fan.actions.some(isDestinationAction)) return [];
      return [{ labelId: label.id, name: fan.name, compass: fan }];
    });
    return found;
  }, [aiming, showDestinations, labels, compassOf, coastAt, landAt]);
  /** **Rangées au commit, pas au rendu** : le moteur ne connaît la place d'une étiquette neuve
   *  qu'une fois `MapLabels` lui a passé ses ancres, dans son propre effet — qui précède
   *  celui-ci. Mesurées pendant le rendu, les cibles de l'armement tombaient à l'infini et la
   *  feuille offrait des lointaines pour les plus proches. */
  useEffect(() => {
    if (onDestinations === undefined) return;
    if (aimOrigin === null || readyEngine === null) {
      onDestinations(destinations);
      return;
    }
    const away = (destination: Destination) =>
      readyEngine.labelSeparation(aimOrigin, destination.labelId) ?? Infinity;
    onDestinations([...destinations].sort((first, second) => away(first) - away(second)));
  }, [destinations, onDestinations, aimOrigin, readyEngine]);
  const destinationIds = useMemo(
    () => new Set(destinations.map((destination) => destination.labelId)),
    [destinations],
  );
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
    readyEngine?.setMapMotion(motion);
  }, [readyEngine, motion]);

  useEffect(() => {
    readyEngine?.freezeOrbit(rose !== null);
  }, [readyEngine, rose]);

  useEffect(() => {
    engine.current?.setPlayerNation(playerNation);
  }, [playerNation]);

  useEffect(() => {
    readyEngine?.setBuilding(building);
  }, [readyEngine, building]);

  useEffect(() => {
    readyEngine?.setAiming(aiming);
  }, [readyEngine, aiming]);

  useEffect(() => {
    readyEngine?.setPlacing(placing?.regionId ?? null, placing?.sprite ?? null);
  }, [readyEngine, placing]);

  useEffect(() => {
    if (engine.current) engine.current.onPlacePoint = onPlacePoint ?? (() => {});
  }, [onPlacePoint]);

  // A key with no ground to go down on designates nothing: the trowel only comes out when a
  // click can actually land, so the mode is the list and not a separate flag to keep in step.
  const designating = onDesignateRegion !== undefined && designatedRegions.length > 0;

  useEffect(() => {
    readyEngine?.setDesignating(designating);
  }, [readyEngine, designating]);

  useEffect(() => {
    readyEngine?.showDesignatedRegions(designatedRegions);
  }, [readyEngine, designatedRegions]);

  useEffect(() => {
    if (engine.current) engine.current.onRegionClick = onDesignateRegion ?? (() => {});
  }, [onDesignateRegion]);

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

  useEffect(() => {
    if (covered) setRose(null);
  }, [covered]);

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
  const designatedArc = arcs.find((arc) => arc.id === accentedMovement) ?? null;

  useEffect(() => {
    engine.current?.displayArcs(arcs);
  }, [arcs]);

  useEffect(() => {
    readyEngine?.displayStanding(standing);
  }, [readyEngine, standing]);

  const inked = useRef<{ arcs: ReadonlyArray<ArcView>; seenAt: number } | null>(null);
  useEffect(() => {
    const latest = Math.max(0, ...journal.map((dispatch) => dispatch.at));
    const before = inked.current;
    inked.current = { arcs, seenAt: latest };
    if (before === null) return;
    const vanished = before.arcs.flatMap((arc) =>
      arc.state === 'mine' &&
      arc.id !== PREVIEW_ARC_ID &&
      !arcs.some((still) => still.id === arc.id)
        ? [arc.to]
        : [],
    );
    for (const burst of inkBursts(journal, before.seenAt, vanished))
      engine.current?.inkBurst(burst);
  }, [arcs, journal]);

  useEffect(() => {
    engine.current?.colorNations(inkByCountry);
  }, [inkByCountry]);

  useEffect(() => {
    engine.current?.showHeldRegions(held);
  }, [held]);

  useEffect(() => {
    engine.current?.showBuiltRegions(built);
  }, [built]);

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
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            'radial-gradient(ellipse 75% 68% at 50% 44%, rgba(228,216,189,.045) 0%, transparent 42%), radial-gradient(ellipse 85% 75% at 50% 46%, transparent 48%, rgba(10,7,3,.5) 100%)',
        }}
      />
      <MapLabels
        labels={labels}
        engine={readyEngine}
        selected={selectedLabel}
        selectedPlate={selectedPlate}
        secondarySelected={selectedLootLabel}
        onMovementHover={onLabelHover ?? (() => {})}
        onReachHover={setHoveredReach}
        onStackHover={onStackHover ?? (() => {})}
        onSelect={onSelect}
        onOpenBuilding={onOpenBuilding ?? (() => {})}
        onOpenStack={onLabelOpen}
        onOpenLoot={onOpenLoot ?? (() => {})}
        onOpenCamp={onOpenCamp ?? (() => {})}
        onOpenObjective={onOpenObjective ?? (() => {})}
        onAct={onLabelAct}
        mapping={mapping}
        muted={placing !== null}
        destinations={destinationIds}
      />
      <EdgeIndicators
        labels={labels}
        engine={readyEngine}
        toggles={indicators}
        destinations={edgeNames}
      />
      {designatedArc && (
        <div className="absolute top-4 left-4 z-10">
          <RouteScale arc={designatedArc} />
        </div>
      )}
      {gestureHint && <GestureHint mapping={mapping} />}
      {placing && <PlacingCard placing={placing} container={container} />}
      {rose && (
        <CompassRose
          key={rose.opening}
          compass={rose.compass}
          x={rose.x}
          y={rose.y}
          width={rose.width}
          height={rose.height}
          onClose={closeRose}
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
}: {
  placing: PlacingBuilding;
  container: RefObject<HTMLDivElement | null>;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    const follow = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      setAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    element.addEventListener('pointermove', follow);
    const forget = () => setAt(null);
    element.addEventListener('pointerleave', forget);
    return () => {
      element.removeEventListener('pointermove', follow);
      element.removeEventListener('pointerleave', forget);
    };
  }, [container]);

  if (at === null) return null;
  return (
    <div
      className="hud pointer-events-none absolute z-10 max-w-[240px] border border-[var(--ink-quiet)] bg-[var(--desk)] px-[10px] py-[7px] font-(family-name:--font-body) text-[12px] text-[var(--paper)]"
      style={{ left: at.x + PLACING_CARD_GAP, top: at.y + PLACING_CARD_GAP }}
    >
      <span className="block font-semibold">{placing.title}</span>
      <span className="block font-(family-name:--font-mono) text-[11.5px] text-[var(--paper-dim)]">
        {placing.figures}
      </span>
      <span className="mt-[4px] block text-[11px] text-[var(--paper-dim)]">{fr.placing.hint}</span>
    </div>
  );
}

/** Clear of the cursor's own drawing, which is twenty-nine pixels wide (`TROWEL_CURSOR`). */
const PLACING_CARD_GAP = 22;

/**
 * The first-time hint. It asks nothing and does not close by hand: its work was done the
 * moment it was read, and the controls card takes over afterwards.
 */
function GestureHint({ mapping }: { mapping: MouseMapping }) {
  const hint = fr.mapUi.gestureHint(mapping);
  return (
    <div className="hud pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 border border-[var(--ink-quiet)] bg-[var(--desk)] px-[14px] py-[7px] font-(family-name:--font-body) text-[12px] whitespace-nowrap text-[var(--paper)]">
      {hint.orient}
      <span className="text-[var(--paper-dim)]">{hint.separator}</span>
      {hint.pan}
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
  onLand: boolean,
): CompassTarget | null {
  if (point === null) return null;
  return {
    kind: 'point',
    lon: point[0],
    lat: point[1],
    regionId: region?.id ?? null,
    country,
    name: region?.name ?? (country === null ? fr.compass.openWater : countryLabel(country)),
    coastal,
    onLand,
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
  landAt: (lonLat: LonLat) => boolean,
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
      onLand: label.anchor.kind === 'ground' && landAt(label.anchor.lonLat),
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
      onLand: label.anchor.kind === 'ground' && landAt(label.anchor.lonLat),
      coastal: label.anchor.kind === 'ground' && coastAt(label.anchor.lonLat),
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
      onLand: label.anchor.kind === 'ground' && landAt(label.anchor.lonLat),
      /** Son adresse : on fonde où l'on se tient, donc c'est le point que la branche plantera. */
      station: label.station,
      regionId: region?.id ?? null,
    };
  }
  return country === null ? null : { kind: 'country', country };
}

function lineText(label: MapLabel, role: 'nature'): string | null {
  const line = label.lines.find((candidate) => candidate.role === role);
  return line === undefined || line.role === 'countdown' ? null : line.text;
}
