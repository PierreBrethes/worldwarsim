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
import { foundSeat, joinSeat, seatDoc } from './seats.fixture';

/**
 * **Le télégraphe est un canal général et rien d'autre**, et ce qu'on éprouve ici tient en
 * quatre lignes : qui a le droit d'écrire, ce qu'une ligne a le droit de peser, à quelle
 * cadence, et à qui elle arrive. La quatrième est la seule qui soit une faute de fond — deux
 * saisons se tiennent en base en même temps, et un fil qui traverserait servirait les vannes
 * d'une partie aux joueurs d'une autre.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

async function lobby(t: ReturnType<typeof boot>, host: string, visitor: string) {
  const { seat, code } = await foundSeat(t, host, 48, 0.5);
  const guest = await joinSeat(t, code, visitor);
  return { seat, guest };
}

async function launched(t: ReturnType<typeof boot>, host: string, visitor: string) {
  const { seat, guest } = await lobby(t, host, visitor);
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest };
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
    const { seat, guest } = await lobby(t, 'Pierre', 'Léa');
    await t.mutation(api.messages.post, { ...seat, text: 'alors, on se décide ?' });

    const seen = await t.query(api.messages.recent, guest);
    expect(seen.messages.map((message) => message.text)).toEqual(['alors, on se décide ?']);
    expect(seen.messages[0]!.nickname).toBe('Pierre');
    expect(seen.messages[0]!.mine).toBe(false);
  });

  it('se refuse à une session que personne ne connaît', async () => {
    const t = boot();
    const { seat } = await lobby(t, 'Pierre', 'Léa');
    await expect(
      t.mutation(api.messages.post, { ...seat, token: 'inconnu', text: 'bonjour' }),
    ).rejects.toThrow('UNKNOWN_SESSION');
  });

  it('se ferme sur une saison conclue — elle se relit, elle ne s’écrit plus', async () => {
    const t = boot();
    const { seat } = await launched(t, 'Pierre', 'Léa');
    await conclude(t);
    await expect(t.mutation(api.messages.post, { ...seat, text: 'beau jeu' })).rejects.toThrow(
      'SEASON_CONCLUDED',
    );
    // Read back, though: a concluded season is exactly the one somebody re-reads.
    await expect(t.query(api.messages.recent, seat)).resolves.toBeTruthy();
  });

  it('borne la ligne, et refuse la ligne vide', async () => {
    const t = boot();
    const { seat } = await launched(t, 'Pierre', 'Léa');

    await expect(t.mutation(api.messages.post, { ...seat, text: '   ' })).rejects.toThrow(
      'EMPTY_MESSAGE',
    );
    await expect(
      t.mutation(api.messages.post, { ...seat, text: 'a'.repeat(MESSAGE_MAX_CHARS + 1) }),
    ).rejects.toThrow('MESSAGE_TOO_LONG');

    await t.mutation(api.messages.post, { ...seat, text: 'a'.repeat(MESSAGE_MAX_CHARS) });
    const seen = await t.query(api.messages.recent, seat);
    expect(seen.messages).toHaveLength(1);
    expect(seen.messages[0]!.text).toHaveLength(MESSAGE_MAX_CHARS);
  });

  it('ne prend qu’un message par seconde et par joueur', async () => {
    const t = boot();
    const { seat, guest } = await launched(t, 'Pierre', 'Léa');

    await t.mutation(api.messages.post, { ...seat, text: 'premier' });
    await expect(t.mutation(api.messages.post, { ...seat, text: 'second' })).rejects.toThrow(
      'TELEGRAPH_TOO_FAST',
    );
    // La garde est par joueur : elle ne bâillonne pas le voisin.
    await t.mutation(api.messages.post, { ...guest, text: 'chez moi ça passe' });

    vi.setSystemTime(MIDDAY.getTime() + MESSAGE_MIN_INTERVAL_MS);
    await t.mutation(api.messages.post, { ...seat, text: 'une seconde plus tard' });
    const seen = await t.query(api.messages.recent, seat);
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

    await t.mutation(api.messages.post, { ...here.seat, text: 'ici' });
    await t.mutation(api.messages.post, { ...elsewhere.seat, text: 'ailleurs' });

    expect((await t.query(api.messages.recent, here.guest)).messages.map((m) => m.text)).toEqual([
      'ici',
    ]);
    expect(
      (await t.query(api.messages.recent, elsewhere.guest)).messages.map((m) => m.text),
    ).toEqual(['ailleurs']);
  });

  it('sert la fin du fil, pas l’archive', async () => {
    const t = boot();
    const { seat } = await launched(t, 'Pierre', 'Léa');
    const posted = TELEGRAPH_DEPTH + 5;
    for (let rank = 0; rank < posted; rank += 1) {
      vi.setSystemTime(MIDDAY.getTime() + rank * MESSAGE_MIN_INTERVAL_MS);
      await t.mutation(api.messages.post, { ...seat, text: `ligne ${rank}` });
    }

    const seen = await t.query(api.messages.recent, seat);
    expect(seen.messages).toHaveLength(TELEGRAPH_DEPTH);
    expect(seen.messages[0]!.text).toBe(`ligne ${posted - TELEGRAPH_DEPTH}`);
    expect(seen.messages.at(-1)!.text).toBe(`ligne ${posted - 1}`);
  });

  it('date la lecture à la fermeture, dans un champ à lui', async () => {
    const t = boot();
    const { seat } = await launched(t, 'Pierre', 'Léa');
    expect((await t.query(api.messages.recent, seat)).readAt).toBeNull();

    await t.mutation(api.messages.markRead, seat);
    expect((await t.query(api.messages.recent, seat)).readAt).toBe(MIDDAY.getTime());
    // Le journal garde le sien : une fenêtre lue n'en tait pas une autre.
    const player = await seatDoc(t, seat);
    expect(player.journalReadAt).toBeUndefined();
  });
});
