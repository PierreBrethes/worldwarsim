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
  | 'SEASON_CONCLUDED'
  | 'UNKNOWN_GAME_CODE'
  | 'NO_FREE_GAME_CODE'
  | 'LOBBY_FULL'
  | 'NO_FREE_NATION'
  | 'NOT_AT_WAR'
  | 'UNKNOWN_NATION'
  | 'NATION_TAKEN'
  | 'NATION_REQUIRED'
  | 'CREATOR_ONLY'
  | 'NOT_ENOUGH_PLAYERS'
  | 'PLAYERS_NOT_READY'
  | 'INVALID_REST_WINDOW'
  | 'REST_WINDOW_FROZEN'
  | 'MISSING_RESOURCE'
  | 'INSUFFICIENT_RESOURCE'
  | 'UNKNOWN_CONSTRUCTION'
  | 'CONSTRUCTION_ALREADY_STARTED'
  | 'CAPPED_BY_HQ'
  | 'UNKNOWN_REGION'
  | 'UNKNOWN_CAPITAL_REGION'
  | 'DEPOSIT_REQUIRED'
  | 'NOT_COASTAL'
  | 'REGION_TAKEN'
  | 'BUILDING_CAP_REACHED'
  | 'BUILDING_LOCKED'
  | 'ROLE_LOCKED'
  | 'MAX_LEVEL_REACHED'
  | 'HQ_ALREADY_BUILT'
  | 'UNKNOWN_BUILDING'
  | 'WRONG_PROJECTION_BUILDING'
  | 'TROOP_CAP_REACHED'
  | 'SINGLE_TIER_ROLE'
  | 'TIER_2_LOCKED'
  | 'QUEUE_FULL'
  | 'UNKNOWN_BATCH'
  | 'BATCH_ALREADY_STARTED'
  | 'CHAIN_NOT_COMMANDED'
  | 'CHAIN_NOT_STANDING'
  | 'EMPTY_ORDER'
  | 'ORDER_ABOVE_RESERVE'
  | 'ORDER_RUNNING'
  | 'NO_ORDER'
  | 'OUT_OF_OUTPOST_REACH'
  | 'MOVEMENT_IN_FLIGHT'
  | 'NO_LAND_ROUTE'
  | 'UNKNOWN_TROOP'
  | 'TROOP_NOT_AT_ORIGIN'
  | 'INFANTRY_ONLY'
  | 'NO_PORT_AT_DEPARTURE'
  | 'NO_AIRFIELD_AT_DEPARTURE'
  | 'NOT_ENOUGH_LIFT'
  | 'UNKNOWN_OUTPOST'
  | 'SPECIALIZATION_SEALED'
  | 'FRIENDLY_TARGET'
  | 'EMPTY_MOVEMENT'
  | 'OUTPOST_TARGET_ONLY'
  | 'POINT_TARGET_ONLY'
  | 'NOT_ORDERABLE'
  | 'EMPTY_MESSAGE'
  | 'MESSAGE_TOO_LONG'
  | 'TELEGRAPH_TOO_FAST';

export type ErrorDetail = { readonly code: ErrorCode; readonly [key: string]: unknown };

export function fail(code: ErrorCode, details?: Record<string, unknown>): never {
  throw new ConvexError({ code, ...details });
}
