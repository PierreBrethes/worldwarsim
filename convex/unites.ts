import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { stockAccumule } from '../src/domaine/hors-saison';
import { PALIERS_PAR_ROLE } from '../src/domaine/troupes';
import type { RoleUnite } from '../src/domaine/vue-joueur';
import {
  COUT_PAR_ROLE,
  LOTS_EN_FILE_MAX,
  NIVEAU_INDUSTRIE_PALIER_2,
  UNITES_PAR_LOT_MAX,
  coutRecrutement,
  vitesseIndustrie,
} from './constantes';
import { crediter, debiter } from './ressources';
import { joueurParJeton } from './saisons';

const CLE_ROLE = v.union(
  v.literal('infanterie'),
  v.literal('blinde'),
  v.literal('transportTerrestre'),
  v.literal('chasseur'),
  v.literal('bombardier'),
  v.literal('transportAerien'),
  v.literal('escorte'),
  v.literal('cargo'),
  v.literal('porteAvions'),
);

const PALIER = v.union(v.literal(1), v.literal(2));

/**
 * Ce que la surface de production a besoin de savoir, et rien de plus : elle ne passe pas par
 * `VueJoueur`, qui décrit le plateau et n'a aucune raison de porter une grille de coûts.
 */
export const atelier = query({
  args: { jeton: v.string() },
  handler: async (ctx, { jeton }) => {
    const { joueur, saison } = await joueurParJeton(ctx, jeton);
    if (saison.statut !== 'lancee') throw new Error('la saison n’est pas lancée');
    const maintenant = Date.now();

    const niveauIndustrie = await niveauDeBatiment(ctx, joueur._id, 'industrie');
    const effectif = await ctx.db
      .query('unites')
      .withIndex('parJoueur', (q) => q.eq('joueurId', joueur._id))
      .collect();
    const file = await fileDe(ctx, joueur._id);

    const lignes = await ctx.db
      .query('ressources')
      .withIndex('parJoueur', (q) => q.eq('joueurId', joueur._id))
      .collect();
    const ressource = (cle: 'ravitaillement' | 'acier' | 'effectifs') => {
      const ligne = lignes.find((candidate) => candidate.cle === cle);
      if (!ligne) throw new Error(`ressource absente : ${cle}`);
      return {
        stock: Math.floor(stockAccumule(ligne, maintenant, ligne.plafond ?? undefined)),
        debitParHeure: ligne.tauxParHeure,
        plafond: ligne.plafond,
      };
    };

    // L'échéance d'un lot en attente se déduit de ceux qui le précèdent : rien n'est daté en
    // base tant qu'un lot n'a pas commencé, sinon toute annulation obligerait à tout redater.
    let jalon = maintenant;
    const fileDatee = file.map((lot) => {
      const duree =
        lot.finitLe === null
          ? coutRecrutement(lot.role, lot.palier, lot.nombre, niveauIndustrie).minutes * 60_000
          : 0;
      const finitLe = lot.finitLe ?? jalon + duree;
      jalon = finitLe;
      return {
        id: lot._id,
        role: lot.role,
        palier: lot.palier,
        nombre: lot.nombre,
        commence: lot.finitLe !== null,
        resteMinutes: Math.max(0, (finitLe - maintenant) / 60_000),
      };
    });

    return {
      nation: joueur.nation ?? '?',
      niveauIndustrie,
      vitesse: vitesseIndustrie(niveauIndustrie),
      palier2Ouvert: niveauIndustrie >= NIVEAU_INDUSTRIE_PALIER_2,
      niveauIndustrieRequis: NIVEAU_INDUSTRIE_PALIER_2,
      lotMaximum: UNITES_PAR_LOT_MAX,
      fileMaximum: LOTS_EN_FILE_MAX,
      ravitaillement: ressource('ravitaillement'),
      acier: ressource('acier'),
      effectifs: ressource('effectifs'),
      effectif: effectif.map(({ role, palier, nombre }) => ({ role, palier, nombre })),
      file: fileDatee,
      grille: (Object.keys(COUT_PAR_ROLE) as ReadonlyArray<RoleUnite>).map((role) => ({
        role,
        paliers: PALIERS_PAR_ROLE[role],
        unitaire: coutRecrutement(role, 1, 1, niveauIndustrie),
        unitairePalier2:
          PALIERS_PAR_ROLE[role] === 2 ? coutRecrutement(role, 2, 1, niveauIndustrie) : null,
      })),
    };
  },
});

export const recruter = mutation({
  args: { jeton: v.string(), role: CLE_ROLE, palier: PALIER, nombre: v.number() },
  handler: async (ctx, { jeton, role, palier, nombre }) => {
    const { joueur, saison } = await joueurParJeton(ctx, jeton);
    if (saison.statut !== 'lancee') throw new Error('pas de recrutement hors saison');

    if (!Number.isInteger(nombre) || nombre < 1) throw new Error('il faut recruter au moins une unité');
    if (nombre > UNITES_PAR_LOT_MAX) throw new Error(`${UNITES_PAR_LOT_MAX} unités par lot au plus`);
    if (palier > PALIERS_PAR_ROLE[role]) throw new Error('ce rôle n’a qu’un seul palier');

    const niveauIndustrie = await niveauDeBatiment(ctx, joueur._id, 'industrie');
    if (palier === 2 && niveauIndustrie < NIVEAU_INDUSTRIE_PALIER_2) {
      throw new Error(`palier 2 : complexe industriel niveau ${NIVEAU_INDUSTRIE_PALIER_2} requis`);
    }

    const file = await fileDe(ctx, joueur._id);
    if (file.length >= LOTS_EN_FILE_MAX) throw new Error(`file pleine (${LOTS_EN_FILE_MAX} lots)`);

    const maintenant = Date.now();
    const cout = coutRecrutement(role, palier, nombre, niveauIndustrie);
    await debiter(
      ctx,
      joueur._id,
      { ravitaillement: cout.ravitaillement, acier: cout.acier, effectifs: cout.effectifs },
      maintenant,
    );

    const dernier = file[file.length - 1];
    const recrutementId = await ctx.db.insert('recrutements', {
      joueurId: joueur._id,
      role,
      palier,
      nombre,
      rang: dernier ? dernier.rang + 1 : 0,
      finitLe: null,
    });
    if (file.length === 0) await lancerLaTete(ctx, joueur._id, maintenant);
    return { cout, rang: dernier ? dernier.rang + 1 : 0, recrutementId };
  },
});

/**
 * On ne rembourse que ce qui n'a pas commencé. Un lot en cours a déjà consommé de l'atelier,
 * et l'annuler à mi-parcours ouvrirait un aller-retour gratuit entre acier et temps.
 */
export const annuler = mutation({
  args: { jeton: v.string(), recrutementId: v.id('recrutements') },
  handler: async (ctx, { jeton, recrutementId }) => {
    const { joueur } = await joueurParJeton(ctx, jeton);
    const lot = await ctx.db.get(recrutementId);
    if (!lot || lot.joueurId !== joueur._id) throw new Error('lot inconnu');
    if (lot.finitLe !== null) throw new Error('ce lot a déjà commencé — il ne s’annule plus');

    const niveauIndustrie = await niveauDeBatiment(ctx, joueur._id, 'industrie');
    const cout = coutRecrutement(lot.role, lot.palier, lot.nombre, niveauIndustrie);
    await crediter(
      ctx,
      joueur._id,
      { ravitaillement: cout.ravitaillement, acier: cout.acier, effectifs: cout.effectifs },
      Date.now(),
    );
    await ctx.db.delete(recrutementId);
    return { rembourse: cout };
  },
});

export const livrer = internalMutation({
  args: { recrutementId: v.id('recrutements') },
  handler: async (ctx, { recrutementId }) => {
    const lot = await ctx.db.get(recrutementId);
    if (!lot) return;

    const effectif = await ctx.db
      .query('unites')
      .withIndex('parJoueur', (q) => q.eq('joueurId', lot.joueurId))
      .collect();
    const ligne = effectif.find(
      (candidate) => candidate.role === lot.role && candidate.palier === lot.palier,
    );
    if (ligne) {
      await ctx.db.patch(ligne._id, { nombre: ligne.nombre + lot.nombre });
    } else {
      await ctx.db.insert('unites', {
        joueurId: lot.joueurId,
        role: lot.role,
        palier: lot.palier,
        nombre: lot.nombre,
      });
    }
    await ctx.db.delete(recrutementId);
    await lancerLaTete(ctx, lot.joueurId, Date.now());
  },
});

/**
 * La file avance seule, y compris pendant la plage de repos : celle-ci interdit qu'un
 * mouvement *arrive*, elle n'arrête ni les chantiers ni la production.
 */
async function lancerLaTete(
  ctx: MutationCtx,
  joueurId: Id<'joueurs'>,
  maintenant: number,
): Promise<void> {
  const file = await fileDe(ctx, joueurId);
  const tete = file[0];
  if (!tete || tete.finitLe !== null) return;

  const niveauIndustrie = await niveauDeBatiment(ctx, joueurId, 'industrie');
  const { minutes } = coutRecrutement(tete.role, tete.palier, tete.nombre, niveauIndustrie);
  const finitLe = maintenant + minutes * 60_000;
  await ctx.db.patch(tete._id, { finitLe });
  await ctx.scheduler.runAt(finitLe, internal.unites.livrer, { recrutementId: tete._id });
}

async function fileDe(ctx: QueryCtx, joueurId: Id<'joueurs'>): Promise<Array<Doc<'recrutements'>>> {
  const lots = await ctx.db
    .query('recrutements')
    .withIndex('parJoueur', (q) => q.eq('joueurId', joueurId))
    .collect();
  return lots.sort((a, b) => a.rang - b.rang);
}

async function niveauDeBatiment(
  ctx: QueryCtx,
  joueurId: Id<'joueurs'>,
  cle: 'qg' | 'industrie' | 'logistique' | 'conscription' | 'ecoute',
): Promise<number> {
  const batiments = await ctx.db
    .query('batiments')
    .withIndex('parJoueur', (q) => q.eq('joueurId', joueurId))
    .collect();
  return batiments.find((candidat) => candidat.cle === cle)?.niveau ?? 1;
}
