export type MapMotionSetting = 'auto' | 'full' | 'reduced' | 'off';
export type MapMotion = 'full' | 'reduced' | 'off';
export type Fx = 'sea' | 'wind' | 'ink' | 'smoke';

export const MAP_MOTION_SETTINGS: ReadonlyArray<MapMotionSetting> = [
  'auto',
  'full',
  'reduced',
  'off',
];
export const DEFAULT_MAP_MOTION_SETTING: MapMotionSetting = 'auto';

export const isMapMotionSetting = (value: unknown): value is MapMotionSetting =>
  MAP_MOTION_SETTINGS.includes(value as MapMotionSetting);

export const resolveMapMotion = (
  setting: MapMotionSetting,
  prefersReducedMotion: boolean,
): MapMotion => (setting === 'auto' ? (prefersReducedMotion ? 'reduced' : 'full') : setting);

const ALL_FX: ReadonlyArray<Fx> = ['sea', 'wind', 'ink', 'smoke'];

// ponytail: prototype switch for comparing effects one by one; removed before the merge.
export function parseFx(search: string): ReadonlySet<Fx> {
  const raw = new URLSearchParams(search).get('fx');
  if (raw === null) return new Set(ALL_FX);
  return new Set(ALL_FX.filter((fx) => raw.split(',').includes(fx)));
}
