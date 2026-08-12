import { v } from 'convex/values';
import { internalMutation, mutation } from './_generated/server';
import { internal } from './_generated/api';
import { stockAccumule } from '../src/domaine/hors-saison';
import { DEPART, coutNiveau, dureeChantierMinutes } from './constantes';
import { ligneRessource } from './ressources';
import { joueurParJeton } from './saisons';

const CLE_BATIMENT = v.union(
  v.literal('qg'),
  v.literal('industrie'),
  v.literal('logistique'),
  v.literal('conscription'),
  v.literal('ecoute'),
);

export const lancer = mutation({
  args: { jeton: v.string(), batiment: CLE_BATIMENT },
  handler: async (ctx, { jeton, batiment }) => {
    const { joueur, saison } = await joueurParJeton(ctx, jeton);
    if (saison.statut !== 'lancee') throw new Error('pas de chantier hors saison');

    const enCours = await ctx.db
      .query('chantiers')
      .withIndex('parJoueur', (q) => q.eq('joueurId', joueur._id))
      .unique();
    if (enCours) throw new Error('un chantier est déjà en cours');

    const batiments = await ctx.db
      .query('batiments')
      .withIndex('parJoueur', (q) => q.eq('joueurId', joueur._id))
      .collect();
    const cible = batiments.find((candidat) => candidat.cle === batiment);
    if (!cible) throw new Error('bâtiment inconnu pour ce joueur');
    const qg = batiments.find((candidat) => candidat.cle === 'qg');
    if (batiment !== 'qg' && qg && cible.niveau >= qg.niveau) {
      throw new Error('plafonné par le QG — montez le quartier général d’abord');
    }

    const maintenant = Date.now();
    const cout = coutNiveau(cible.niveau + 1);
    const ravitaillement = await ligneRessource(ctx, joueur._id, 'ravitaillement');
    const disponible = stockAccumule(ravitaillement, maintenant);
    if (disponible < cout) throw new Error(`il faut ${cout} de ravitaillement (${Math.floor(disponible)} disponibles)`);
    await ctx.db.patch(ravitaillement._id, { stock: disponible - cout, majLe: maintenant });

    const finitLe = maintenant + dureeChantierMinutes(cible.niveau + 1) * 60_000;
    const chantierId = await ctx.db.insert('chantiers', { joueurId: joueur._id, batiment, finitLe });
    await ctx.scheduler.runAt(finitLe, internal.chantiers.terminer, { chantierId });
    return { finitLe, cout };
  },
});

export const terminer = internalMutation({
  args: { chantierId: v.id('chantiers') },
  handler: async (ctx, { chantierId }) => {
    const chantier = await ctx.db.get(chantierId);
    if (!chantier) return;
    const batiments = await ctx.db
      .query('batiments')
      .withIndex('parJoueur', (q) => q.eq('joueurId', chantier.joueurId))
      .collect();
    const cible = batiments.find((candidat) => candidat.cle === chantier.batiment);
    if (cible) {
      const niveau = cible.niveau + 1;
      await ctx.db.patch(cible._id, { niveau });
      if (chantier.batiment === 'conscription') {
        const maintenant = Date.now();
        const effectifs = await ligneRessource(ctx, chantier.joueurId, 'effectifs');
        await ctx.db.patch(effectifs._id, {
          stock: stockAccumule(effectifs, maintenant, effectifs.plafond ?? undefined),
          majLe: maintenant,
          tauxParHeure: DEPART.effectifs.tauxParHeure * niveau,
          plafond: DEPART.effectifs.plafond * niveau,
        });
      }
    }
    await ctx.db.delete(chantierId);
  },
});

