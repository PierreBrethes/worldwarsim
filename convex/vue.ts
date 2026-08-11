import { v } from 'convex/values';
import { query } from './_generated/server';
import { stockAccumule } from '../src/domaine/hors-saison';
import { encreDeNation } from '../src/domaine/nations';
import { coutNiveau, dureeChantierMinutes } from './constantes';
import { joueurParJeton } from './saisons';

export const vueJoueur = query({
  args: { jeton: v.string() },
  handler: async (ctx, { jeton }) => {
    const { joueur, saison } = await joueurParJeton(ctx, jeton);
    if (saison.statut !== 'lancee') throw new Error('la saison n’est pas lancée');
    const maintenant = Date.now();

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

    const batiments = await ctx.db
      .query('batiments')
      .withIndex('parJoueur', (q) => q.eq('joueurId', joueur._id))
      .collect();
    const niveauDe = (cle: string) => batiments.find((b) => b.cle === cle)?.niveau ?? 1;
    const chantier = await ctx.db
      .query('chantiers')
      .withIndex('parJoueur', (q) => q.eq('joueurId', joueur._id))
      .unique();

    const autres = (
      await ctx.db
        .query('joueurs')
        .withIndex('parSaison', (q) => q.eq('saisonId', saison._id))
        .collect()
    ).filter((present) => present._id !== joueur._id);

    return {
      saison: {
        numero: 1,
        dureeHeures: saison.dureeHeures,
        ecouleHeures: saison.lanceeLe === null ? 0 : (maintenant - saison.lanceeLe) / 3_600_000,
        joueurs: autres.length + 1,
        regionJouable: saison.regionJouable ?? 'Monde',
        trajetMinutesPar1000km: 14,
      },
      moi: {
        nation: joueur.nation ?? '?',
        encre: encreDeNation(joueur.nation),
        pouvoir: '',
        doctrine: joueur.doctrine ?? 'domination',
        progression: 0,
        plageRepos: joueur.plageRepos,
        ravitaillement: ressource('ravitaillement'),
        acier: ressource('acier'),
        effectifs: ressource('effectifs'),
        slots: { total: 1 + niveauDe('logistique'), utilises: 0 },
        batiments: batiments.map((batiment) => ({
          cle: batiment.cle,
          niveau: batiment.niveau,
          coutNiveauSuivant: coutNiveau(batiment.niveau + 1),
          dureeNiveauSuivantMinutes: dureeChantierMinutes(batiment.niveau + 1),
          plafonneParQg: batiment.cle !== 'qg' && batiment.niveau >= niveauDe('qg'),
        })),
        chantier: chantier
          ? { nom: chantier.batiment, resteMinutes: Math.max(0, (chantier.finitLe - maintenant) / 60_000) }
          : null,
      },
      arcs: [],
      journal: [],
      chargeeA: maintenant,
      adversaires: autres.map((autre) => ({
        nation: autre.nation ?? autre.pseudo,
        encre: encreDeNation(autre.nation),
        pouvoir: '',
        plageRepos: autre.plageRepos,
        dernierRenseignement: '—',
      })),
    };
  },
});
