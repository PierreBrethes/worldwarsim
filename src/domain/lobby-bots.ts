import type { SeasonStatus } from './off-season';
import type { SeasonMode } from './season-mode';

/**
 * **Ce qui empêche le fondateur d'asseoir un bot à sa table** (#704, ADR 0042 révisée le 26/11),
 * dans l'ordre où le serveur le dit : le salon le propose et `bots.add` le refuse par cette même
 * fonction (ADR 0015). La Blitz d'abord, qui n'a pas de bot ; puis la main, la saison, la place.
 */
export type BotAdditionRefusal =
  | 'BOTS_MONDIALE_ONLY'
  | 'BOTS_FOUNDER_ONLY'
  | 'SEASON_CONCLUDED'
  | 'SEASON_ALREADY_LAUNCHED'
  | 'LOBBY_FULL';

export function botAdditionRefusalOf(input: {
  readonly founder: boolean;
  readonly status: SeasonStatus;
  readonly seats: number;
  readonly maximum: number;
  readonly mode: SeasonMode;
}): BotAdditionRefusal | null {
  if (input.mode !== 'mondiale') return 'BOTS_MONDIALE_ONLY';
  if (!input.founder) return 'BOTS_FOUNDER_ONLY';
  if (input.status === 'concluded') return 'SEASON_CONCLUDED';
  if (input.status !== 'lobby') return 'SEASON_ALREADY_LAUNCHED';
  if (input.seats >= input.maximum) return 'LOBBY_FULL';
  return null;
}

export type BotRemovalRefusal =
  'NOT_A_BOT' | 'BOTS_FOUNDER_ONLY' | 'SEASON_CONCLUDED' | 'SEASON_ALREADY_LAUNCHED';

/** Un bot se retire avant le lancement, par le fondateur seul ; un joueur ne se retire jamais ainsi. */
export function botRemovalRefusalOf(input: {
  readonly founder: boolean;
  readonly status: SeasonStatus;
  readonly bot: boolean;
}): BotRemovalRefusal | null {
  if (!input.bot) return 'NOT_A_BOT';
  if (!input.founder) return 'BOTS_FOUNDER_ONLY';
  if (input.status === 'concluded') return 'SEASON_CONCLUDED';
  if (input.status !== 'lobby') return 'SEASON_ALREADY_LAUNCHED';
  return null;
}

/** **Le pseudo d'un bot neuf** : le premier `BotN` qu'aucun compte ne tient, joueur ou bot. */
export function botNicknameOf(taken: (nickname: string) => boolean): string {
  for (let n = 1; ; n += 1) if (!taken(`Bot${n}`)) return `Bot${n}`;
}
