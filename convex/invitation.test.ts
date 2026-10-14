import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import { MAX_PLAYERS } from './constants';
import { NATIONS } from '../src/domain/nations';
import { REGISTRATION_WINDOW_HOURS } from '../src/domain/off-season';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, signIn, type Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

/**
 * **L'invitation dit ce que `join` fera, sans rien changer.** Elle se lit sans session — c'est la
 * page qu'un ami ouvre avant d'avoir un compte — et ne rend jamais une exception : un code
 * inconnu est une réponse, que la page sait dire. Le code est le seul secret du salon : sans
 * place, ni `seasonId`, ni pseudos, ni nations prises ne sortent.
 */
const NOON = Date.UTC(2040, 0, 1, 12);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
});
afterEach(() => vi.useRealTimers());

async function ready(t: Bench, seat: Seat, rank: number) {
  await t.mutation(api.players.reserveNation, { ...seat, nation: NATIONS[rank]! });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
}

/** A lobby with `count` players, all ready, and the creator at the head. */
async function lobbyOf(t: Bench, count: number) {
  const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
  const seated = [seat];
  for (let rank = 1; rank < count; rank += 1) {
    seated.push(await joinSeat(t, code, `Joueur ${String(rank)}`));
  }
  for (const [rank, one] of seated.entries()) await ready(t, one, rank);
  return { creator: seat, code, seated };
}

describe('seasons.invitation', () => {
  it('answers an unknown code with a refusal, never an exception', async () => {
    const t = boot();
    const answer = await t.query(api.seasons.invitation, { code: 'ZZZZZZ' });
    expect(answer.refusal).toBe('UNKNOWN_GAME_CODE');
    expect(answer.seated).toBeNull();
  });

  it('answers a code the alphabet never draws the same way, without looking anything up', async () => {
    const t = boot();
    await foundSeat(t, 'Pierre', 48, 0.5);
    for (const code of ['K7Q2P0', 'abc', '']) {
      expect((await t.query(api.seasons.invitation, { code })).refusal).toBe('UNKNOWN_GAME_CODE');
    }
  });

  it('serves what is needed to decide to come in, and no more', async () => {
    const t = boot();
    const { code } = await foundSeat(t, 'Pierre', 48, 0.5);
    const answer = await t.query(api.seasons.invitation, { code });

    expect(answer).toEqual({
      refusal: null,
      founder: 'Pierre',
      players: 1,
      maximum: MAX_PLAYERS,
      mode: 'mondiale',
      theatre: null,
      status: 'lobby',
      durationHours: 48,
      registrationClosesAt: null,
      seated: null,
    });
  });

  it('gives no seasonId to somebody without a seat — anonymous, or signed in elsewhere', async () => {
    const t = boot();
    const { code } = await foundSeat(t, 'Pierre', 48, 0.5);
    const stranger = await signIn(t, 'Étranger');

    for (const args of [{ code }, { code, token: stranger }, { code, token: 'jeton-inconnu' }]) {
      const answer = await t.query(api.seasons.invitation, args);
      expect('seasonId' in answer).toBe(false);
      expect(answer.seated).toBeNull();
      expect(answer.refusal).toBeNull();
    }
  });

  it('gives the exact seat to the account that holds one', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
    const answer = await t.query(api.seasons.invitation, { code, token: seat.token });

    expect(answer.seated).toEqual({ seasonId: seat.seasonId, status: 'lobby', atWar: false });
    expect(answer.refusal).toBe('SEAT_TAKEN');
  });

  it('reads the same season whatever the case and the spaces around the code', async () => {
    const t = boot();
    const { code } = await foundSeat(t, 'Pierre', 48, 0.5);
    const typed = await t.query(api.seasons.invitation, { code: ` ${code.toLowerCase()} ` });

    expect(typed.founder).toBe('Pierre');
    expect(typed.refusal).toBeNull();
  });

  it('names the hour the registration closes on a running season', async () => {
    const t = boot();
    const { creator, code } = await lobbyOf(t, 2);
    await t.mutation(api.seasons.launch, creator);

    const answer = await t.query(api.seasons.invitation, { code });
    expect(answer.status).toBe('launched');
    expect(answer.registrationClosesAt).toBe(NOON + REGISTRATION_WINDOW_HOURS * 3_600_000);
  });
});

/**
 * **Même fonction, même code** (ADR 0015) : dans chaque cas, ce que l'invitation annonce à un
 * arrivant est exactement ce que `join` lui répond.
 */
describe('the invitation and join refuse alike', () => {
  const joinCode = async (t: Bench, token: string, code: string): Promise<string | null> => {
    try {
      await t.mutation(api.seasons.join, { token, code });
      return null;
    } catch (error) {
      return (error as { data?: { code?: string } }).data?.code ?? 'UNEXPECTED';
    }
  };

  const scenarios: ReadonlyArray<
    readonly [name: string, expected: string | null, build: (t: Bench) => Promise<string>]
  > = [
    ['an open lobby', null, async (t) => (await lobbyOf(t, 2)).code],
    [
      'a launched season inside the window',
      null,
      async (t) => {
        const { creator, code } = await lobbyOf(t, 2);
        await t.mutation(api.seasons.launch, creator);
        return code;
      },
    ],
    [
      'a launched season after the window',
      'REGISTRATION_CLOSED',
      async (t) => {
        const { creator, code } = await lobbyOf(t, 2);
        await t.mutation(api.seasons.launch, creator);
        vi.setSystemTime(NOON + (REGISTRATION_WINDOW_HOURS * 3_600_000 + 1));
        return code;
      },
    ],
    [
      'a concluded season',
      'SEASON_CONCLUDED',
      async (t) => {
        const { creator, code } = await lobbyOf(t, 2);
        await t.run(async (ctx) => ctx.db.patch(creator.seasonId, { status: 'concluded' }));
        return code;
      },
    ],
    [
      'a full lobby',
      'LOBBY_FULL',
      async (t) => {
        const { code } = await foundSeat(t, 'Pierre', 48, 0.5);
        for (let rank = 1; rank < MAX_PLAYERS; rank += 1) {
          await joinSeat(t, code, `Joueur ${String(rank)}`);
        }
        return code;
      },
    ],
    [
      'a running season with no free nation left',
      'NO_FREE_NATION',
      async (t) => {
        const { creator, code } = await lobbyOf(t, NATIONS.length);
        await t.mutation(api.seasons.launch, creator);
        return code;
      },
    ],
  ];

  it.each(scenarios)('%s', async (_name, expected, build) => {
    const t = boot();
    const code = await build(t);
    const token = await signIn(t, 'Arrivant');

    const announced = (await t.query(api.seasons.invitation, { code, token })).refusal;
    expect(announced).toBe(expected);
    expect(await joinCode(t, token, code)).toBe(announced);
  });

  it('a seat already held, first of all', async () => {
    const t = boot();
    const { creator, code } = await lobbyOf(t, 2);
    await t.mutation(api.seasons.launch, creator);
    vi.setSystemTime(NOON + (REGISTRATION_WINDOW_HOURS * 3_600_000 + 1));

    const announced = (await t.query(api.seasons.invitation, { code, token: creator.token }))
      .refusal;
    expect(announced).toBe('SEAT_TAKEN');
    expect(await joinCode(t, creator.token, code)).toBe('SEAT_TAKEN');
  });

  it('lets a lowercase code with spaces join the same season', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
    const token = await signIn(t, 'Arrivant');

    const joined = await t.mutation(api.seasons.join, { token, code: ` ${code.toLowerCase()} ` });
    expect(joined.seasonId).toBe(seat.seasonId);
  });
});
