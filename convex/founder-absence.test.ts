import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { FOUNDER_ABSENCE_HOURS, PRESENCE_THROTTLE_MIN } from './constants';
import schema from './schema';
import { modules } from './test.setup';

/**
 * **Une saison dont le fondateur ne revient plus reste clôturable.** La capitulation transmettait
 * déjà le titre au doyen (`players.surrender`) ; le trou qui restait est l'abandon *silencieux* —
 * personne ne quitte, la saison court sans horloge et `conclude` répond `CREATOR_ONLY` à tout le
 * monde. Ce qui est gravé ici est donc surtout ce qui **ne** bouge **pas** : le titre reste au
 * fondateur, `destroy` reste à lui seul, et la présence des autres joueurs ne sort jamais.
 */

const boot = () => convexTest(schema, modules);

const MIDDAY = new Date(2026, 8, 6, 12, 0, 0);
const HOUR = 3_600_000;

const NATIONS = ['france', 'ussr', 'germany', 'japan'] as const;

async function launchedSeason(t: ReturnType<typeof boot>, players: number) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: null,
    compensation: 0.5,
  });
  const tokens = [token];
  for (let seat = 1; seat < players; seat += 1) {
    const joined = await t.mutation(api.seasons.join, { code, nickname: `Joueur ${seat}` });
    tokens.push(joined.token);
  }
  for (const [seat, seated] of tokens.entries()) {
    await t.mutation(api.players.reserveNation, { token: seated, nation: NATIONS[seat]! });
    await t.mutation(api.players.declareReady, { token: seated, ready: true });
  }
  await t.mutation(api.seasons.launch, { token });
  return tokens;
}

const playerOf = (t: ReturnType<typeof boot>, token: string) =>
  t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    return player;
  });

const seasonOf = (t: ReturnType<typeof boot>) =>
  t.run(async (ctx) => (await ctx.db.query('seasons').collect())[0]!);

/** On antidate la présence plutôt que d'avancer l'horloge de plusieurs jours : c'est la même
 *  distance, et le reste de la saison ne vieillit pas sous les pieds du test. */
async function seenHoursAgo(t: ReturnType<typeof boot>, token: string, hours: number) {
  const player = await playerOf(t, token);
  await t.run(async (ctx) =>
    ctx.db.patch(player._id as Id<'players'>, { lastSeenAt: Date.now() - hours * HOUR }),
  );
}

const codeOf = async (call: Promise<unknown>) => {
  try {
    await call;
    return null;
  } catch (error) {
    return (error as { data?: { code?: string } }).data?.code ?? null;
  }
};

describe('fondateur absent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('refuse au doyen tant que le fondateur a été vu sous le seuil', async () => {
    const t = boot();
    const [founder, elder] = await launchedSeason(t, 3);
    await seenHoursAgo(t, founder!, FOUNDER_ABSENCE_HOURS - 1);

    expect(await codeOf(t.mutation(api.seasons.conclude, { token: elder! }))).toBe(
      'FOUNDER_STILL_PRESENT',
    );
    expect((await seasonOf(t)).status).toBe('launched');
  });

  it('ouvre la clôture au doyen passé le seuil, et à lui seul', async () => {
    const t = boot();
    const [founder, elder, cadet] = await launchedSeason(t, 3);
    await seenHoursAgo(t, founder!, FOUNDER_ABSENCE_HOURS + 1);

    expect(await codeOf(t.mutation(api.seasons.conclude, { token: cadet! }))).toBe('CREATOR_ONLY');

    await t.mutation(api.seasons.conclude, { token: elder! });
    const season = await seasonOf(t);
    expect(season.status).toBe('concluded');
    /** Le comportement de `conclude` est inchangé : personne n'a gagné, et la porte n'a fait
     *  que changer de main. */
    expect(season.winnerId ?? null).toBeNull();

    /** Le titre n'a pas bougé — la porte s'ouvre, elle ne se transmet pas. */
    expect((await playerOf(t, founder!)).creator).toBe(true);
    expect((await playerOf(t, elder!)).creator).toBe(false);
  });

  it('fait foi du lancement quand la présence n’a jamais été écrite', async () => {
    const t = boot();
    const [, elder] = await launchedSeason(t, 3);

    expect(await codeOf(t.mutation(api.seasons.conclude, { token: elder! }))).toBe(
      'FOUNDER_STILL_PRESENT',
    );

    vi.setSystemTime(MIDDAY.getTime() + (FOUNDER_ABSENCE_HOURS + 1) * HOUR);
    await t.mutation(api.seasons.conclude, { token: elder! });
    expect((await seasonOf(t)).status).toBe('concluded');
  });

  it('vise le fondateur courant, celui que la capitulation a désigné', async () => {
    const t = boot();
    const [founder, elder, cadet] = await launchedSeason(t, 3);
    /** Le titre passe au doyen ; le doyen du *nouveau* fondateur est le cadet. */
    await t.mutation(api.players.surrender, { token: founder! });
    await seenHoursAgo(t, elder!, FOUNDER_ABSENCE_HOURS + 1);

    /** Le fondateur d'hier a beau être absent depuis toujours, il n'est plus la mesure. */
    await seenHoursAgo(t, founder!, FOUNDER_ABSENCE_HOURS * 4);

    await t.mutation(api.seasons.conclude, { token: cadet! });
    expect((await seasonOf(t)).status).toBe('concluded');
  });

  it('n’écrit qu’une présence par fenêtre', async () => {
    const t = boot();
    const [founder] = await launchedSeason(t, 3);

    await t.mutation(api.players.touch, { token: founder! });
    const first = (await playerOf(t, founder!)).lastSeenAt;
    expect(first).toBe(MIDDAY.getTime());

    vi.setSystemTime(MIDDAY.getTime() + 10 * 60_000);
    await t.mutation(api.players.touch, { token: founder! });
    expect((await playerOf(t, founder!)).lastSeenAt).toBe(first);

    vi.setSystemTime(MIDDAY.getTime() + (PRESENCE_THROTTLE_MIN + 1) * 60_000);
    await t.mutation(api.players.touch, { token: founder! });
    expect((await playerOf(t, founder!)).lastSeenAt).toBe(Date.now());
  });

  it('ne se tait ni sur un salon ni sur un défait', async () => {
    const t = boot();
    const { token: lobby } = await t.mutation(api.seasons.create, {
      nickname: 'Pierre',
      durationHours: null,
      compensation: 0.5,
    });
    await t.mutation(api.players.touch, { token: lobby });
    expect((await playerOf(t, lobby)).lastSeenAt).toBeUndefined();

    const [, guest] = await launchedSeason(t, 3);
    await t.mutation(api.players.surrender, { token: guest! });
    await t.mutation(api.players.touch, { token: guest! });
    expect((await playerOf(t, guest!)).lastSeenAt).toBeUndefined();
  });

  it('n’ouvre jamais la suppression au doyen', async () => {
    const t = boot();
    const [founder, elder] = await launchedSeason(t, 3);
    await seenHoursAgo(t, founder!, 100);

    expect(await codeOf(t.mutation(api.seasons.destroy, { token: elder! }))).toBe('CREATOR_ONLY');
    expect(await seasonOf(t)).not.toBeUndefined();
  });

  it('sert l’absence du fondateur près du seuil, et le bouton avec', async () => {
    const t = boot();
    const [founder, elder] = await launchedSeason(t, 3);

    /** Loin de la porte : pas de ligne, et le doyen n'a pas de bouton. */
    await seenHoursAgo(t, founder!, 1);
    const quiet = await t.query(api.view.playerView, { token: elder! });
    expect(quiet.me.founderAbsence).toBeNull();
    expect(quiet.me.mayConclude).toBe(false);

    await seenHoursAgo(t, founder!, FOUNDER_ABSENCE_HOURS - 3);
    const near = await t.query(api.view.playerView, { token: elder! });
    expect(near.me.founderAbsence?.hours).toBeCloseTo(FOUNDER_ABSENCE_HOURS - 3, 3);
    expect(near.me.mayConclude).toBe(false);

    await seenHoursAgo(t, founder!, FOUNDER_ABSENCE_HOURS + 1);
    const open = await t.query(api.view.playerView, { token: elder! });
    expect(open.me.founderAbsence?.concludeOpensAt).toBeLessThanOrEqual(Date.now());
    expect(open.me.mayConclude).toBe(true);
  });

  it('ne laisse jamais sortir la présence d’un autre joueur', async () => {
    const t = boot();
    const [founder, elder, cadet] = await launchedSeason(t, 3);
    for (const seat of [founder!, elder!, cadet!]) {
      await t.mutation(api.players.touch, { token: seat });
    }

    const view = await t.query(api.view.playerView, { token: cadet! });
    expect(JSON.stringify(view)).not.toContain('lastSeenAt');
  });
});
