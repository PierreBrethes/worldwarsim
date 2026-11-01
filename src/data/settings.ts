import { CATEGORIES, DEFAULT_TOGGLES, type IndicatorToggles } from '@/domain/indicators';
import { DEFAULT_DAY_CYCLE, isDayCycle, type DayCycle } from '@/domain/daylight';
import { DEFAULT_CONTOUR_WEIGHT, isContourWeight, type ContourWeight } from '@/domain/contours';
import {
  DEFAULT_MAP_MOTION_SETTING,
  isMapMotionSetting,
  type MapMotionSetting,
} from '@/domain/map-motion';
import { parsePieceScale } from '@/domain/piece-scale';
import { CLASSIC_MAPPING, isMouseMapping, type MouseMapping } from '@/domain/mouse-mapping';

const HUD_SCALE_KEY = 'wws-hud-scale';
// Must agree with `--hud-scale` in `tokens.css`: the token is the first paint's scale, this
// one is what gets reapplied once the setting is read back.
export const DEFAULT_HUD_SCALE = 120;
export const MIN_HUD_SCALE = 100;
export const MAX_HUD_SCALE = 200;

export function readHudScale(): number {
  const raw = localStorage.getItem(HUD_SCALE_KEY);
  if (raw === null) return DEFAULT_HUD_SCALE;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_HUD_SCALE;
  return Math.max(MIN_HUD_SCALE, Math.min(MAX_HUD_SCALE, value));
}

export function applyHudScale(percent: number): void {
  document.documentElement.style.setProperty('--hud-scale', String(percent / 100));
}

export function keepHudScale(percent: number): void {
  localStorage.setItem(HUD_SCALE_KEY, String(percent));
  applyHudScale(percent);
}

const NEXT_ACTIONS_KEY = 'wws-next-actions';

/** A Blitz opens with the card folded to its square; its own key keeps a Mondiale choice apart. */
const nextActionsKey = (blitz: boolean) => (blitz ? `${NEXT_ACTIONS_KEY}-blitz` : NEXT_ACTIONS_KEY);

export const readNextActionsFolded = (blitz: boolean): boolean => {
  const kept = localStorage.getItem(nextActionsKey(blitz));
  return kept === null ? blitz : kept === 'folded';
};

export const keepNextActionsFolded = (folded: boolean, blitz: boolean): void => {
  localStorage.setItem(nextActionsKey(blitz), folded ? 'folded' : 'open');
};

const UNDERWAY_KEY = 'wws-underway';

/** La colonne « En cours » repliée est un choix de la main, comme le bandeau du bureau : il
 *  survit au rechargement, et ce qui vient de partir s'y montre déplié malgré lui. */
export const readUnderwayFolded = (): boolean => localStorage.getItem(UNDERWAY_KEY) === 'folded';

export const keepUnderwayFolded = (folded: boolean): void => {
  localStorage.setItem(UNDERWAY_KEY, folded ? 'folded' : 'open');
};

const GESTURE_HINT_KEY = 'wws-gesture-hint';

/**
 * The map gesture hint only shows on the very first drag, once for the browser's lifetime:
 * it is a lesson, not a notification. It survives seasons — a player who understood does not
 * rediscover it every new game.
 */
export const gestureHintSeen = (): boolean => localStorage.getItem(GESTURE_HINT_KEY) === 'seen';

export const markGestureHintSeen = (): void => localStorage.setItem(GESTURE_HINT_KEY, 'seen');

const BRIEFING_KEY = 'wws-briefing';

/**
 * The command sheet opens by itself on a player's very first Blitz board, then never again on its
 * own. The flag is the browser's, not the season's: a veteran opening his second season is not
 * a new player, and re-teaching him the mouse would read as a fault. `Réglages` reopens it.
 */
export const briefingSeen = (): boolean => localStorage.getItem(BRIEFING_KEY) === 'seen';

export const markBriefingSeen = (): void => localStorage.setItem(BRIEFING_KEY, 'seen');

const TELEGRAPH_SOUND_KEY = 'wws-telegraph-sound';

/**
 * **Le son est un réglage à part, et `prefers-reduced-motion` ne le couvre pas** : cette requête
 * média parle d'animation, pas d'audio, et s'en servir pour taire le télégraphe muterait un
 * joueur qui n'a jamais demandé le silence. Allumé par défaut — le tic-tac est la moitié de ce
 * que le canal apporte — et coupé d'un clic dans les Réglages, pour ce navigateur.
 */
export const telegraphSoundOn = (): boolean =>
  localStorage.getItem(TELEGRAPH_SOUND_KEY) !== 'muted';

export const keepTelegraphSound = (on: boolean): void => {
  localStorage.setItem(TELEGRAPH_SOUND_KEY, on ? 'audible' : 'muted');
};

const TABLE_SOUND_KEY = 'wws-table-sound';

/** **The table's sounds** (POC « Manipuler les pions »), apart from the telegraph's: one may want
 *  either without the other. On by default, for this browser. */
export const tableSoundOn = (): boolean => localStorage.getItem(TABLE_SOUND_KEY) !== 'muted';

export const keepTableSound = (on: boolean): void => {
  localStorage.setItem(TABLE_SOUND_KEY, on ? 'audible' : 'muted');
};

const MOUSE_MAPPING_KEY = 'wws-mouse-mapping';

/**
 * **Quel bouton fait quoi est une préférence, et elle appartient au navigateur du joueur** — pas
 * à la partie, pas au serveur : c'est sa main et sa souris, et il en change d'un appareil à
 * l'autre. Une valeur qui n'est pas une permutation ne se rattrape pas, elle retombe sur le
 * défaut : un mappage à moitié valide serait un plateau sur lequel un rôle manque.
 */
export function readMouseMapping(): MouseMapping {
  const kept = readObject(MOUSE_MAPPING_KEY);
  return isMouseMapping(kept) ? kept : CLASSIC_MAPPING;
}

export function keepMouseMapping(mapping: MouseMapping): void {
  localStorage.setItem(MOUSE_MAPPING_KEY, JSON.stringify(mapping));
}

const MAP_MOTION_KEY = 'wws-map-motion';

export function readMapMotion(): MapMotionSetting {
  const kept = localStorage.getItem(MAP_MOTION_KEY);
  return isMapMotionSetting(kept) ? kept : DEFAULT_MAP_MOTION_SETTING;
}

export const keepMapMotion = (setting: MapMotionSetting): void => {
  localStorage.setItem(MAP_MOTION_KEY, setting);
};

const PIECE_SCALE_KEY = 'wws-piece-scale';

export function readPieceScale(): number {
  try {
    return parsePieceScale(JSON.parse(localStorage.getItem(PIECE_SCALE_KEY) ?? 'null'));
  } catch {
    return parsePieceScale(null);
  }
}

export function keepPieceScale(scale: number): void {
  try {
    localStorage.setItem(PIECE_SCALE_KEY, JSON.stringify(scale));
  } catch {
    // The setting still applies for this session.
  }
}

const INDICATORS_KEY = 'wws-edge-indicators';

/**
 * The screen-edge toggles are read back category by category rather than as a block: a
 * category added later must take its default, not resurrect a stale object.
 */
export function readIndicatorToggles(): IndicatorToggles {
  const kept = readObject(INDICATORS_KEY);
  return Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      typeof kept[category] === 'boolean' && (category !== 'deposits' || kept[DEPOSITS_EVERYWHERE])
        ? kept[category]
        : DEFAULT_TOGGLES[category],
    ]),
  ) as IndicatorToggles;
}

/**
 * Until 13/10 the deposits bascule meant "close up" when off; it now means hidden. Only what is
 * written since carries this marker, and an older `deposits: false` takes the default (on).
 */
const DEPOSITS_EVERYWHERE = 'depositsEverywhere';

export function keepIndicatorToggles(toggles: IndicatorToggles): void {
  localStorage.setItem(INDICATORS_KEY, JSON.stringify({ ...toggles, [DEPOSITS_EVERYWHERE]: true }));
}

const WINDOW_LAYOUT_KEY = 'wws-window-layout';

export type WindowGeometry = {
  offset: { x: number; y: number };
  size: { width: number; height: number } | null;
};

const FRESH_GEOMETRY: WindowGeometry = { offset: { x: 0, y: 0 }, size: null };

/**
 * A window resized on a large screen must not overflow a small one; the *place* is left exactly
 * as the player left it, because a guess made here without the box's own measurements is a guess
 * that teleports a surface legitimately pushed far. Keeping it on screen belongs to the drag
 * itself, which measures the box (`frameFor` in `dragging.ts`).
 */
export function readWindowGeometry(name: string): WindowGeometry {
  const geometry = readLayout()[name];
  if (!geometry) return FRESH_GEOMETRY;
  const scale = readHudScale() / 100;
  return {
    offset: geometry.offset,
    size: geometry.size && {
      width: Math.min(geometry.size.width, window.innerWidth / scale),
      height: Math.min(geometry.size.height, window.innerHeight / scale),
    },
  };
}

export function keepWindowGeometry(name: string, geometry: WindowGeometry): void {
  localStorage.setItem(WINDOW_LAYOUT_KEY, JSON.stringify({ ...readLayout(), [name]: geometry }));
}

const readLayout = (): Record<string, WindowGeometry | undefined> =>
  readObject(WINDOW_LAYOUT_KEY) as Record<string, WindowGeometry | undefined>;

function readObject(key: string): Record<string, unknown> {
  const raw = localStorage.getItem(key);
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

const DAY_CYCLE_KEY = 'wws-day-cycle';

export function readDayCycle(): DayCycle {
  try {
    const kept = localStorage.getItem(DAY_CYCLE_KEY);
    return isDayCycle(kept) ? kept : DEFAULT_DAY_CYCLE;
  } catch {
    return DEFAULT_DAY_CYCLE;
  }
}

export const keepDayCycle = (cycle: DayCycle): void => {
  try {
    localStorage.setItem(DAY_CYCLE_KEY, cycle);
  } catch {
    // Private mode: the choice lasts the session only.
  }
};

const CONTOUR_WEIGHT_KEY = 'wws-contour-weight';

export function readContourWeight(): ContourWeight {
  try {
    const kept = localStorage.getItem(CONTOUR_WEIGHT_KEY);
    return isContourWeight(kept) ? kept : DEFAULT_CONTOUR_WEIGHT;
  } catch {
    return DEFAULT_CONTOUR_WEIGHT;
  }
}

export const keepContourWeight = (weight: ContourWeight): void => {
  try {
    localStorage.setItem(CONTOUR_WEIGHT_KEY, weight);
  } catch {
    // Private mode: the choice lasts the session only.
  }
};

const PATCHNOTES_READ_KEY = 'wws-patchnotes-read';

/** Les bulletins des mises à jour déjà ouverts, par date : le « non lu » est une habitude du
 *  navigateur, comme le reste des réglages. */
export function readPatchnotesRead(): ReadonlySet<string> {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(PATCHNOTES_READ_KEY) ?? '[]');
    return new Set(Array.isArray(kept) ? kept.filter((date) => typeof date === 'string') : []);
  } catch {
    return new Set();
  }
}

export const keepPatchnotesRead = (dates: ReadonlySet<string>): void => {
  try {
    localStorage.setItem(PATCHNOTES_READ_KEY, JSON.stringify([...dates]));
  } catch {
    // Un magasin plein ou fermé : le lu ne survit pas au rechargement, la liseuse marche quand même.
  }
};
