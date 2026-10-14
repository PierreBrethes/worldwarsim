import { theatreById } from './theatres';

export const SEASON_MODES = ['blitz', 'mondiale'] as const;
export type SeasonMode = (typeof SEASON_MODES)[number];

export const MODE_RULES = {
  blitz: { clockHours: 2, needsTheatre: true },
  mondiale: { clockHours: 168, minPlayers: 2, maxPlayers: 8, needsTheatre: false },
} as const satisfies Record<SeasonMode, object>;

/** Seasons written before the modes existed carry none, and are Mondiales. */
export const modeOf = (stored: SeasonMode | undefined): SeasonMode => stored ?? 'mondiale';

/** **A Blitz seats what its theatre holds** (T1); a Mondiale, its own table. */
export const seatRangeOf = (
  mode: SeasonMode,
  theatre: string | null | undefined,
): { readonly min: number; readonly max: number } => {
  if (mode === 'mondiale') {
    return { min: MODE_RULES.mondiale.minPlayers, max: MODE_RULES.mondiale.maxPlayers };
  }
  return theatreById(theatre ?? '')?.players ?? { min: 2, max: 4 };
};

export type CreationRefusal = 'THEATRE_REQUIRED' | 'UNKNOWN_THEATRE' | 'THEATRE_ONLY_IN_BLITZ';

export function creationRefusalOf(
  mode: SeasonMode,
  theatre: string | undefined,
): CreationRefusal | null {
  if (!MODE_RULES[mode].needsTheatre) return theatre === undefined ? null : 'THEATRE_ONLY_IN_BLITZ';
  if (theatre === undefined) return 'THEATRE_REQUIRED';
  return theatreById(theatre) === null ? 'UNKNOWN_THEATRE' : null;
}
