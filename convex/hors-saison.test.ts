import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

const demarrer = () => convexTest(schema, modules);

async function saisonAvecDeuxJoueurs(t: ReturnType<typeof demarrer>) {
  const { code, jeton } = await t.mutation(api.saisons.fonder, {
    pseudo: 'Pierre',
    dureeHeures: 48,
    compensation: 0.5,
  });
  const { jeton: jetonInvite } = await t.mutation(api.saisons.rejoindre, { code, pseudo: 'Léa' });
  return { code, createur: jeton, invite: jetonInvite };
}

async function pretsALancer(t: ReturnType<typeof demarrer>) {
  const { code, createur, invite } = await saisonAvecDeuxJoueurs(t);
  await t.mutation(api.joueurs.reserverNation, { jeton: createur, nation: 'France' });
  await t.mutation(api.joueurs.choisirDoctrine, { jeton: createur, doctrine: 'hegemonie' });
  await t.mutation(api.joueurs.declarerPret, { jeton: createur, pret: true });
  await t.mutation(api.joueurs.reserverNation, { jeton: invite, nation: 'URSS' });
  await t.mutation(api.joueurs.choisirDoctrine, { jeton: invite, doctrine: 'domination' });
  await t.mutation(api.joueurs.declarerPret, { jeton: invite, pret: true });
  return { code, createur, invite };
}

describe('fonder et rejoindre', () => {
  it('fonde une saison et donne un code à 6 caractères sans ambiguïté', async () => {
    const t = demarrer();
    const { code, jeton } = await t.mutation(api.saisons.fonder, {
      pseudo: 'Pierre',
      dureeHeures: 168,
      compensation: 0,
    });
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const salon = await t.query(api.saisons.salon, { jeton });
    expect(salon.moi.createur).toBe(true);
    expect(salon.joueurs).toHaveLength(1);
  });

  it('refuse un code inconnu et une saison lancée', async () => {
    const t = demarrer();
    await expect(t.mutation(api.saisons.rejoindre, { code: 'ZZZZZZ', pseudo: 'X' })).rejects.toThrow(
      'code inconnu',
    );
    const { code, createur } = await pretsALancer(t);
    await t.mutation(api.saisons.lancer, { jeton: createur });
    await expect(t.mutation(api.saisons.rejoindre, { code, pseudo: 'Tard' })).rejects.toThrow(
      'déjà lancée',
    );
  });

  it('élargit la région jouable avec le nombre de joueurs', async () => {
    const t = demarrer();
    const { code, createur } = await saisonAvecDeuxJoueurs(t);
    expect((await t.query(api.saisons.salon, { jeton: createur })).regionJouable).toBe('Europe');
    await t.mutation(api.saisons.rejoindre, { code, pseudo: 'Marc' });
    await t.mutation(api.saisons.rejoindre, { code, pseudo: 'Jo' });
    expect((await t.query(api.saisons.salon, { jeton: createur })).regionJouable).toBe(
      'Europe + Méditerranée + Moyen-Orient',
    );
  });
});

describe('le choix de nation', () => {
  it('est premier arrivé premier servi, et se relâche', async () => {
    const t = demarrer();
    const { createur, invite } = await saisonAvecDeuxJoueurs(t);
    await t.mutation(api.joueurs.reserverNation, { jeton: createur, nation: 'France' });
    await expect(
      t.mutation(api.joueurs.reserverNation, { jeton: invite, nation: 'France' }),
    ).rejects.toThrow('déjà prise par Pierre');
    await t.mutation(api.joueurs.reserverNation, { jeton: createur, nation: null });
    await t.mutation(api.joueurs.reserverNation, { jeton: invite, nation: 'France' });
  });

  it('ne révèle jamais la doctrine des autres dans le salon', async () => {
    const t = demarrer();
    const { createur, invite } = await saisonAvecDeuxJoueurs(t);
    await t.mutation(api.joueurs.choisirDoctrine, { jeton: invite, doctrine: 'influence' });
    const salon = await t.query(api.saisons.salon, { jeton: createur });
    for (const joueur of salon.joueurs) {
      expect(joueur).not.toHaveProperty('doctrine');
    }
    expect(salon.moi.doctrine).toBeNull();
  });

  it('exige nation et doctrine pour être prêt', async () => {
    const t = demarrer();
    const { createur } = await saisonAvecDeuxJoueurs(t);
    await expect(t.mutation(api.joueurs.declarerPret, { jeton: createur, pret: true })).rejects.toThrow(
      'exige une nation et une doctrine',
    );
  });
});

describe('le lancement', () => {
  it('appartient au créateur et exige que tout le monde soit prêt', async () => {
    const t = demarrer();
    const { createur, invite } = await saisonAvecDeuxJoueurs(t);
    await expect(t.mutation(api.saisons.lancer, { jeton: invite })).rejects.toThrow('créateur');
    await expect(t.mutation(api.saisons.lancer, { jeton: createur })).rejects.toThrow('pas prêts');
  });

  it('initialise ressources et bâtiments, et fige la région', async () => {
    const t = demarrer();
    const { createur } = await pretsALancer(t);
    await t.mutation(api.saisons.lancer, { jeton: createur });
    const vue = await t.query(api.vue.vueJoueur, { jeton: createur });
    expect(vue.moi.nation).toBe('France');
    expect(vue.moi.ravitaillement.stock).toBe(500);
    expect(vue.moi.batiments).toHaveLength(5);
    expect(vue.moi.slots).toEqual({ total: 2, utilises: 0 });
    expect(vue.saison.regionJouable).toBe('Europe');
    expect(vue.adversaires).toHaveLength(1);
    expect(vue.adversaires[0]).not.toHaveProperty('doctrine');
  });
});

describe('l’accumulation paresseuse', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('crédite les ressources au fil du temps sans tick', async () => {
    const t = demarrer();
    const { createur } = await pretsALancer(t);
    await t.mutation(api.saisons.lancer, { jeton: createur });
    vi.advanceTimersByTime(2 * 3_600_000);
    const vue = await t.query(api.vue.vueJoueur, { jeton: createur });
    expect(vue.moi.ravitaillement.stock).toBe(500 + 240);
  });

  it('plafonne les effectifs', async () => {
    const t = demarrer();
    const { createur } = await pretsALancer(t);
    await t.mutation(api.saisons.lancer, { jeton: createur });
    vi.advanceTimersByTime(100 * 3_600_000);
    const vue = await t.query(api.vue.vueJoueur, { jeton: createur });
    expect(vue.moi.effectifs.stock).toBe(120);
  });
});

describe('les chantiers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('débite le ravitaillement, monte le niveau à terme, un seul à la fois', async () => {
    const t = demarrer();
    const { createur } = await pretsALancer(t);
    await t.mutation(api.saisons.lancer, { jeton: createur });
    vi.advanceTimersByTime(3_600_000);

    await t.mutation(api.chantiers.lancer, { jeton: createur, batiment: 'qg' });
    await expect(
      t.mutation(api.chantiers.lancer, { jeton: createur, batiment: 'logistique' }),
    ).rejects.toThrow('déjà en cours');

    const avant = await t.query(api.vue.vueJoueur, { jeton: createur });
    expect(avant.moi.chantier?.nom).toBe('qg');

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const apres = await t.query(api.vue.vueJoueur, { jeton: createur });
    expect(apres.moi.chantier).toBeNull();
    expect(apres.moi.batiments.find((batiment) => batiment.cle === 'qg')?.niveau).toBe(2);
  });

  it('refuse de dépasser le niveau du QG', async () => {
    const t = demarrer();
    const { createur } = await pretsALancer(t);
    await t.mutation(api.saisons.lancer, { jeton: createur });
    vi.advanceTimersByTime(10 * 3_600_000);
    await expect(
      t.mutation(api.chantiers.lancer, { jeton: createur, batiment: 'logistique' }),
    ).rejects.toThrow('plafonné par le QG');
  });
});

describe('la plage de repos', () => {
  it('se règle à tout moment, salon comme saison lancée', async () => {
    const t = demarrer();
    const { createur } = await pretsALancer(t);
    await t.mutation(api.joueurs.reglerPlageRepos, { jeton: createur, debutMinutes: 22 * 60, finMinutes: 6 * 60 });
    await t.mutation(api.saisons.lancer, { jeton: createur });
    await t.mutation(api.joueurs.reglerPlageRepos, { jeton: createur, debutMinutes: 0, finMinutes: 8 * 60 });
    const vue = await t.query(api.vue.vueJoueur, { jeton: createur });
    expect(vue.moi.plageRepos).toEqual({ debutMinutes: 0, finMinutes: 8 * 60 });
    await expect(
      t.mutation(api.joueurs.reglerPlageRepos, { jeton: createur, debutMinutes: -1, finMinutes: 0 }),
    ).rejects.toThrow('plage invalide');
  });
});
