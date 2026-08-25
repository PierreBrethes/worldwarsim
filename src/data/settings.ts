import { CATEGORIES, DEFAULT_TOGGLES, type IndicatorToggles } from '@/domain/indicators';

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

const TROOPS_COLLAPSED_KEY = 'wws-troops-collapsed';

/** A folded widget stays folded: it is a desk-clutter choice, not a screen state. */
export const readTroopsCollapsed = (): boolean =>
  localStorage.getItem(TROOPS_COLLAPSED_KEY) === 'collapsed';

export const keepTroopsCollapsed = (collapsed: boolean): void => {
  localStorage.setItem(TROOPS_COLLAPSED_KEY, collapsed ? 'collapsed' : 'expanded');
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
 * The command sheet opens by itself on a player's very first board, then never again on its
 * own. The flag is the browser's, not the season's: a veteran opening his second season is not
 * a new player, and re-teaching him the mouse would read as a fault. `Réglages` reopens it.
 */
export const briefingSeen = (): boolean => localStorage.getItem(BRIEFING_KEY) === 'seen';

export const markBriefingSeen = (): void => localStorage.setItem(BRIEFING_KEY, 'seen');

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
      typeof kept[category] === 'boolean' ? kept[category] : DEFAULT_TOGGLES[category],
    ]),
  ) as IndicatorToggles;
}

export function keepIndicatorToggles(toggles: IndicatorToggles): void {
  localStorage.setItem(INDICATORS_KEY, JSON.stringify(toggles));
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
