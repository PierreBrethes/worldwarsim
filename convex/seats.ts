import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { fail } from './errors';
import { sessionOf } from './sessions';

/**
 * **L'unique porte du jeu** (ADR 0022) : un jeton de session, une saison, et la place que le
 * compte y tient. Le jeton de partie est mort avec le wipe du 10/09 — il valait identité,
 * place et saison à la fois, et c'est ce triple emploi qui interdisait à un joueur de retrouver
 * ses parties depuis un second appareil.
 *
 * Les trois refus disent trois choses différentes, et le client en fait trois écrans : la
 * session est inconnue (on se reconnecte), le compte n'a pas de place dans cette saison-là (on
 * rentre à l'accueil), la saison n'existe plus. Un seul code pour les trois aurait renvoyé à la
 * page de connexion quelqu'un qui n'avait qu'une saison détruite.
 */
export async function playerOf(ctx: QueryCtx, token: string, seasonId: Id<'seasons'>) {
  const account = await accountOf(ctx, token);
  if (!account) fail('UNKNOWN_SESSION');
  const player = await seatOf(ctx, account, seasonId);
  if (!player) fail('NO_SEAT');
  const season = await ctx.db.get(player.seasonId);
  if (!season) fail('SEASON_GONE');
  return { player, season };
}

/** Le compte derrière un jeton de session, `null` si personne ne répond — une session
 *  inconnue, ou orpheline d'un compte effacé, ce que le lecteur ne distingue pas. */
export async function accountOf(ctx: QueryCtx, token: string): Promise<Doc<'accounts'> | null> {
  const session = await sessionOf(ctx, token);
  return session === null ? null : await ctx.db.get(session.accountId);
}

/** **Au plus une place par compte et par saison** (ADR 0022) : l'index le dit, et `unique()`
 *  le fait échouer bruyamment si une seconde s'écrivait un jour. */
export const seatOf = (
  ctx: QueryCtx,
  account: Doc<'accounts'>,
  seasonId: Id<'seasons'>,
): Promise<Doc<'players'> | null> =>
  ctx.db
    .query('players')
    .withIndex('byAccountSeason', (q) => q.eq('accountId', account._id).eq('seasonId', seasonId))
    .unique();

/**
 * **What a season has to be for an order to be given on it, and who may give one.** A concluded
 * season answers with a code of its own rather than "not launched": it *was* launched, somebody
 * won it, and telling a player his season never started is the kind of message that sends him
 * looking for a bug.
 *
 * It stays readable — the board and the journal serve a concluded season (`view.ts`), because
 * the wipe is manual and one reads the game back before erasing it.
 *
 * **The player travels with the season because a surrender is the same refusal** (decision of
 * 31/08): whoever laid down his arms observes, he does not order. Every game mutation already
 * came through here — construction, industry, recruitment, foundation, movement, entry into war
 * — so the door is widened rather than a check being scattered over a dozen handlers, and the
 * next mutation gets it by construction. **The telegraph deliberately does not read it**
 * (`messages.ts` never asked for a playable season): an observer still talks.
 */
export function requirePlayable(player: Doc<'players'>, season: Doc<'seasons'>): void {
  if (season.status === 'concluded') fail('SEASON_CONCLUDED');
  requireStarted(season);
  if (player.defeated === true) fail('PLAYER_DEFEATED');
}

/**
 * **What a scheduled job has to find to be allowed to write.** A conclusion does not empty the
 * scheduler, and neither does a `destroy` that leaves a job behind: without this, engagements
 * resolve, batches deliver and sites finish on a season nobody plays any more — a concluded
 * skirmish still fighting would falsify every measurement taken after a test.
 *
 * **It returns, it never fails.** Convex does not retry a mutation that throws, so a refusal
 * raised here would sit in the dashboard as an error that is not one. Nothing is cleaned up
 * either: the movement, the batch and the site stay exactly as they are, nobody will read
 * them, and `destroy` purges the season whole.
 *
 * It takes a **player**, not a season, because that is the handle every job actually holds — a
 * movement, a batch and a construction all hang from a player, none of them from a season.
 */
export async function seasonStillPlays(ctx: QueryCtx, playerId: Id<'players'>): Promise<boolean> {
  return (await playingSeason(ctx, playerId)) !== null;
}

/** The same reading, handing back the season rather than a yes: a job that writes a row needs
 *  the season to stamp it with, and reading it twice is two chances to read two different ones. */
export async function playingSeason(
  ctx: QueryCtx,
  playerId: Id<'players'>,
): Promise<Doc<'seasons'> | null> {
  const player = await ctx.db.get(playerId);
  if (!player) return null;
  const season = await ctx.db.get(player.seasonId);
  return season?.status === 'launched' ? season : null;
}

/** What a season has to be to be **looked at**. A concluded one passes: it is the game one
 *  reads back before the wipe, and a board that shuts the moment it is won says nothing. */
export function requireStarted(season: Doc<'seasons'>): void {
  if (season.status === 'lobby') fail('SEASON_NOT_LAUNCHED');
}

/**
 * **When this seat entered the war**, `null` while it is still out of it. The one reader of the
 * raw field, because the raw field has three states and only two meanings: a row written before
 * the latecomer landed carries **no** field, and its player entered the war with everybody else
 * at launch. An explicit `null` is the other thing entirely — a seat taken on a running season
 * whose owner is still picking his nation.
 */
export function warEntryOf(player: Doc<'players'>, season: Doc<'seasons'>): number | null {
  if (player.enteredWarAt !== undefined) return player.enteredWarAt;
  return season.status === 'lobby' ? null : season.launchedAt;
}

export const isAtWar = (player: Doc<'players'>, season: Doc<'seasons'>): boolean =>
  warEntryOf(player, season) !== null;

/**
 * **Les joueurs d'une saison** — et le siège irrégulier n'en est pas un (objectifs neutres,
 * 17/09/2026). C'est **la** porte de « qui joue ici » : le salon, le lancement, l'entrée en
 * guerre, l'encre, la presse, le classement, la dominance, le doyen et le relevé la lisent tous,
 * pour que l'exclusion soit une ligne et non douze filtres qu'un treizième lecteur oublierait.
 *
 * Ce qu'elle ne sert pas : `destroy`, qui efface **tout** ce qui pend à la saison, garnisons
 * locales comprises — sans quoi le siège irrégulier survivrait à la partie qui l'a créé.
 */
export const seatsOf = async (
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'players'>>> =>
  (await everySeatOf(ctx, seasonId)).filter((seat) => seat.irregular !== true);

/** Toutes les places, le siège irrégulier compris — la lecture d'un balayage, jamais d'une règle. */
export const everySeatOf = (
  ctx: QueryCtx,
  seasonId: Id<'seasons'>,
): Promise<Array<Doc<'players'>>> =>
  ctx.db
    .query('players')
    .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
    .collect();
