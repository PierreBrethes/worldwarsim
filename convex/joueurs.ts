import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { NATIONS } from './constantes';
import { joueurParJeton } from './saisons';

export const reserverNation = mutation({
  args: { jeton: v.string(), nation: v.union(v.string(), v.null()) },
  handler: async (ctx, { jeton, nation }) => {
    const { joueur, saison } = await joueurParJeton(ctx, jeton);
    if (saison.statut !== 'salon') throw new Error('la saison est lancée, les nations sont figées');
    if (nation === null) {
      await ctx.db.patch(joueur._id, { nation: null, pret: false });
      return;
    }
    if (!NATIONS.includes(nation as (typeof NATIONS)[number])) throw new Error('nation inconnue');
    const presents = await ctx.db
      .query('joueurs')
      .withIndex('parSaison', (q) => q.eq('saisonId', saison._id))
      .collect();
    const preneur = presents.find((present) => present.nation === nation);
    if (preneur && preneur._id !== joueur._id) {
      throw new Error(`${nation} est déjà prise par ${preneur.pseudo}`);
    }
    await ctx.db.patch(joueur._id, { nation });
  },
});

export const choisirDoctrine = mutation({
  args: {
    jeton: v.string(),
    doctrine: v.union(v.literal('domination'), v.literal('hegemonie'), v.literal('influence')),
  },
  handler: async (ctx, { jeton, doctrine }) => {
    const { joueur, saison } = await joueurParJeton(ctx, jeton);
    if (saison.statut !== 'salon') throw new Error('la doctrine se choisit avant le lancement');
    await ctx.db.patch(joueur._id, { doctrine });
  },
});

export const declarerPret = mutation({
  args: { jeton: v.string(), pret: v.boolean() },
  handler: async (ctx, { jeton, pret }) => {
    const { joueur, saison } = await joueurParJeton(ctx, jeton);
    if (saison.statut !== 'salon') throw new Error('la saison est lancée');
    if (pret && (joueur.nation === null || joueur.doctrine === null)) {
      throw new Error('prêt exige une nation et une doctrine');
    }
    await ctx.db.patch(joueur._id, { pret });
  },
});

export const reglerPlageRepos = mutation({
  args: { jeton: v.string(), debutMinutes: v.number(), finMinutes: v.number() },
  handler: async (ctx, { jeton, debutMinutes, finMinutes }) => {
    const { joueur } = await joueurParJeton(ctx, jeton);
    for (const minutes of [debutMinutes, finMinutes]) {
      if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) {
        throw new Error('plage invalide : minutes entre 0 et 1439');
      }
    }
    await ctx.db.patch(joueur._id, { plageRepos: { debutMinutes, finMinutes } });
  },
});
