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
 * A window tucked away on a large screen must not become unreachable on a small one: the
 * geometry read back is clamped to the current frame, measured in layout pixels since that
 * is the unit the window is written in.
 */
export function readWindowGeometry(name: string): WindowGeometry {
  const geometry = readLayout()[name];
  if (!geometry) return FRESH_GEOMETRY;
  const scale = readHudScale() / 100;
  const viewWidth = window.innerWidth / scale;
  const viewHeight = window.innerHeight / scale;
  return {
    offset: {
      x: clamp(geometry.offset.x, -viewWidth / 2, viewWidth / 2),
      y: clamp(geometry.offset.y, -viewHeight / 2, viewHeight / 2),
    },
    size: geometry.size && {
      width: Math.min(geometry.size.width, viewWidth),
      height: Math.min(geometry.size.height, viewHeight),
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
