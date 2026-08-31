// Le moteur de carte est une classe impérative reçue en ref, à qui on assigne des
// callbacks (`.onSelect`, `.onRegionHover`, …) — React Compiler lit ça comme une
// mutation interdite. Exclusion volontaire : le moteur n'importe pas React (CLAUDE.md).
'use no memo';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { MapEngine, type BuiltRegions, type HeldClaim } from './engine';

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
  /** L'étiquette désignée par le plateau : une troupe posée, cliquée seule. */
  selectedLabel?: string | null;
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
  selectedLabel = null,
  reach = null,
  onCountryHover,
  onRegionHover,
  onArcHover,
  onLabelHover,
  compassOf,
  onCompassAction,
  building = false,
  aiming = false,
  designatedRegions = NO_REGIONS,
  onDesignateRegion,
  focus = null,
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

  useEffect(() => {
    if (!readyEngine) return;
    readyEngine.onRightClick = ({ country, region, point, clientX, clientY }) => {
      /**
       * **Aiming, the board answers everywhere.** The place under the pointer is a lon/lat at
       * every scale and over water too, so the silence the player used to get when zoomed out —
       * or off a coast — is structurally gone (ADR 0019 §1). The region travels alongside it
       * because a foundation still needs one; the fan sorts out which type takes which.
       */
      if (aiming) {
        const aimed = pointTarget(country, region, point);
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
  }, [readyEngine, openRose, aiming]);

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
      );
      if (target === null) return;
      openRose(target, clientX, clientY);
    },
    [onOpenStack, openRose],
  );

  const onLabelMenu = useCallback(
    (label: MapLabel, clientX: number, clientY: number) => {
      const map = engine.current;
      const country = map?.countryAtPoint(clientX, clientY) ?? null;
      /** La région dessinée sous le clic : c'est elle qui dit si le sol est déjà le mien, la
       *  seule chose qui sépare une fondation possible d'un `FRIENDLY_TARGET`. */
      const region = map?.regionAtPoint(clientX, clientY) ?? null;
      const target = targetOfLabel(label, country, region);
      /**
       * **Aiming, a label hides nothing.** An outpost is a target one marches at and keeps its
       * own fan; every other pictogram — a column in flight, a construction — hands the aim back
       * to the ground it covers. Without this, a right click landing on a mark would be the last
       * place on the board where aiming answers nothing.
       *
       * **Une pile à soi n'est pas une destination non plus, et elle garde donc sa rose armée ou
       * non** (`compassOf`, décision du 30/08). Rendre le sol sous elle faisait exactement le
       * menu mixte que la décision interdit : le clic tombait sur une troupe et répondait un
       * terrain. Deux cibles, séparées par ce qui est sous le curseur.
       */
      const aimed =
        aiming && target?.kind !== 'outpost' && target?.kind !== 'force' && map !== null
          ? pointTarget(country, region, map.pointAt(clientX, clientY))
          : target;
      if (aimed === null) return;
      openRose(aimed, clientX, clientY);
    },
    [openRose, aiming],
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
        onMovementHover={onLabelHover ?? (() => {})}
        onReachHover={setHoveredReach}
        onSelect={onSelect}
        onOpenBuilding={onOpenBuilding ?? (() => {})}
        onOpenStack={onLabelOpen}
        onContextMenu={onLabelMenu}
      />
      <EdgeIndicators labels={labels} engine={readyEngine} toggles={indicators} />
      {designatedArc && (
        <div className="absolute top-4 left-4 z-10">
          <RouteScale arc={designatedArc} />
        </div>
      )}
      {gestureHint && <GestureHint />}
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
): CompassTarget | null {
  if (point === null) return null;
  return {
    kind: 'point',
    lon: point[0],
    lat: point[1],
    regionId: region?.id ?? null,
    country,
    name: region?.name ?? (country === null ? fr.compass.openWater : countryLabel(country)),
  };
}

/**
 * A marker label designates the entity it carries; any other — construction, movement head —
 * falls back to the land aimed beneath, which is the only target the game can honor today.
 */
function targetOfLabel(
  label: MapLabel,
  country: string | null,
  region: RegionIdentity | null,
): CompassTarget | null {
  if (label.type === 'outpost' && label.hostCountry !== null) {
    return {
      kind: 'outpost',
      id: label.id,
      hostCountry: label.hostCountry,
      name: lineText(label, 'nature') ?? fr.compass.fallbackOutpost,
    };
  }
  if (label.type === 'stack') {
    return {
      kind: 'force',
      id: label.id,
      country,
      name: lineText(label, 'figures') ?? fr.compass.fallbackForce,
      headcount: Number(lineText(label, 'headcount') ?? 0),
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
