import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

/** Une session qu'on n'a pas vue depuis trente jours n'ouvre plus rien : un jeton oublié sur un
 *  appareil prêté, ou sorti d'une sauvegarde, finit par mourir seul. */
export const SESSION_IDLE_MS = 30 * 24 * 3_600_000;
/** L'activité se date au plus une fois par jour : c'est une échéance, pas une présence, et une
 *  écriture par battement réveillerait toutes les requêtes de la session. */
export const SESSION_REFRESH_MS = 24 * 3_600_000;

/**
 * **Ce que la table garde d'un jeton : son empreinte, jamais lui.** Le jeton vaut le compte —
 * il n'y a ni e-mail ni second facteur derrière —, donc une base qui fuit (une sauvegarde, un
 * export, le tableau de bord) ne doit pas livrer de quoi entrer. SHA-256 suffit : le jeton est
 * 32 octets d'aléa, il n'y a rien à deviner et donc rien à ralentir.
 */
export async function tokenDigest(token: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
  );
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * **La session derrière un jeton**, `null` si personne ne répond ou si elle a expiré.
 *
 * Une ligne d'avant l'empreinte porte encore le jeton en clair : elle se relit par lui, tant
 * qu'elle n'est pas marquée `hashed` — sans cette condition, l'empreinte lue dans une base
 * volée se présenterait comme jeton et ouvrirait la ligne qu'elle était censée protéger. Elle
 * est convertie à sa première écriture (`refreshSession`).
 */
export async function sessionOf(ctx: QueryCtx, token: string): Promise<Doc<'sessions'> | null> {
  const digest = await tokenDigest(token);
  const kept = await ctx.db
    .query('sessions')
    .withIndex('byToken', (q) => q.eq('token', digest))
    .unique();
  const session =
    kept?.hashed === true
      ? kept
      : await ctx.db
          .query('sessions')
          .withIndex('byToken', (q) => q.eq('token', token))
          .unique();
  if (session === null || (session !== kept && session.hashed === true)) return null;
  return Date.now() - session.lastSeenAt > SESSION_IDLE_MS ? null : session;
}

export async function openSession(
  ctx: MutationCtx,
  accountId: Id<'accounts'>,
  token: string,
): Promise<void> {
  const now = Date.now();
  await ctx.db.insert('sessions', {
    accountId,
    token: await tokenDigest(token),
    hashed: true,
    createdAt: now,
    lastSeenAt: now,
  });
  /** Le ménage se fait à la porte : ce que ce compte a laissé expirer part quand il rentre. */
  const others = await ctx.db
    .query('sessions')
    .withIndex('byAccount', (q) => q.eq('accountId', accountId))
    .collect();
  for (const other of others) {
    if (now - other.lastSeenAt > SESSION_IDLE_MS) await ctx.db.delete(other._id);
  }
}

/** **Repousser l'échéance d'une session qui sert**, et convertir au passage celle qui porte
 *  encore son jeton en clair. Rien n'est écrit tant que le jour n'a pas tourné. */
export async function refreshSession(ctx: MutationCtx, token: string): Promise<void> {
  const session = await sessionOf(ctx, token);
  if (session === null) return;
  const now = Date.now();
  const legacy = session.hashed !== true;
  if (!legacy && now - session.lastSeenAt < SESSION_REFRESH_MS) return;
  await ctx.db.patch(session._id, {
    lastSeenAt: now,
    ...(legacy ? { token: await tokenDigest(token), hashed: true } : {}),
  });
}
