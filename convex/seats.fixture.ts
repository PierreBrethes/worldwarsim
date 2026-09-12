import type { convexTest } from 'convex-test';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { nicknameKey } from '../src/domain/account';

/**
 * **La seule façon de s'asseoir à une table de test** (ADR 0022). Un jeton bricolé par suite
 * redeviendrait ce que le jeton de partie était — une identité inventée sur place — et la
 * première règle qui lirait le compte derrière la place échouerait dans dix-huit fichiers à la
 * fois.
 *
 * Le nom du fichier porte deux points : ni le bundler de Convex ni le glob de `convex-test` ne
 * le ramassent, donc il n'est pas un module du jeu, et `vitest` ne le prend pas pour une suite.
 */
type Bench = ReturnType<typeof convexTest>;

export type Seat = { readonly token: string; readonly seasonId: Id<'seasons'> };

let issued = 0;

/**
 * **Un compte et sa session, écrits directement.** Passer par `auth.register` coûterait
 * 600 000 itérations de PBKDF2 par joueur et par test : le hachage a sa propre suite
 * (`auth.test.ts`), et ce que les autres ont besoin de prouver commence après la porte.
 */
export async function signIn(t: Bench, nickname: string): Promise<string> {
  const token = `session-${String(++issued)}`;
  await t.run(async (ctx) => {
    const now = Date.now();
    const accountId = await ctx.db.insert('accounts', {
      nickname,
      nicknameKey: nicknameKey(nickname),
      passwordHash: 'fixture',
      salt: 'fixture',
      iterations: 1,
      createdAt: now,
    });
    await ctx.db.insert('sessions', { accountId, token, createdAt: now, lastSeenAt: now });
  });
  return token;
}

/** Un compte neuf qui fonde une saison : la place du fondateur, et le code de l'invitation. */
export async function foundSeat(
  t: Bench,
  nickname = 'Pierre',
  durationHours: 48 | 168 | null = 48,
  compensation = 0.5,
): Promise<{ seat: Seat; code: string }> {
  const token = await signIn(t, nickname);
  const { code, seasonId } = await t.mutation(api.seasons.create, {
    token,
    durationHours,
    compensation,
  });
  return { seat: { token, seasonId }, code };
}

/** Un compte neuf qui rejoint par le code. */
export async function joinSeat(t: Bench, code: string, nickname: string): Promise<Seat> {
  const token = await signIn(t, nickname);
  const { seasonId } = await t.mutation(api.seasons.join, { token, code });
  return { token, seasonId };
}

/**
 * **La place derrière une session, dans une transaction déjà ouverte.** Les suites plantent des
 * bâtiments, des points et des troupes à la main : il leur faut le document du joueur, et il n'y
 * a plus d'index qui aille du jeton à lui directement.
 */
export async function seatIn(ctx: QueryCtx, seat: Seat): Promise<Doc<'players'>> {
  const session = await ctx.db
    .query('sessions')
    .withIndex('byToken', (q) => q.eq('token', seat.token))
    .unique();
  if (!session) throw new Error('session not found');
  const player = await ctx.db
    .query('players')
    .withIndex('byAccountSeason', (q) =>
      q.eq('accountId', session.accountId).eq('seasonId', seat.seasonId),
    )
    .unique();
  if (!player) throw new Error('player not found');
  return player;
}

/** La même lecture, depuis le banc. */
export const seatDoc = (t: Bench, seat: Seat): Promise<Doc<'players'>> =>
  t.run((ctx) => seatIn(ctx, seat));

/** Les lignes d'accueil du compte qui tient cette place — ce que `accounts.seats` sert. */
export const seatsOf = (t: Bench, seat: Seat) => t.query(api.accounts.seats, { token: seat.token });
