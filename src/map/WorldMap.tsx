// Le moteur de carte est une classe impérative reçue en ref, à qui on assigne des
// callbacks (`.onSelect`, `.onRegionHover`, …) — React Compiler lit ça comme une
// mutation interdite. Exclusion volontaire : le moteur n'importe pas React (CLAUDE.md).
'use no memo';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import { loadRegions, type RegionIdentity, type World } from '@/domain/world';
import type { MapLabel } from '@/domain/labels';
import type { IndicatorToggles } from '@/domain/indicators';
import {
  countryName,
  type CompassAction,
  type CompassTarget,
  type Compass,
} from '@/domain/compass-rose';
import type { ArcView } from '@/domain/player-view';
import { markGestureHintSeen, readHudScale, gestureHintSeen } from '@/data/settings';
import { ControlsCard } from './ControlsCard';
import { RouteScale } from './RouteScale';
import { MapLabels } from './MapLabels';
import { EdgeIndicators } from './EdgeIndicators';
import { CompassRose } from './CompassRose';
import { MapEngine, type BuiltRegions } from './engine';

type Props = {
  world: World;
  arcs: ReadonlyArray<ArcView>;
  labels: ReadonlyArray<MapLabel>;
  inkByCountry: ReadonlyMap<string, string>;
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
   * What the camera is asked to fly to, by label id. The nonce is what makes a second request
   * on the same target land: asking twice for the same building is an ordinary gesture, and an
   * identity-compared prop would swallow the second one.
   */
  focus?: { readonly ids: ReadonlyArray<string>; readonly nonce: number } | null;
};

export function WorldMap({
  world,
  arcs,
  labels,
  inkByCountry,
  built,
  selectedCountry,
  playerNation,
  indicators,
  accentedMovement,
  onSelect,
  onOpenBuilding,
  onRegionHover,
  onArcHover,
  onLabelHover,
  compassOf,
  onCompassAction,
  building = false,
  aiming = false,
  focus = null,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<MapEngine | null>(null);
  const [rose, setRose] = useState<OpenRose | null>(null);
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

    // Zoom decor only: the board does not wait for these 500 KB, and their failure is mute.
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
        if (point === null) {
          setRose(null);
          return;
        }
        openRose(
          {
            kind: 'point',
            lon: point[0],
            lat: point[1],
            regionId: region?.id ?? null,
            country,
            name: region?.name ?? (country === null ? fr.compass.openWater : countryName(country)),
          },
          clientX,
          clientY,
        );
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

  const onLabelMenu = useCallback(
    (label: MapLabel, clientX: number, clientY: number) => {
      const country = engine.current?.countryAtPoint(clientX, clientY) ?? null;
      const target = targetOfLabel(label, country);
      if (target === null) return;
      openRose(target, clientX, clientY);
    },
    [openRose],
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
    if (focus === null) return;
    readyEngine?.journeyTo(focus.ids);
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
    engine.current?.showBuiltRegions(built);
  }, [built]);

  useEffect(() => {
    engine.current?.select(selectedCountry);
  }, [selectedCountry]);

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
        onMovementHover={onLabelHover ?? (() => {})}
        onSelect={onSelect}
        onOpenBuilding={onOpenBuilding ?? (() => {})}
        onContextMenu={onLabelMenu}
      />
      <EdgeIndicators labels={labels} engine={readyEngine} toggles={indicators} />
      {designatedArc && (
        <div className="absolute top-4 left-4 z-10">
          <RouteScale arc={designatedArc} />
        </div>
      )}
      {gestureHint && <GestureHint />}
      <ControlsCard />
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
    <div className="hud pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 border border-[var(--ink-quiet)] bg-[var(--desk)] px-[14px] py-[7px] font-[var(--font-body)] text-[12px] whitespace-nowrap text-[var(--paper)]">
      {fr.mapUi.gestureHint.leftClick}
      <span className="text-[var(--paper-dim)]">{fr.mapUi.gestureHint.separator}</span>
      {fr.mapUi.gestureHint.pan}
    </div>
  );
}

const clamp = (value: number, margin: number, extent: number): number =>
  extent < margin * 2 ? extent / 2 : Math.min(Math.max(value, margin), extent - margin);

/**
 * A marker label designates the entity it carries; any other — construction, movement head —
 * falls back to the land aimed beneath, which is the only target the game can honor today.
 */
function targetOfLabel(label: MapLabel, country: string | null): CompassTarget | null {
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
    };
  }
  return country === null ? null : { kind: 'country', country };
}

function lineText(label: MapLabel, role: 'nature' | 'headcount' | 'figures'): string | null {
  const line = label.lines.find((candidate) => candidate.role === role);
  return line === undefined || line.role === 'countdown' ? null : line.text;
}
