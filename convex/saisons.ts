import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { codeDePartie, regionJouable } from '../src/domaine/hors-saison';
import { DEPART, JOUEURS_MAX, JOUEURS_MIN_LANCEMENT, PLAGE_REPOS_DEFAUT } from './constantes';

export async function joueurParJeton(ctx: QueryCtx, jeton: string) {
  const joueur = await ctx.db
    .query('joueurs')
    .withIndex('parJeton', (q) => q.eq('jeton', jeton))
    .unique();
  if (!joueur) throw new Error('jeton inconnu — redemandez le code de partie');
  const saison = await ctx.db.get(joueur.saisonId);
  if (!saison) throw new Error('saison disparue');
  return { joueur, saison };
}

export const fonder = mutation({
  args: {
    pseudo: v.string(),
    dureeHeures: v.union(v.literal(48), v.literal(168)),
    compensation: v.number(),
  },
  handler: async (ctx, { pseudo, dureeHeures, compensation }) => {
    const code = await codeLibre(ctx);
    const saisonId = await ctx.db.insert('saisons', {
      code,
      statut: 'salon',
      dureeHeures,
      compensation: Math.max(0, Math.min(1, compensation)),
      graine: Math.floor(Math.random() * 2 ** 31),
      regionJouable: null,
      lanceeLe: null,
    });
    const jeton = crypto.randomUUID();
    await ctx.db.insert('joueurs', {
      saisonId,
      jeton,
      pseudo: pseudo.trim(),
      createur: true,
      nation: null,
      doctrine: null,
      pret: false,
      plageRepos: PLAGE_REPOS_DEFAUT,
    });
    return { code, jeton };
  },
});

export const rejoindre = mutation({
  args: { code: v.string(), pseudo: v.string() },
  handler: async (ctx, { code, pseudo }) => {
    const saison = await ctx.db
      .query('saisons')
      .withIndex('parCode', (q) => q.eq('code', code.trim().toUpperCase()))
      .unique();
    if (!saison) throw new Error('code inconnu');
    if (saison.statut !== 'salon') throw new Error('la saison est déjà lancée');
    const presents = await ctx.db
      .query('joueurs')
      .withIndex('parSaison', (q) => q.eq('saisonId', saison._id))
      .collect();
    if (presents.length >= JOUEURS_MAX) throw new Error('salon complet (8 joueurs)');
    const jeton = crypto.randomUUID();
    await ctx.db.insert('joueurs', {
      saisonId: saison._id,
      jeton,
      pseudo: pseudo.trim(),
      createur: false,
      nation: null,
      doctrine: null,
      pret: false,
      plageRepos: PLAGE_REPOS_DEFAUT,
    });
    return { jeton };
  },
});

/**
 * Ce que l'accueil a le droit de savoir d'un jeton gardé en local : de quoi écrire
 * « reprendre » sans mentir. Un jeton périmé rend `null` plutôt qu'une erreur — sinon
 * une saison finie condamnerait l'écran d'entrée.
 */
export const apercu = query({
  args: { jeton: v.string() },
  handler: async (ctx, { jeton }) => {
    const joueur = await ctx.db
      .query('joueurs')
      .withIndex('parJeton', (q) => q.eq('jeton', jeton))
      .unique();
    if (!joueur) return null;
    const saison = await ctx.db.get(joueur.saisonId);
    if (!saison) return null;
    const presents = await ctx.db
      .query('joueurs')
      .withIndex('parSaison', (q) => q.eq('saisonId', saison._id))
      .collect();
    return {
      code: saison.code,
      statut: saison.statut,
      dureeHeures: saison.dureeHeures,
      lanceeLe: saison.lanceeLe,
      regionJouable: saison.regionJouable ?? regionJouable(presents.length),
      joueurs: presents.length,
      pseudo: joueur.pseudo,
      nation: joueur.nation,
      doctrine: joueur.doctrine,
    };
  },
});

export const salon = query({
  args: { jeton: v.string() },
  handler: async (ctx, { jeton }) => {
    const { joueur, saison } = await joueurParJeton(ctx, jeton);
    const presents = await ctx.db
      .query('joueurs')
      .withIndex('parSaison', (q) => q.eq('saisonId', saison._id))
      .collect();
    return {
      code: saison.code,
      statut: saison.statut,
      dureeHeures: saison.dureeHeures,
      compensation: saison.compensation,
      regionJouable: regionJouable(presents.length),
      moi: {
        pseudo: joueur.pseudo,
        createur: joueur.createur,
        nation: joueur.nation,
        doctrine: joueur.doctrine,
        pret: joueur.pret,
        plageRepos: joueur.plageRepos,
      },
      joueurs: presents.map((present) => ({
        pseudo: present.pseudo,
        createur: present.createur,
        nation: present.nation,
        pret: present.pret,
      })),
    };
  },
});

export const lancer = mutation({
  args: { jeton: v.string() },
  handler: async (ctx, { jeton }) => {
    const { joueur, saison } = await joueurParJeton(ctx, jeton);
    if (!joueur.createur) throw new Error('seul le créateur lance la saison');
    if (saison.statut !== 'salon') throw new Error('déjà lancée');
    const presents = await ctx.db
      .query('joueurs')
      .withIndex('parSaison', (q) => q.eq('saisonId', saison._id))
      .collect();
    if (presents.length < JOUEURS_MIN_LANCEMENT) throw new Error('il faut au moins 2 joueurs');
    const retardataires = presents.filter((present) => !present.pret);
    if (retardataires.length > 0) {
      throw new Error(`pas prêts : ${retardataires.map((present) => present.pseudo).join(', ')}`);
    }

    const maintenant = Date.now();
    await ctx.db.patch(saison._id, {
      statut: 'lancee',
      lanceeLe: maintenant,
      regionJouable: regionJouable(presents.length),
    });
    for (const present of presents) {
      await ctx.db.insert('ressources', {
        joueurId: present._id,
        cle: 'ravitaillement',
        ...DEPART.ravitaillement,
        majLe: maintenant,
        plafond: null,
      });
      await ctx.db.insert('ressources', {
        joueurId: present._id,
        cle: 'acier',
        ...DEPART.acier,
        majLe: maintenant,
        plafond: null,
      });
      await ctx.db.insert('ressources', {
        joueurId: present._id,
        cle: 'effectifs',
        stock: DEPART.effectifs.stock,
        tauxParHeure: DEPART.effectifs.tauxParHeure,
        majLe: maintenant,
        plafond: DEPART.effectifs.plafond,
      });
      for (const cle of ['qg', 'industrie', 'logistique', 'conscription', 'ecoute'] as const) {
        await ctx.db.insert('batiments', { joueurId: present._id, cle, niveau: 1 });
      }
    }
  },
});

async function codeLibre(ctx: MutationCtx): Promise<string> {
  for (let essai = 0; essai < 20; essai += 1) {
    const code = codeDePartie(Math.random);
    const existante = await ctx.db
      .query('saisons')
      .withIndex('parCode', (q) => q.eq('code', code))
      .unique();
    if (!existante) return code;
  }
  throw new Error('impossible de tirer un code libre');
}
