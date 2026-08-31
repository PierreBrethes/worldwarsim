import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import type { LonLat } from '../src/domain/geo';
import { SEAT_INKS } from '../src/domain/control';
import { OUTPOST_REACH_KM } from './constants';
import { regionFacts } from './regions';
import schema from './schema';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

const PARIS = 'FRA-5333';
const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310'; // Romanian oil, nobody's home country
const RUHR = 'DEU-1572'; // German ground, far out of any Romanian reach

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  return { token, guest };
}

/** Posé à la main : ce qui est sous test est la couleur, pas la fondation d'un avant-poste — la
 *  marche qui le pose a ses propres tests (`movements.test.ts`). */
async function plant(t: ReturnType<typeof boot>, token: string, point: LonLat) {
  await t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId: player._id,
      point: { lon: point[0], lat: point[1] },
      hostCountry: 'ROU',
      level: 1,
      specialization: 'relay',
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    });
  });
}

const heldBy = async (t: ReturnType<typeof boot>, token: string, nickname: string) =>
  (await t.query(api.control.held, { token })).find((holder) => holder.nickname === nickname);

/** Un point à `km` à l'est d'un autre, à cette latitude — les cas ci-dessous se jouent juste
 *  en deçà ou juste au-delà de la portée. */
const eastOf = (point: LonLat, km: number): LonLat => [
  point[0] + km / (111.32 * Math.cos((point[1] * Math.PI) / 180)),
  point[1],
];

describe('the home ground is coloured from the launch', () => {
  it('holds the whole country of each nation, and nothing of the other’s', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);

    const mine = await heldBy(t, token, 'Pierre');
    expect(mine?.nation).toBe('france');
    expect(mine?.regionIds).toContain(PARIS);
    expect(mine?.regionIds).toContain(MARNE);
    expect(mine?.regionIds).not.toContain(RUHR);
    // La russe est là aussi : la couleur dit qui tient quoi, pas ce que ce joueur a vu — le
    // relevé et sa péremption sont l'étape suivante (ADR 0020 §5).
    expect((await heldBy(t, token, 'Léa'))?.nation).toBe('ussr');
  });

  it('gives each seat its own ink, in the order they entered', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const holders = await t.query(api.control.held, { token });
    expect(holders.map((holder) => holder.ink)).toEqual([SEAT_INKS[0], SEAT_INKS[1]]);
  });

  it('leaves a seat still choosing out of the answer entirely', async () => {
    const t = boot();
    const { code, token } = await t.mutation(api.seasons.create, {
      nickname: 'Pierre',
      durationHours: 48,
      compensation: 0.5,
    });
    await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
    expect(await t.query(api.control.held, { token })).toEqual([]);
  });
});

describe('an outpost colours what it reaches', () => {
  it('takes the neutral regions inside the reach and none beyond it', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, token, prahova);

    const mine = await heldBy(t, token, 'Pierre');
    expect(mine?.regionIds).toContain(PRAHOVA);
    // Le sol allemand reste allemand : personne ne joue l'Allemagne, mais il est à mille
    // kilomètres de la Valachie et aucun avant-poste ne le couvre.
    expect(mine?.regionIds).not.toContain(RUHR);
    // Et le pays d'origine ne bouge pas : un avant-poste ajoute, il ne remplace pas.
    expect(mine?.regionIds).toContain(PARIS);
  });

  /** Poser un avant-poste chez quelqu'un donne le droit d'y bâtir, jamais celui d'y tenir le
   *  sol : une nation n'est jamais annexée (ADR 0004). */
  it('never takes a nation’s ground from under it', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    await plant(t, guest, regionFacts(PARIS)!.point);

    expect((await heldBy(t, token, 'Pierre'))?.regionIds).toContain(PARIS);
    expect((await heldBy(t, token, 'Léa'))?.regionIds).not.toContain(PARIS);
  });

  it('gives a disputed region to the nearest outpost', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, token, eastOf(prahova, OUTPOST_REACH_KM / 2));
    await plant(t, guest, eastOf(prahova, -OUTPOST_REACH_KM / 4));

    expect((await heldBy(t, token, 'Léa'))?.regionIds).toContain(PRAHOVA);
    expect((await heldBy(t, token, 'Pierre'))?.regionIds).not.toContain(PRAHOVA);
  });
});
