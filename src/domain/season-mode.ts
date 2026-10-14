export const SEASON_MODES = ['blitz', 'mondiale'] as const;
export type SeasonMode = (typeof SEASON_MODES)[number];

/** Seasons written before the modes existed carry none, and are Mondiales. */
export const modeOf = (stored: SeasonMode | undefined): SeasonMode => stored ?? 'mondiale';
