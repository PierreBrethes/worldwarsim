import { pointOfRegion } from './regions';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { PRESS_EDITION_HOURS, nominalStrength } from './constants';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatIn } from './seats.fixture';

/**
 * **L'édition est un rendez-vous, pas un moniteur.** Ce qui est sous test tient en trois
 * phrases : elle paraît à l'heure dite et à aucune autre ; ce qu'elle sert d'un autre joueur est
 * exactement trois chiffres ; et ce que la vue affiche est la **ligne écrite**, jamais l'état du
 * plateau — recruter entre deux éditions ne doit pas déplacer un chiffre.
 *
 * Le barème lui-même est testé sans base (`src/domain/standings.test.ts`) : ici on ne mesure que
 * le branchement, la cadence et le cloisonnement.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const HOUR = 3_600_000;

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest };
}

const editions = (t: ReturnType<typeof boot>) =>
  t.run(async (ctx) => ctx.db.query('editions').collect());

/**
 * Fait avancer l'horloge et laisse partir tout ce qui était dû — c'est ainsi qu'une chaîne qui
 * se replanifie se déroule sous test.
 *
 * **Deux passes, parce que la chaîne a deux maillons** (13/09) : `publish` prend le rendez-vous
 * suivant et confie l'édition à `writeEditionJob`, à `+0`. Ce zéro reste un minuteur sous horloge
 * factice, et il est posé pendant que la première passe se vide — il faut donc une milliseconde
 * de plus pour l'atteindre. Elle ne déplace aucune cadence : trois heures se comptent toujours
 * de rendez-vous à rendez-vous.
 */
async function advance(t: ReturnType<typeof boot>, hours: number) {
  await vi.advanceTimersByTimeAsync(hours * HOUR);
  await t.finishInProgressScheduledFunctions();
  await vi.advanceTimersByTimeAsync(1);
  await t.finishInProgressScheduledFunctions();
}

describe('the cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Cas 1 du chantier : une ligne par joueur à T+3 h, une seconde à T+6 h, **aucune entre**. */
  it('publishes one line per player every three hours, and none in between', async () => {
    const t = boot();
    await launchedSeason(t);

    expect(await editions(t)).toHaveLength(0);

    await advance(t, PRESS_EDITION_HOURS - 0.5);
    expect(await editions(t)).toHaveLength(0);

    await advance(t, 0.5);
    const first = await editions(t);
    expect(first).toHaveLength(2);
    expect(new Set(first.map((line) => line.at)).size).toBe(1);

    await advance(t, PRESS_EDITION_HOURS - 0.5);
    expect(await editions(t)).toHaveLength(2);

    await advance(t, 0.5);
    expect(await editions(t)).toHaveLength(4);
  });

  /** Cas 7 : chacun reçoit sa dépêche, et elle porte **son** rang — jamais la table. */
  it('files one dispatch per player, carrying his own rank', async () => {
    const t = boot();
    await launchedSeason(t);
    await advance(t, PRESS_EDITION_HOURS);

    const filed = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .collect()
        .then((rows) => rows.filter((row) => row.kind === 'editionPublished')),
    );
    expect(filed).toHaveLength(2);
    expect([...filed.map((row) => row.kind === 'editionPublished' && row.rank)].sort()).toEqual([
      1, 2,
    ]);
  });

  /** Cas 6 : la conclusion écrit une édition finale, et plus rien ne suit — le garde-fou de
   *  tout travail planifié (`seasonStillPlays`) arrête la chaîne. */
  it('writes a final edition at the conclusion, and nothing after it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await advance(t, PRESS_EDITION_HOURS);
    expect(await editions(t)).toHaveLength(2);

    await t.mutation(api.seasons.conclude, seat);
    const closed = await editions(t);
    expect(closed).toHaveLength(4);
    expect(closed.filter((line) => line.final)).toHaveLength(2);

    await advance(t, PRESS_EDITION_HOURS * 3);
    expect(await editions(t)).toHaveLength(4);
  });

  /** Cas 8 : la table part avec la saison. Elle est dans `GAME_TABLES`, donc `dev.reset` la
   *  balaie aussi — c'est l'invariant que `season-partition.test.ts` tient. */
  it('is purged whole when the founder scraps the season', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await advance(t, PRESS_EDITION_HOURS);
    expect(await editions(t)).toHaveLength(2);

    await t.mutation(api.seasons.destroy, seat);
    expect(await editions(t)).toHaveLength(0);
  });
});

describe('what the view serves', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('serves nothing at all before the first edition', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    expect((await t.query(api.view.playerView, seat)).press).toBeNull();
  });

  /**
   * Cas 4 : le général d'un autre est **exact** (décision 80), son industrie et son militaire
   * ne sortent pas du serveur. Le test porte sur la **forme servie** et non sur une valeur :
   * c'est la présence du champ qui serait la fuite, pas son contenu.
   */
  it('serves an opponent’s general exactly, and neither his industry nor his military', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await advance(t, PRESS_EDITION_HOURS);

    const mine = (await t.query(api.view.playerView, seat)).press!;
    const theirs = (await t.query(api.view.playerView, guest)).press!;

    expect(mine.others).toHaveLength(1);
    const line = mine.others[0]!;
    expect(line.general).toBe(theirs.mine!.general);
    expect(Object.keys(line).sort()).toEqual([
      'deeds',
      'defeated',
      'general',
      'nation',
      'nickname',
      'playerId',
      'rank',
      'territory',
    ]);
  });

  /**
   * Cas 5, et c'est **le** point du dispositif : la vue sert l'édition, jamais l'état. Une
   * troupe formée entre deux éditions ne déplace pas un chiffre de la page — sinon la presse
   * serait un moniteur temps réel, ce que ce jeu n'a pas.
   */
  it('does not move when the board does — it serves the edition, not the state', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await advance(t, PRESS_EDITION_HOURS);
    const before = (await t.query(api.view.playerView, seat)).press!;

    const playerId = await t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return player!._id;
    });
    await t.run(async (ctx) => {
      const player = (await ctx.db.get(playerId))!;
      await ctx.db.insert('troops', {
        seasonId: player.seasonId,
        playerId,
        role: 'armor',
        tier: 1,
        nominalStrength: nominalStrength('armor', 1),
        currentStrength: nominalStrength('armor', 1),
        stationedAt: null,
      });
    });

    expect((await t.query(api.view.playerView, seat)).press).toEqual(before);
  });

  /** La variation n'existe qu'à partir de la seconde édition : un « +393 » depuis le néant
   *  serait une progression inventée. */
  it('carries no delta on a first edition, and one on the next', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await advance(t, PRESS_EDITION_HOURS);
    expect((await t.query(api.view.playerView, seat)).press!.mine!.delta).toBeNull();
    expect((await t.query(api.view.playerView, seat)).press!.mine!.since).toBeNull();

    await advance(t, PRESS_EDITION_HOURS);
    const second = (await t.query(api.view.playerView, seat)).press!;
    expect(second.mine!.delta).not.toBeNull();
    expect(second.mine!.since).toBe(second.at - PRESS_EDITION_HOURS * HOUR);
  });

  /**
   * **Les faits d'armes sont un cumul exact, édition après édition** — y compris pour une passe
   * dont l'`at` est antérieur à l'édition précédente (un travail réveillé en retard date sa
   * passe de l'instant qu'il rattrape) : la lire par l'`at` la perdrait pour toujours.
   */
  it('counts every engagement once, whenever its pass is dated', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const me = await t.run(async (ctx) => (await seatIn(ctx, seat))._id);
    const you = await t.run(async (ctx) => (await seatIn(ctx, guest))._id);
    const file = async (attackerId: typeof me, defenderId: typeof me, at: number) =>
      t.run(async (ctx) => {
        const seasonId = (await ctx.db.get(me))!.seasonId;
        await ctx.db.insert('engagements', {
          seasonId,
          attackerId,
          defenderId,
          cause: 'arrival',
          point: { lon: 2, lat: 48 },
          hostCountry: 'FRA',
          at,
          winner: 'attacker',
          outpostId: null,
          disabledUntil: null,
          troops: [],
        });
      });
    const deedsOf = async (playerId: typeof me) => {
      const rows = await editions(t);
      return rows.filter((row) => row.playerId === playerId).sort((a, b) => b.at - a.at)[0]!.deeds;
    };

    await file(me, you, Date.now());
    await advance(t, PRESS_EDITION_HOURS);
    expect(await deedsOf(me)).toBe(1);
    expect(await deedsOf(you)).toBe(1);

    // Filed after the first edition, dated before it.
    await file(you, me, MIDDAY.getTime());
    await file(me, you, Date.now());
    await advance(t, PRESS_EDITION_HOURS);
    expect(await deedsOf(me)).toBe(3);
    expect(await deedsOf(you)).toBe(3);

    await advance(t, PRESS_EDITION_HOURS);
    expect(await deedsOf(me)).toBe(3);
  });

  /** Un bâtiment capturé (14/10) ne pend plus à l'ancre de son ancien tenant : que cet
   *  avant-poste soit désactivé ne doit pas l'annuler chez son capteur. */
  it('counts a captured building whatever befalls the outpost of its former owner', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const me = await t.run(async (ctx) => (await seatIn(ctx, seat))._id);
    const you = await t.run(async (ctx) => (await seatIn(ctx, guest))._id);
    const industryOf = async () =>
      (await editions(t)).filter((row) => row.playerId === me).sort((a, b) => b.at - a.at)[0]!
        .industry;
    await advance(t, PRESS_EDITION_HOURS);
    const before = await industryOf();

    await t.run(async (ctx) => {
      const seasonId = (await ctx.db.get(me))!.seasonId;
      const outpostId = await ctx.db.insert('outposts', {
        seasonId,
        playerId: you,
        point: { lon: 26, lat: 45 },
        hostCountry: 'ROU',
        level: 1,
        foundedAt: Date.now() - HOUR,
        disabledUntil: Date.now() + 99 * HOUR,
        immuneUntil: null,
      });
      await ctx.db.insert('buildings', {
        seasonId,
        playerId: me,
        key: 'barracks',
        regionId: 'ROU-310',
        point: pointOfRegion('ROU-310'),
        level: 1,
        outpostId,
        capturedAt: Date.now(),
      });
    });
    await advance(t, PRESS_EDITION_HOURS);
    expect(await industryOf()).toBeGreaterThan(before);
  });

  /** L'édition finale ne promet pas de suite : « prochaine édition » y serait un rendez-vous
   *  qui n'aura pas lieu. */
  it('promises no next edition once the final one is out', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await advance(t, PRESS_EDITION_HOURS);
    expect((await t.query(api.view.playerView, seat)).press!.next).not.toBeNull();

    await t.mutation(api.seasons.conclude, seat);
    const closed = (await t.query(api.view.playerView, seat)).press!;
    expect(closed.final).toBe(true);
    expect(closed.next).toBeNull();
  });
});

/**
 * **Ce qui tient la chaîne debout.** Le 12/09 à 23 h 55, une édition a dépassé la seconde d'une
 * mutation : la transaction a été annulée **avec sa replanification**, et la presse s'est tue
 * jusqu'à ce que quelqu'un le remarque. Deux choses répondent à cela, et ce sont elles qui sont
 * sous test — la séparation du rendez-vous et de l'édition, et la sortie de secours.
 */
describe('la chaîne, quand une édition tombe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Les travaux planifiés, tels que la relance les lit. */
  const jobs = (t: ReturnType<typeof boot>, name: string) =>
    t.run(async (ctx) =>
      (await ctx.db.system.query('_scheduled_functions').collect()).filter(
        (job) => job.name.endsWith(name) && job.state.kind === 'pending',
      ),
    );

  /**
   * **Le rendez-vous est pris avant que l'édition commence**, et c'est toute la correction. On
   * annule l'édition en attente — la forme testable de celle qui déborde — et la suivante paraît
   * quand même. Avant la séparation, les deux tenaient dans la même transaction : l'annuler
   * annulait le rendez-vous avec elle, et la presse se taisait pour de bon.
   */
  it('paraît à nouveau après une édition manquée', async () => {
    const t = boot();
    await launchedSeason(t);

    await vi.advanceTimersByTimeAsync(PRESS_EDITION_HOURS * HOUR);
    await t.finishInProgressScheduledFunctions();
    expect(await editions(t)).toHaveLength(0);
    expect(await jobs(t, 'press:publish')).toHaveLength(1);

    for (const job of await jobs(t, 'press:writeEditionJob')) {
      await t.run(async (ctx) => ctx.scheduler.cancel(job._id));
    }
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();
    expect(await editions(t)).toHaveLength(0);

    await advance(t, PRESS_EDITION_HOURS);
    expect(await editions(t)).toHaveLength(2);
  });

  it('ne double pas une chaîne vivante', async () => {
    const t = boot();
    await launchedSeason(t);
    await advance(t, PRESS_EDITION_HOURS);
    expect(await editions(t)).toHaveLength(2);

    expect(await t.mutation(internal.dev.relaunchPress, {})).toEqual({ relaunched: [] });

    await advance(t, PRESS_EDITION_HOURS);
    expect(await editions(t)).toHaveLength(4);
  });

  /**
   * **Une chaîne morte se rallume, et une seule fois.** On coupe le maillon en annulant le
   * travail en attente — ce que la panne du 12/09 a fait sans le dire — puis on relance deux
   * fois de suite : la seconde ne trouve plus rien à relancer.
   */
  it('relance une chaîne morte, sans la doubler à la seconde passe', async () => {
    const t = boot();
    await launchedSeason(t);
    await advance(t, PRESS_EDITION_HOURS);
    expect(await editions(t)).toHaveLength(2);

    await t.run(async (ctx) => {
      for (const job of await ctx.db.system.query('_scheduled_functions').collect()) {
        if (job.name.endsWith('press:publish')) await ctx.scheduler.cancel(job._id);
      }
    });
    await advance(t, PRESS_EDITION_HOURS * 2);
    expect(await editions(t)).toHaveLength(2);

    const first = await t.mutation(internal.dev.relaunchPress, {});
    expect(first.relaunched).toHaveLength(1);
    await t.finishInProgressScheduledFunctions();

    expect(await t.mutation(internal.dev.relaunchPress, {})).toEqual({ relaunched: [] });

    await advance(t, PRESS_EDITION_HOURS);
    expect(await editions(t)).toHaveLength(6);
  });
});
