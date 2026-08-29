import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import {
  MESSAGE_MAX_CHARS,
  MESSAGE_MIN_INTERVAL_MS,
  TELEGRAPH_DEPTH,
} from '../src/domain/telegraph';
import schema from './schema';
import { modules } from './test.setup';

/**
 * **Le télégraphe est un canal général et rien d'autre**, et ce qu'on éprouve ici tient en
 * quatre lignes : qui a le droit d'écrire, ce qu'une ligne a le droit de peser, à quelle
 * cadence, et à qui elle arrive. La quatrième est la seule qui soit une faute de fond — deux
 * saisons se tiennent en base en même temps, et un fil qui traverserait servirait les vannes
 * d'une partie aux joueurs d'une autre.
 */
const boot = () => convexTest(schema, modules);

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

async function lobby(t: ReturnType<typeof boot>, host: string, visitor: string) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: host,
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: visitor });
  return { token, guest };
}

async function launched(t: ReturnType<typeof boot>, host: string, visitor: string) {
  const { token, guest } = await lobby(t, host, visitor);
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.chooseDoctrine, { token, doctrine: 'hegemony' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.chooseDoctrine, { token: guest, doctrine: 'domination' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  return { token, guest };
}

/** The whole season put out of play, the way the victory pass leaves it. */
async function conclude(t: ReturnType<typeof boot>) {
  await t.run(async (ctx) => {
    const season = (await ctx.db.query('seasons').first())!;
    await ctx.db.patch(season._id, { status: 'concluded', concludedAt: Date.now() });
  });
}

describe('le télégraphe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('s’écrit dès le salon — on se chambre en attendant le lancement', async () => {
    const t = boot();
    const { token, guest } = await lobby(t, 'Pierre', 'Léa');
    await t.mutation(api.messages.post, { token, text: 'alors, on se décide ?' });

    const seen = await t.query(api.messages.recent, { token: guest });
    expect(seen.messages.map((message) => message.text)).toEqual(['alors, on se décide ?']);
    expect(seen.messages[0]!.nickname).toBe('Pierre');
    expect(seen.messages[0]!.mine).toBe(false);
  });

  it('se refuse à un jeton que personne ne connaît', async () => {
    const t = boot();
    await lobby(t, 'Pierre', 'Léa');
    await expect(
      t.mutation(api.messages.post, { token: 'inconnu', text: 'bonjour' }),
    ).rejects.toThrow('UNKNOWN_TOKEN');
  });

  it('se ferme sur une saison conclue — elle se relit, elle ne s’écrit plus', async () => {
    const t = boot();
    const { token } = await launched(t, 'Pierre', 'Léa');
    await conclude(t);
    await expect(t.mutation(api.messages.post, { token, text: 'beau jeu' })).rejects.toThrow(
      'SEASON_CONCLUDED',
    );
    // Read back, though: a concluded season is exactly the one somebody re-reads.
    await expect(t.query(api.messages.recent, { token })).resolves.toBeTruthy();
  });

  it('borne la ligne, et refuse la ligne vide', async () => {
    const t = boot();
    const { token } = await launched(t, 'Pierre', 'Léa');

    await expect(t.mutation(api.messages.post, { token, text: '   ' })).rejects.toThrow(
      'EMPTY_MESSAGE',
    );
    await expect(
      t.mutation(api.messages.post, { token, text: 'a'.repeat(MESSAGE_MAX_CHARS + 1) }),
    ).rejects.toThrow('MESSAGE_TOO_LONG');

    await t.mutation(api.messages.post, { token, text: 'a'.repeat(MESSAGE_MAX_CHARS) });
    const seen = await t.query(api.messages.recent, { token });
    expect(seen.messages).toHaveLength(1);
    expect(seen.messages[0]!.text).toHaveLength(MESSAGE_MAX_CHARS);
  });

  it('ne prend qu’un message par seconde et par joueur', async () => {
    const t = boot();
    const { token, guest } = await launched(t, 'Pierre', 'Léa');

    await t.mutation(api.messages.post, { token, text: 'premier' });
    await expect(t.mutation(api.messages.post, { token, text: 'second' })).rejects.toThrow(
      'TELEGRAPH_TOO_FAST',
    );
    // La garde est par joueur : elle ne bâillonne pas le voisin.
    await t.mutation(api.messages.post, { token: guest, text: 'chez moi ça passe' });

    vi.setSystemTime(MIDDAY.getTime() + MESSAGE_MIN_INTERVAL_MS);
    await t.mutation(api.messages.post, { token, text: 'une seconde plus tard' });
    const seen = await t.query(api.messages.recent, { token });
    expect(seen.messages.map((message) => message.text)).toEqual([
      'premier',
      'chez moi ça passe',
      'une seconde plus tard',
    ]);
  });

  it('cloisonne deux saisons : le fil de A est invisible de B', async () => {
    const t = boot();
    const here = await lobby(t, 'Pierre', 'Léa');
    const elsewhere = await lobby(t, 'Marc', 'Sonia');

    await t.mutation(api.messages.post, { token: here.token, text: 'ici' });
    await t.mutation(api.messages.post, { token: elsewhere.token, text: 'ailleurs' });

    expect(
      (await t.query(api.messages.recent, { token: here.guest })).messages.map((m) => m.text),
    ).toEqual(['ici']);
    expect(
      (await t.query(api.messages.recent, { token: elsewhere.guest })).messages.map((m) => m.text),
    ).toEqual(['ailleurs']);
  });

  it('sert la fin du fil, pas l’archive', async () => {
    const t = boot();
    const { token } = await launched(t, 'Pierre', 'Léa');
    const posted = TELEGRAPH_DEPTH + 5;
    for (let rank = 0; rank < posted; rank += 1) {
      vi.setSystemTime(MIDDAY.getTime() + rank * MESSAGE_MIN_INTERVAL_MS);
      await t.mutation(api.messages.post, { token, text: `ligne ${rank}` });
    }

    const seen = await t.query(api.messages.recent, { token });
    expect(seen.messages).toHaveLength(TELEGRAPH_DEPTH);
    expect(seen.messages[0]!.text).toBe(`ligne ${posted - TELEGRAPH_DEPTH}`);
    expect(seen.messages.at(-1)!.text).toBe(`ligne ${posted - 1}`);
  });

  it('date la lecture à la fermeture, dans un champ à lui', async () => {
    const t = boot();
    const { token } = await launched(t, 'Pierre', 'Léa');
    expect((await t.query(api.messages.recent, { token })).readAt).toBeNull();

    await t.mutation(api.messages.markRead, { token });
    expect((await t.query(api.messages.recent, { token })).readAt).toBe(MIDDAY.getTime());
    // Le journal garde le sien : une fenêtre lue n'en tait pas une autre.
    const player = await t.run(async (ctx) =>
      ctx.db
        .query('players')
        .withIndex('byToken', (q) => q.eq('token', token))
        .unique(),
    );
    expect(player!.journalReadAt).toBeUndefined();
  });
});
