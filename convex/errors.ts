import { ConvexError } from 'convex/values';

/**
 * Every application error goes through here, never through `throw new Error(...)`: Convex
 * redacts the message of ordinary errors in production, only the payload of a `ConvexError`
 * reaches the client. The server speaks in codes only; language is a display concern and
 * lives on the front side, in the translation table.
 */
export type ErrorCode =
  | 'UNKNOWN_TOKEN'
  | 'SEASON_GONE'
  | 'SEASON_NOT_LAUNCHED'
  | 'SEASON_ALREADY_LAUNCHED'
  | 'UNKNOWN_GAME_CODE'
  | 'NO_FREE_GAME_CODE'
  | 'LOBBY_FULL'
  | 'UNKNOWN_NATION'
  | 'NATION_TAKEN'
  | 'NATION_AND_DOCTRINE_REQUIRED'
  | 'CREATOR_ONLY'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYERS_NOT_READY'
  | 'INVALID_REST_WINDOW'
  | 'REST_WINDOW_FROZEN'
  | 'MISSING_RESOURCE'
  | 'INSUFFICIENT_RESOURCE'
  | 'CONSTRUCTION_IN_PROGRESS'
  | 'CAPPED_BY_HQ'
  | 'UNKNOWN_REGION'
  | 'UNKNOWN_CAPITAL_REGION'
  | 'REGION_NOT_HOME'
  | 'DEPOSIT_REQUIRED'
  | 'NOT_COASTAL'
  | 'REGION_TAKEN'
  | 'BUILDING_CAP_REACHED'
  | 'MAX_LEVEL_REACHED'
  | 'HQ_ALREADY_BUILT'
  | 'BATCH_TOO_SMALL'
  | 'BATCH_TOO_LARGE'
  | 'SINGLE_TIER_ROLE'
  | 'TIER_2_LOCKED'
  | 'QUEUE_FULL'
  | 'UNKNOWN_BATCH'
  | 'BATCH_ALREADY_STARTED';

export type ErrorDetail = { readonly code: ErrorCode; readonly [key: string]: unknown };

export function fail(code: ErrorCode, details?: Record<string, unknown>): never {
  throw new ConvexError({ code, ...details });
}
