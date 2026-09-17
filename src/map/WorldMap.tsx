// Le moteur de carte est une classe impérative reçue en ref, à qui on assigne des
// callbacks (`.onSelect`, `.onRegionHover`, …) — React Compiler lit ça comme une
// mutation interdite. Exclusion volontaire : le moteur n'importe pas React (CLAUDE.md).
'use no memo';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { countryLabel, fr } from '@/i18n/fr';
import { loadRegions, type RegionIdentity, type World } from '@/domain/world';
import type { LonLat } from '@/domain/geo';
import type { MapLabel, Reach } from '@/domain/labels';
import type { IndicatorToggles } from '@/domain/indicators';
import { type CompassAction, type CompassTarget, type Compass } from '@/domain/compass-rose';
import type { ArcView, TroopStation } from '@/domain/player-view';
import { markGestureHintSeen, readHudScale, gestureHintSeen } from '@/data/settings';
import { RouteScale } from './RouteScale';
import { MapLabels } from './MapLabels';
import { EdgeIndicators } from './EdgeIndicators';
import { CompassRose } from './CompassRose';
import { MapEngine, type BuiltRegions, type HeldClaim, type SearchArea } from './engine';

type Props = {
  world: World;
  arcs: ReadonlyArray<ArcView>;
  labels: ReadonlyArray<MapLabel>;
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
  selectedLootLabel?: string | null;
  /**
   * **Le cercle que le plateau tient ouvert**, par-dessous celui du survol : le rayon de
   * détection d'une troupe désignée. Le survol l'emporte tant qu'il dure et le rend ensuite —
   * une seule onde à l'écran, jamais deux qui se disputent l'anneau.
   */
  reach?: Reach | null;
  onCountryHover?: (adm0: string | null) => void;
  onRegionHover?: (region: RegionIdentity | null) => void;
  onArcHover?: (id: string | null) => void;
  onLabelHover?: (id: string | null) => void;
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
    readonly nonce: number;
  } | null;
  /** The journal's public uncertainty; no rumor identity or private fact crosses this boundary. */
  searchArea?: SearchArea | null;
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

/** A stable empty list: a fresh `[]` default would rebuild the highlight on every render. */
const NO_REGIONS: ReadonlyArray<string> = [];

export function WorldMap({
  world,
  arcs,
  labels,
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
  selectedLootLabel = null,
  reach = null,
  onCountryHover,
  onRegionHover,
  onArcHover,
  onLabelHover,
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
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<MapEngine | null>(null);
  const [rose, setRose] = useState<OpenRose | null>(null);
  const [hoveredReach, setHoveredReach] = useState<Reach | null>(null);
  const [gestureHint, setGestureHint] = useState(false);
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
        if (!abandoned) instance.displayRegions(data);
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
      console.log('[banc] openRose', JSON.stringify(target), 'drawn=', JSON.stringify(drawn));
      if (drawn === null || rect === undefined) return;
      const margin = (ROSE_MARGIN * readHudScale()) / 100;
      setRose({
        compass: drawn,
        x: clamp(clientX - rect.left, margin, rect.width),
        y: clamp(clientY - rect.top, margin, rect.height),
        width: rect.width,
        height: rect.height,
      });
    },
    [compassOf],
  );

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
    readyEngine.onRightClick = ({ country, region, point, clientX, clientY }) => {
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
        console.log('[banc] aiming rc', JSON.stringify(aimed));
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
      readyEngine.onRightClick = () => {};
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
      if (onOpenStack?.(label.station, clientX, clientY) !== true) return;
      const map = engine.current;
      const target = targetOfLabel(
        label,
        map?.countryAtPoint(clientX, clientY) ?? null,
        map?.regionAtPoint(clientX, clientY) ?? null,
        coastAt,
        landAt,
      );
      if (target === null) return;
      openRose(target, clientX, clientY);
    },
    [onOpenStack, openRose, coastAt, landAt],
  );

  const onLabelMenu = useCallback(
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

  useEffect(() => {
    if (focus === null) return;
    readyEngine?.journeyTo(focus.ids, focus.places ?? []);
  }, [readyEngine, focus]);

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
        secondarySelected={selectedLootLabel}
        onMovementHover={onLabelHover ?? (() => {})}
        onReachHover={setHoveredReach}
        onSelect={onSelect}
        onOpenBuilding={onOpenBuilding ?? (() => {})}
        onOpenStack={onLabelOpen}
        onOpenLoot={onOpenLoot ?? (() => {})}
        onOpenCamp={onOpenCamp ?? (() => {})}
        onOpenObjective={onOpenObjective ?? (() => {})}
        onContextMenu={onLabelMenu}
        muted={placing !== null}
      />
      <EdgeIndicators labels={labels} engine={readyEngine} toggles={indicators} />
      {designatedArc && (
        <div className="absolute top-4 left-4 z-10">
          <RouteScale arc={designatedArc} />
        </div>
      )}
      {gestureHint && <GestureHint />}
      {placing && <PlacingCard placing={placing} container={container} />}
      {rose && (
        <CompassRose
          compass={rose.compass}
          x={rose.x}
          y={rose.y}
          width={rose.width}
          height={rose.height}
          onClose={closeRose}
          onAction={(action) => {
            closeRose();
            onCompassAction(action, { x: rose.x, y: rose.y });
          }}
        />
      )}
    </div>
  );
}

type OpenRose = { compass: Compass; x: number; y: number; width: number; height: number };

/**
 * The menu's footprint around its center. It opens on the clicked point, except flush with
 * an edge: a medallion falling off the board would be an action seen but untakeable. The
 * margin follows the HUD scale, which zooms the whole menu.
 */
const ROSE_MARGIN = 70;

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
function GestureHint() {
  return (
    <div className="hud pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 border border-[var(--ink-quiet)] bg-[var(--desk)] px-[14px] py-[7px] font-(family-name:--font-body) text-[12px] whitespace-nowrap text-[var(--paper)]">
      {fr.mapUi.gestureHint.leftClick}
      <span className="text-[var(--paper-dim)]">{fr.mapUi.gestureHint.separator}</span>
      {fr.mapUi.gestureHint.pan}
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
      name: fr.camps.marker,
    };
  }
  if (label.type === 'stack') {
    return {
      kind: 'force',
      id: label.id,
      country,
      name: lineText(label, 'figures') ?? fr.compass.fallbackForce,
      headcount: Number(lineText(label, 'headcount') ?? 0),
      onLand: label.anchor.kind === 'ground' && landAt(label.anchor.lonLat),
      /** Son adresse : on fonde où l'on se tient, donc c'est le point que la branche plantera. */
      station: label.station,
      regionId: region?.id ?? null,
    };
  }
  return country === null ? null : { kind: 'country', country };
}

function lineText(label: MapLabel, role: 'nature' | 'headcount' | 'figures'): string | null {
  const line = label.lines.find((candidate) => candidate.role === role);
  return line === undefined || line.role === 'countdown' ? null : line.text;
}
