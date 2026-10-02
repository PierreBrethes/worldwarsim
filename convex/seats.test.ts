import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { foundSeat, joinSeat, seatIn, seatsOf, signIn } from './seats.fixture';
import { modules } from './test.setup';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const seasonDoc = (t: Bench, seasonId: Id<'seasons'>) => t.run((ctx) => ctx.db.get(seasonId));

/** Une saison d'avant la dénormalisation du 12/09 : elle ne porte ni le compte des places, ni
 *  la nation du vainqueur, et rien ne l'y oblige (`v.optional`). */
const unmigrate = (t: Bench, seasonId: Id<'seasons'>) =>
  t.run((ctx) => ctx.db.patch(seasonId, { playerCount: undefined, winnerNation: undefined }));

/**
 * **Le compte possède ses places** (ADR 0022). Ce que cette suite tient, c'est la porte
 * elle-même : qui entre, avec quoi, et ce que trois refus différents disent. Les règles du jeu,
 * elles, sont testées derrière — chacune dans son fichier, toutes par le même helper de place.
 */
describe('une place par compte et par saison', () => {
  it('refuse la seconde place du même compte dans la même saison', async () => {
    const t = boot();
    const { code } = await foundSeat(t);
    const token = await signIn(t, 'Léa');

    await t.mutation(api.seasons.join, { token, code });
    await expect(t.mutation(api.seasons.join, { token, code })).rejects.toThrow('SEAT_TAKEN');
  });

  it('en donne deux dans deux saisons, et les liste avec leur aperçu', async () => {
    const t = boot();
    const token = await signIn(t, 'Pierre');
    const first = await t.mutation(api.seasons.create, {
      token,
      durationHours: 48,
      compensation: 0.5,
    });
    const second = await t.mutation(api.seasons.create, {
      token,
      durationHours: null,
      compensation: 0.5,
    });

    expect(await t.query(api.accounts.me, { token })).toEqual({ nickname: 'Pierre' });
    expect(await t.query(api.accounts.seats, { token })).toEqual([
      expect.objectContaining({ seasonId: first.seasonId, code: first.code, creator: true }),
      expect.objectContaining({ seasonId: second.seasonId, code: second.code, creator: true }),
    ]);
  });

  /** Le pseudo du compte, copié à l'entrée : c'est lui que le salon montre, sans qu'on l'ait
   *  redemandé. */
  it('assoit le joueur sous le pseudo de son compte', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    expect((await t.query(api.seasons.lobby, seat)).me.nickname).toBe('Pierre');
  });
});

/**
 * **La porte ne lit plus les tables de jeu** (révision du 12/09 de l'ADR 0022). `me` ne dit que
 * le pseudo, et la liste des parties est une requête à part, servie au seul écran d'accueil. Ce
 * que cette suite tient, c'est que la dénormalisation qui l'a rendue légère dit la même chose
 * que le comptage qu'elle remplace.
 */
describe('les places du compte, sans compter les joueurs', () => {
  it('tient le compte des places à l’entrée', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre');
    expect((await seasonDoc(t, seat.seasonId))?.playerCount).toBe(1);

    await joinSeat(t, code, 'Léa');
    expect((await seasonDoc(t, seat.seasonId))?.playerCount).toBe(2);
    expect((await seatsOf(t, seat))[0]?.players).toBe(2);
  });

  /** La sortie d'une place est la mise au rebut de sa saison, et elle emporte les deux : ce qui
   *  se vérifie, c'est qu'il ne reste rien à lister. */
  it('ne liste plus rien après la mise au rebut', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre');
    const guest = await joinSeat(t, code, 'Léa');
    await t.mutation(api.seasons.destroy, seat);

    expect(await seatsOf(t, seat)).toEqual([]);
    expect(await seatsOf(t, guest)).toEqual([]);
  });

  it('sert la même ligne sur une saison d’avant la dénormalisation', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre');
    await joinSeat(t, code, 'Léa');
    const migrated = await seatsOf(t, seat);

    await unmigrate(t, seat.seasonId);
    expect(await seatsOf(t, seat)).toEqual(migrated);
  });

  it('nomme le vainqueur d’une saison conclue avant que sa nation y soit gravée', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre');
    const guest = await joinSeat(t, code, 'Léa');
    await t.mutation(api.players.reserveNation, { ...guest, nation: 'france' });
    await t.run(async (ctx) => {
      const winner = await seatIn(ctx, guest);
      await ctx.db.patch(seat.seasonId, {
        status: 'concluded',
        winnerId: winner._id,
        concludedAt: Date.now(),
      });
    });
    await unmigrate(t, seat.seasonId);

    expect((await seatsOf(t, seat))[0]?.winnerNation).toBe('france');
  });

  it('la migration pose le compte et la nation sur les saisons d’avant', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre');
    const guest = await joinSeat(t, code, 'Léa');
    await t.mutation(api.players.reserveNation, { ...guest, nation: 'france' });
    await t.run(async (ctx) => {
      const winner = await seatIn(ctx, guest);
      await ctx.db.patch(seat.seasonId, {
        status: 'concluded',
        winnerId: winner._id,
        concludedAt: Date.now(),
      });
    });
    await unmigrate(t, seat.seasonId);

    expect(await t.mutation(internal.dev.backfillSeasonPreview, {})).toEqual({ seasons: 1 });
    const season = await seasonDoc(t, seat.seasonId);
    expect(season?.playerCount).toBe(2);
    expect(season?.winnerNation).toBe('france');
  });
});

describe('les trois refus de la porte', () => {
  it('refuse une session inconnue', async () => {
    const t = boot();
    const { seat } = await foundSeat(t);
    await expect(t.query(api.seasons.lobby, { ...seat, token: 'inconnu' })).rejects.toThrow(
      'UNKNOWN_SESSION',
    );
  });

  it('refuse une session valide sans place dans la saison demandée', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    const outsider = await signIn(t, 'Léa');
    await expect(
      t.query(api.seasons.lobby, { token: outsider, seasonId: seat.seasonId }),
    ).rejects.toThrow('NO_SEAT');
  });

  /** **Une place dans une autre saison n'ouvre pas celle-ci.** C'est le cloisonnement que le
   *  jeton de partie tenait par accident, et que la paire session + saison doit tenir exprès. */
  it('refuse une place prise dans une autre saison', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    const elsewhere = await foundSeat(t, 'Léa');
    await expect(
      t.query(api.seasons.lobby, { token: elsewhere.seat.token, seasonId: seat.seasonId }),
    ).rejects.toThrow('NO_SEAT');
  });
});

describe('la place et l’appareil', () => {
  /**
   * **Ce pour quoi le compte existe** (ADR 0022) : la place obtenue le matin au bureau se joue
   * le soir au téléphone. Une seconde session du même compte est un second appareil, et elle
   * ouvre la même place.
   */
  it('se joue depuis une seconde session du même compte', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre');
    const guest = await joinSeat(t, code, 'Léa');
    await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });

    const phone = await t.run(async (ctx) => {
      const session = await ctx.db
        .query('sessions')
        .withIndex('byToken', (q) => q.eq('token', seat.token))
        .unique();
      const now = Date.now();
      await ctx.db.insert('sessions', {
        accountId: session!.accountId,
        token: 'téléphone',
        createdAt: now,
        lastSeenAt: now,
      });
      return 'téléphone';
    });

    const from = { token: phone, seasonId: seat.seasonId };
    expect((await t.query(api.seasons.lobby, from)).me.nation).toBe('france');
    await t.mutation(api.players.declareReady, { ...from, ready: true });
    expect((await t.query(api.seasons.lobby, guest)).me.creator).toBe(false);
    expect((await t.query(api.seasons.lobby, from)).me.ready).toBe(true);
  });
});

describe('ce que la vue ne sert jamais', () => {
  /**
   * **Le compte ne traverse pas la frontière.** `PlayerView` est le nom qui dit ce qu'un joueur
   * a le droit de voir ; un `accountId` ou un jeton qui s'y glisserait serait une identité
   * durable servie à un adversaire, et rien dans l'écran ne l'aurait montré.
   */
  it('ne sert ni compte, ni jeton, ni empreinte de mot de passe', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre');
    const guest = await joinSeat(t, code, 'Léa');
    await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...seat, ready: true });
    await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
    await t.mutation(api.players.declareReady, { ...guest, ready: true });
    await t.mutation(api.seasons.launch, seat);

    const served = JSON.stringify(await t.query(api.view.playerView, seat));
    for (const secret of ['accountId', 'passwordHash', 'salt', 'iterations', seat.token]) {
      expect(served).not.toContain(secret);
    }
    expect(JSON.stringify(await t.query(api.seasons.lobby, seat))).not.toContain(seat.token);
  });
});
