import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import { coutRecrutement } from './constantes';
import schema from './schema';
import { modules } from './test.setup';

const demarrer = () => convexTest(schema, modules);

async function saisonLancee(t: ReturnType<typeof demarrer>) {
  const { code, jeton } = await t.mutation(api.saisons.fonder, {
    pseudo: 'Pierre',
    dureeHeures: 48,
    compensation: 0.5,
  });
  const { jeton: invite } = await t.mutation(api.saisons.rejoindre, { code, pseudo: 'Léa' });
  await t.mutation(api.joueurs.reserverNation, { jeton, nation: 'France' });
  await t.mutation(api.joueurs.choisirDoctrine, { jeton, doctrine: 'hegemonie' });
  await t.mutation(api.joueurs.declarerPret, { jeton, pret: true });
  await t.mutation(api.joueurs.reserverNation, { jeton: invite, nation: 'URSS' });
  await t.mutation(api.joueurs.choisirDoctrine, { jeton: invite, doctrine: 'domination' });
  await t.mutation(api.joueurs.declarerPret, { jeton: invite, pret: true });
  await t.mutation(api.saisons.lancer, { jeton });
  return jeton;
}

/** Les avant-postes d'extraction n'existent pas : sans ce coup de pouce, rien n'est produisible. */
async function crediterAcier(t: ReturnType<typeof demarrer>, jeton: string, stock: number) {
  await t.run(async (ctx) => {
    const joueur = await ctx.db
      .query('joueurs')
      .withIndex('parJeton', (q) => q.eq('jeton', jeton))
      .unique();
    if (!joueur) throw new Error('joueur introuvable');
    const lignes = await ctx.db
      .query('ressources')
      .withIndex('parJoueur', (q) => q.eq('joueurId', joueur._id))
      .collect();
    const acier = lignes.find((ligne) => ligne.cle === 'acier');
    if (!acier) throw new Error('ligne acier absente');
    await ctx.db.patch(acier._id, { stock, majLe: Date.now() });
  });
}

describe('file de production', () => {
  it('n’engage que le lot de tête et laisse les suivants en attente', async () => {
    const t = demarrer();
    const jeton = await saisonLancee(t);
    await crediterAcier(t, jeton, 2000);

    await t.mutation(api.unites.recruter, { jeton, role: 'infanterie', palier: 1, nombre: 2 });
    await t.mutation(api.unites.recruter, { jeton, role: 'blinde', palier: 1, nombre: 1 });
    await t.mutation(api.unites.recruter, { jeton, role: 'chasseur', palier: 1, nombre: 1 });

    const atelier = await t.query(api.unites.atelier, { jeton });
    expect(atelier.file.map((lot) => [lot.role, lot.commence])).toEqual([
      ['infanterie', true],
      ['blinde', false],
      ['chasseur', false],
    ]);
    // L'échéance d'un lot en attente cumule celles qui le précèdent.
    expect(atelier.file[1]!.resteMinutes).toBeGreaterThan(atelier.file[0]!.resteMinutes);
    expect(atelier.file[2]!.resteMinutes).toBeGreaterThan(atelier.file[1]!.resteMinutes);
  });

  it('enchaîne le lot suivant à la livraison du précédent', async () => {
    vi.useFakeTimers();
    try {
      const t = demarrer();
      const jeton = await saisonLancee(t);
      await crediterAcier(t, jeton, 2000);
      await t.mutation(api.unites.recruter, { jeton, role: 'infanterie', palier: 1, nombre: 2 });
      await t.mutation(api.unites.recruter, { jeton, role: 'infanterie', palier: 1, nombre: 3 });

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const atelier = await t.query(api.unites.atelier, { jeton });
      expect(atelier.file).toHaveLength(0);
      expect(atelier.effectif).toEqual([{ role: 'infanterie', palier: 1, nombre: 5 }]);

      const vue = await t.query(api.vue.vueJoueur, { jeton });
      expect(vue.moi.armeePresente).toEqual({ infanterie: 5 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rembourse un lot en attente et refuse d’annuler celui qui a commencé', async () => {
    const t = demarrer();
    const jeton = await saisonLancee(t);
    await crediterAcier(t, jeton, 2000);
    await t.mutation(api.unites.recruter, { jeton, role: 'infanterie', palier: 1, nombre: 1 });
    await t.mutation(api.unites.recruter, { jeton, role: 'blinde', palier: 1, nombre: 2 });

    const avant = await t.query(api.unites.atelier, { jeton });
    const enChaine = avant.file[0]!;
    const enAttente = avant.file[1]!;
    const cout = coutRecrutement('blinde', 1, 2, avant.niveauIndustrie);

    await expect(
      t.mutation(api.unites.annuler, { jeton, recrutementId: enChaine.id }),
    ).rejects.toThrow('déjà commencé');

    await t.mutation(api.unites.annuler, { jeton, recrutementId: enAttente.id });

    const apres = await t.query(api.unites.atelier, { jeton });
    expect(apres.file).toHaveLength(1);
    expect(apres.acier.stock).toBe(avant.acier.stock + cout.acier);
    expect(apres.effectifs.stock).toBe(avant.effectifs.stock + cout.effectifs);
  });

  it('écrête le remboursement des effectifs au plafond de conscription', async () => {
    const t = demarrer();
    const jeton = await saisonLancee(t);
    await crediterAcier(t, jeton, 2000);
    await t.mutation(api.unites.recruter, { jeton, role: 'infanterie', palier: 1, nombre: 1 });
    const commande = await t.mutation(api.unites.recruter, {
      jeton,
      role: 'infanterie',
      palier: 1,
      nombre: 1,
    });

    await t.run(async (ctx) => {
      const joueur = await ctx.db
        .query('joueurs')
        .withIndex('parJeton', (q) => q.eq('jeton', jeton))
        .unique();
      if (!joueur) throw new Error('joueur introuvable');
      const lignes = await ctx.db
        .query('ressources')
        .withIndex('parJoueur', (q) => q.eq('joueurId', joueur._id))
        .collect();
      const effectifs = lignes.find((ligne) => ligne.cle === 'effectifs');
      if (!effectifs?.plafond) throw new Error('plafond absent');
      await ctx.db.patch(effectifs._id, { stock: effectifs.plafond, majLe: Date.now() });
    });

    await t.mutation(api.unites.annuler, { jeton, recrutementId: commande.recrutementId });

    const apres = await t.query(api.unites.atelier, { jeton });
    expect(apres.effectifs.plafond).not.toBeNull();
    expect(apres.effectifs.stock).toBe(apres.effectifs.plafond);
  });

  it('refuse un palier absent et le palier 2 sans complexe industriel', async () => {
    const t = demarrer();
    const jeton = await saisonLancee(t);
    await crediterAcier(t, jeton, 2000);

    await expect(
      t.mutation(api.unites.recruter, { jeton, role: 'infanterie', palier: 2, nombre: 1 }),
    ).rejects.toThrow('complexe industriel');
    await expect(
      t.mutation(api.unites.recruter, { jeton, role: 'chasseur', palier: 2, nombre: 1 }),
    ).rejects.toThrow('qu’un seul palier');
    await expect(
      t.mutation(api.unites.recruter, { jeton, role: 'infanterie', palier: 1, nombre: 0 }),
    ).rejects.toThrow('au moins une unité');
  });

  /**
   * Une unité s'achète en acier, et l'acier ne vient que des avant-postes d'extraction, qui
   * n'existent pas encore : une nation neuve ne peut donc rien produire du tout.
   */
  it('laisse une nation neuve incapable de produire quoi que ce soit', async () => {
    const t = demarrer();
    const jeton = await saisonLancee(t);
    const atelier = await t.query(api.unites.atelier, { jeton });

    expect(atelier.acier.stock).toBe(0);
    expect(atelier.grille.every((entree) => entree.unitaire.acier > 0)).toBe(true);
    await expect(
      t.mutation(api.unites.recruter, { jeton, role: 'infanterie', palier: 1, nombre: 1 }),
    ).rejects.toThrow('acier');
  });
});
