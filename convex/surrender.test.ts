import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { regionFacts } from './regions';
import schema from './schema';
import { modules } from './test.setup';

/**
 * **Capituler : ce que ça éteint, et surtout ce que ça n'éteint pas** (`convex/players.ts`). Le
 * défait n'ordonne plus, mais il parle, ses troupes ripostent, et sa vue reste la sienne — c'est
 * cette moitié-là qui a besoin d'être gravée, parce que rien dans le code ne la porte : elle est
 * faite de tout ce qu'on n'a **pas** écrit.
 */

const boot = () => convexTest(schema, modules);

const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310'; // Roumain, le pays de personne — où les colonnes se rencontrent

/** Loin de toute plage de repos, pour que rien ne s'immobilise à une frontière. */
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

const NATIONS = ['france', 'ussr', 'germany', 'japan'] as const;

async function launchedSeason(t: ReturnType<typeof boot>, players: number) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: 48,
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

const noticesOf = (t: ReturnType<typeof boot>, playerId: Id<'players'>) =>
  t.run(async (ctx) =>
    ctx.db
      .query('notices')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );

async function raise(t: ReturnType<typeof boot>, token: string, regionId: string) {
  const player = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key: 'barracks' as const,
      regionId,
      level: 1,
      outpostId: null,
    }),
  );
}

/** Une troupe formée sans la payer : ce qui est sous test n'est pas la production. */
async function form(
  t: ReturnType<typeof boot>,
  token: string,
  stationedAt: Id<'buildings'> | Id<'outposts'> | { lon: number; lat: number } | null,
) {
  const player = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: player._id,
      role: 'infantry' as const,
      tier: 1 as const,
      nominalStrength: 50,
      currentStrength: 50,
      stationedAt,
    }),
  );
}

const strengthOf = (t: ReturnType<typeof boot>, troopId: Id<'troops'>) =>
  t.run(async (ctx) => (await ctx.db.get(troopId))!.currentStrength);

describe('capituler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('ferme les ordres et laisse le télégraphe ouvert', async () => {
    const t = boot();
    const [creator, guest] = await launchedSeason(t, 3);

    await t.mutation(api.players.surrender, { token: guest! });

    // La porte commune : une seule, et elle tient toutes les surfaces d'action.
    await expect(
      t.mutation(api.constructions.start, {
        token: guest!,
        building: 'billets',
        regionId: MARNE,
      }),
    ).rejects.toThrow('PLAYER_DEFEATED');
    await expect(
      t.mutation(api.troops.recruit, {
        token: guest!,
        buildingId: await raise(t, guest!, MARNE),
        role: 'infantry',
        tier: 1,
      }),
    ).rejects.toThrow('PLAYER_DEFEATED');
    await expect(
      t.mutation(api.industry.order, { token: guest!, chain: 'arsenal', quantity: 1 }),
    ).rejects.toThrow('PLAYER_DEFEATED');

    // Un observateur parle : c'est la seule surface qu'on lui laisse entière.
    await t.mutation(api.messages.post, { token: guest!, text: 'je me retire, bonne chasse' });
    const thread = await t.query(api.messages.recent, { token: creator! });
    expect(thread.messages.map((message) => message.text)).toContain('je me retire, bonne chasse');

    // Irréversible : le second geste ne rejoue pas les dépêches.
    await expect(t.mutation(api.players.surrender, { token: guest! })).rejects.toThrow(
      'PLAYER_DEFEATED',
    );
  });

  it('dépose une dépêche publique chez tout le monde', async () => {
    const t = boot();
    const [creator, guest, third] = await launchedSeason(t, 3);

    await t.mutation(api.players.surrender, { token: third! });

    for (const token of [creator!, guest!, third!]) {
      const filed = await noticesOf(t, (await playerOf(t, token))._id);
      const said = filed.filter((notice) => notice.kind === 'playerSurrendered');
      expect(said).toHaveLength(1);
      expect(said[0]).toMatchObject({ nation: 'germany' });
    }
  });

  it('passe le commandement au plus ancien joueur non défait', async () => {
    const t = boot();
    // Quatre sièges pour qu'il en reste deux debout : à trois, la seconde capitulation
    // conclurait la saison et le titre n'aurait plus rien à commander.
    const [creator, guest, third] = await launchedSeason(t, 4);

    // Le deuxième siège capitule d'abord : le titre doit sauter par-dessus lui.
    await t.mutation(api.players.surrender, { token: guest! });
    await t.mutation(api.players.surrender, { token: creator! });

    expect((await playerOf(t, creator!)).creator).toBe(false);
    expect((await playerOf(t, guest!)).creator).toBe(false);
    expect((await playerOf(t, third!)).creator).toBe(true);

    // Un seul fondateur par saison, jamais zéro ni deux.
    const seats: ReadonlyArray<Doc<'players'>> = await t.run(async (ctx) =>
      ctx.db.query('players').collect(),
    );
    expect(seats.filter((seat) => seat.creator)).toHaveLength(1);

    // Et le pouvoir suit le titre : lui seul clôt, l'ancien fondateur ne clôt plus.
    await expect(t.mutation(api.seasons.conclude, { token: creator! })).rejects.toThrow(
      'CREATOR_ONLY',
    );
    const heard = await noticesOf(t, (await playerOf(t, third!))._id);
    expect(heard.filter((notice) => notice.kind === 'commandTransferred')).toMatchObject([
      { nation: 'germany' },
    ]);
    await t.mutation(api.seasons.conclude, { token: third! });
    expect((await seasonOf(t)).status).toBe('concluded');
  });

  it('donne la saison au dernier debout quand l’avant-dernier capitule', async () => {
    const t = boot();
    const [creator, guest, third] = await launchedSeason(t, 3);

    await t.mutation(api.players.surrender, { token: creator! });
    expect((await seasonOf(t)).status).toBe('launched');

    await t.mutation(api.players.surrender, { token: guest! });
    const season = await seasonOf(t);
    expect(season.status).toBe('concluded');
    // Une victoire, pas une clôture administrative : elle nomme quelqu'un.
    expect(season.winnerId).toBe((await playerOf(t, third!))._id);
    expect(season.concludedAt).not.toBeNull();
  });

  it('laisse les troupes du défait riposter, et sa vue aveugle où elle l’était', async () => {
    const t = boot();
    // Trois sièges : à deux, la capitulation du défenseur conclurait la saison avant l'assaut.
    const [attacker, victim] = await launchedSeason(t, 3);
    const contested: LonLat = regionFacts(PRAHOVA)!.point;

    const barracks = await raise(t, attacker!, MARNE);
    const column = [await form(t, attacker!, barracks)];
    // Deux compagnies posées face à une seule : le camp du défait tient la passe assez
    // longtemps pour rendre les coups, ce qui est précisément ce qui est sous test.
    const defender = await form(t, victim!, { lon: contested[0], lat: contested[1] });
    await form(t, victim!, { lon: contested[0], lat: contested[1] });

    await t.mutation(api.players.surrender, { token: victim! });

    await t.mutation(api.movements.attack, {
      token: attacker!,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: column,
      target: { kind: 'point', point: { lon: contested[0], lat: contested[1] } },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // La garnison n'a pas besoin d'ordre (ADR 0019) : elle a rendu des coups.
    const engagements = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    expect(engagements).toHaveLength(1);
    expect(engagements[0]!.defenderId).toBe((await playerOf(t, victim!))._id);
    const strikes = await t.run(async (ctx) =>
      ctx.db
        .query('strikes')
        .withIndex('byEngagement', (q) => q.eq('engagementId', engagements[0]!._id))
        .collect(),
    );
    expect(strikes.filter((strike) => strike.bySide === 'defender').length).toBeGreaterThan(0);
    // Et il reste pillable : capituler n'est pas s'évaporer.
    expect(await strengthOf(t, defender)).toBeLessThan(50);

    // Sa vue est toujours la sienne : ni omniscience, ni fenêtre sur les colonnes adverses.
    const seen = await t.query(api.view.playerView, { token: victim! });
    expect(seen.me.defeated).toBe(true);
    // Sa vue est celle qu'elle était : aucun arc adverse ne lui est servi, et la capitulation
    // n'a rien débloqué. Lever le brouillard ici ferait d'elle un acte de renseignement.
    expect(seen.detected).toEqual([]);
    expect(seen.movements).toEqual([]);
  });

  it('ne se capitule pas d’un salon, ni d’un siège encore à la porte', async () => {
    const t = boot();
    const { code, token } = await t.mutation(api.seasons.create, {
      nickname: 'Pierre',
      durationHours: 48,
      compensation: 0.5,
    });
    await expect(t.mutation(api.players.surrender, { token })).rejects.toThrow(
      'SEASON_NOT_LAUNCHED',
    );

    const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
    await t.mutation(api.players.reserveNation, { token, nation: 'france' });
    await t.mutation(api.players.declareReady, { token, ready: true });
    await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
    await t.mutation(api.players.declareReady, { token: guest, ready: true });
    await t.mutation(api.seasons.launch, { token });

    const { token: latecomer } = await t.mutation(api.seasons.join, { code, nickname: 'Tard' });
    await expect(t.mutation(api.players.surrender, { token: latecomer })).rejects.toThrow(
      'NOT_AT_WAR',
    );
    // Et son siège ne gèle pas la fin : il ne compte pas parmi les belligérants debout.
    await t.mutation(api.players.surrender, { token: guest });
    expect((await seasonOf(t)).winnerId).toBe((await playerOf(t, token))._id);
  });

  it('dit « défaite » à l’accueil, sur la même saison', async () => {
    const t = boot();
    const [creator, guest] = await launchedSeason(t, 3);
    await t.mutation(api.players.surrender, { token: guest! });

    const seats = await t.query(api.seasons.previews, { tokens: [creator!, guest!] });
    expect(seats.map((seat) => seat.defeated)).toEqual([false, true]);
    expect(seats.every((seat) => seat.status === 'launched')).toBe(true);
  });
});
