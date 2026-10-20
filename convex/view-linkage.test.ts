import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import type { LonLat } from '../src/domain/geo';
import type { BuildingKey } from '../src/domain/ids';
import type { PlayerView } from '../src/domain/player-view';
import { outpostReachKm } from './constants';
import { linkingOver } from './holding';
import { leaveTheWar } from './players';
import { reportChange, settleBeforeChange } from './production';
import { economyOf } from './resources';
import { regionFacts } from './regions';
import schema from './schema';
import { handOver } from './strategicPoints';
import { modules } from './test.setup';
import { foundSeat, joinSeat, neutralPoint, pointIn, seatDoc, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Le contrat de la vue sur la couleur** (#144) : ce que `playerView` dit de la production
 * reliée — `regions[].linked`, les sites d'extraction, les filières — est exactement ce que la
 * vérité (`linkingOver`) et l'économie (`economyOf`) rendent à l'instant, sur des parties variées,
 * y compris un adversaire qui plante ou perd un point hors de la vue du joueur. Ce contrat a été
 * écrit avant que la vue cesse de relire toute la saison : il doit tenir des deux côtés.
 */

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MARNE = 'FRA-5323'; // nourriture, sol français
const ANJOU = 'FRA-5321'; // fer, sol français
const PRAHOVA = 'ROU-310'; // pétrole roumain, le sol de personne
const BUZAU = 'ROU-314'; // voisine, couverte depuis la Prahova
const RUSSIA = 'RUS-2371'; // sol soviétique
const point = (regionId: string): LonLat => regionFacts(regionId)!.point;

const MIDDAY = Date.UTC(2026, 8, 7, 12);
const HOUR = 3_600_000;

type Bench = ReturnType<typeof boot>;

async function launchedSeason(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  const third = await joinSeat(t, code, 'Max');
  for (const [place, nation] of [
    [seat, 'france'],
    [guest, 'ussr'],
    [third, 'germany'],
  ] as const) {
    await t.mutation(api.players.reserveNation, { ...place, nation });
    await t.mutation(api.players.declareReady, { ...place, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest, third };
}

/** Régler, écrire, rendre compte : le geste de tout changement de couleur du jeu. */
const changeColour = (
  t: Bench,
  seasonId: Id<'seasons'>,
  write: (ctx: MutationCtx) => Promise<void>,
) =>
  t.run(async (ctx) => {
    const at = Date.now();
    const before = await settleBeforeChange(ctx, seasonId, at);
    await write(ctx);
    await reportChange(ctx, seasonId, before, at);
  });

async function raise(t: Bench, seat: Seat, key: BuildingKey, regionId: string) {
  const player = await seatDoc(t, seat);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: player.seasonId,
      playerId: player._id,
      key,
      regionId,
      point: pointIn(regionId),
      level: 1,
    }),
  );
}

/** Un point posé dans le geste de couleur ; `standsAt` en fait un chantier. */
async function plant(
  t: Bench,
  seat: Seat,
  at: LonLat,
  extra: { standsAt?: number; disabledUntil?: number } = {},
): Promise<Id<'outposts'>> {
  const player = await seatDoc(t, seat);
  let id: Id<'outposts'> | null = null;
  await changeColour(t, player.seasonId, async (ctx) => {
    id = await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId: player._id,
      point: { lon: at[0], lat: at[1] },
      hostCountry: 'XXX',
      level: 1,
      specialization: 'relay',
      foundedAt: Date.now(),
      disabledUntil: extra.disabledUntil ?? null,
      immuneUntil: null,
      ...(extra.standsAt === undefined ? {} : { standsAt: extra.standsAt }),
    });
  });
  return id!;
}

const view = async (t: Bench, seat: Seat): Promise<PlayerView> =>
  (await t.query(api.view.playerView, seat)) as unknown as PlayerView;

/**
 * **Le contrat lui-même.** La vue de `seat`, comparée à la vérité lue à la même milliseconde :
 * chaque région servie est reliée si et seulement si `linkingOver` la donne au joueur, et
 * l'extraction et les filières sont celles qu'`economyOf` règle.
 */
async function holdsTheContract(t: Bench, seat: Seat): Promise<PlayerView> {
  const seen = await view(t, seat);
  const truth = await t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    const now = Date.now();
    const held = await linkingOver(
      ctx,
      player,
      seen.me.regions.map((region) => regionFacts(region.id)!),
      now,
    );
    const economy = await economyOf(ctx, player._id, now);
    return {
      linked: seen.me.regions.map((region) => held.get(region.id) === player._id),
      extraction: economy.extraction,
      chains: economy.chains.map((chain) => [chain.conversion.by, chain.state]),
    };
  });
  expect(seen.me.regions.map((region) => region.linked)).toEqual(truth.linked);
  expect(seen.me.extraction).toEqual(truth.extraction);
  expect(seen.me.chains.map((chain) => [chain.by, chain.state])).toEqual(truth.chains);
  return seen;
}

const linkedAt = (seen: PlayerView, regionId: string) =>
  seen.me.regions.find((region) => region.id === regionId)?.linked;

describe('la vue rend la couleur de la vérité, partie après partie (#144)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('sur le seul sol national', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await raise(t, seat, 'mine', ANJOU);
    expect(linkedAt(await holdsTheContract(t, seat), ANJOU)).toBe(true);
    await holdsTheContract(t, guest);
  });

  it('quand un adversaire plante plus près hors de la vue du joueur, puis perd son point', async () => {
    const t = boot();
    const { seat, guest, third } = await launchedSeason(t);
    await plant(t, seat, point(PRAHOVA));
    await raise(t, seat, 'mine', BUZAU);
    expect(linkedAt(await holdsTheContract(t, seat), BUZAU)).toBe(true);

    // Aucun relevé : le joueur ne voit pas ce point, sa production le sent.
    const rival = await plant(t, guest, point(BUZAU));
    expect(linkedAt(await holdsTheContract(t, seat), BUZAU)).toBe(false);
    await holdsTheContract(t, guest);
    await holdsTheContract(t, third);

    const rivalSeason = (await seatDoc(t, guest)).seasonId;
    await changeColour(t, rivalSeason, (ctx) => ctx.db.delete(rival));
    expect(linkedAt(await holdsTheContract(t, seat), BUZAU)).toBe(true);
  });

  it('quand un raid désactive le point, et quand la fenêtre se referme sans que le travail ait tourné', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const outpostId = await plant(t, seat, point(PRAHOVA));
    await raise(t, seat, 'oilWell', PRAHOVA);
    const until = MIDDAY + 2 * HOUR;
    const seasonId = (await seatDoc(t, seat)).seasonId;
    await changeColour(t, seasonId, (ctx) => ctx.db.patch(outpostId, { disabledUntil: until }));
    expect(linkedAt(await holdsTheContract(t, seat), PRAHOVA)).toBe(false);

    vi.setSystemTime(until);
    expect(linkedAt(await holdsTheContract(t, seat), PRAHOVA)).toBe(false);
    vi.setSystemTime(until + 1);
    expect(linkedAt(await holdsTheContract(t, seat), PRAHOVA)).toBe(true);
    await holdsTheContract(t, guest);
  });

  it('quand un chantier se lève à son heure, avant que son travail ne tourne', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, point(PRAHOVA), { standsAt: MIDDAY + HOUR });
    expect(linkedAt(await holdsTheContract(t, seat), PRAHOVA)).toBeUndefined();
    vi.setSystemTime(MIDDAY + HOUR);
    expect(linkedAt(await holdsTheContract(t, seat), PRAHOVA)).toBe(true);
  });

  it('quand un adversaire a un chantier qui se lève dans la région disputée', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await plant(t, seat, point(PRAHOVA));
    await raise(t, seat, 'mine', BUZAU);
    await plant(t, guest, point(BUZAU), { standsAt: MIDDAY + HOUR });
    expect(linkedAt(await holdsTheContract(t, seat), BUZAU)).toBe(true);
    vi.setSystemTime(MIDDAY + HOUR);
    expect(linkedAt(await holdsTheContract(t, seat), BUZAU)).toBe(false);
  });

  it('quand Narvik change de main', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const outpostId = await plant(t, seat, point(PRAHOVA));
    await raise(t, seat, 'oilWell', PRAHOVA);
    const player = await seatDoc(t, seat);
    await changeColour(t, player.seasonId, (ctx) =>
      ctx.db.patch(outpostId, { disabledUntil: MIDDAY + 6 * HOUR }),
    );
    expect(linkedAt(await holdsTheContract(t, seat), PRAHOVA)).toBe(false);

    const narvik = await t.run(async (ctx) => {
      const laid = await neutralPoint(ctx, player.seasonId, 'narvik');
      await handOver(ctx, laid, player._id, Date.now());
      return laid._id;
    });
    expect(linkedAt(await holdsTheContract(t, seat), PRAHOVA)).toBe(true);
    await holdsTheContract(t, guest);

    await t.run(async (ctx) => handOver(ctx, (await ctx.db.get(narvik))!, null, Date.now()));
    expect(linkedAt(await holdsTheContract(t, seat), PRAHOVA)).toBe(false);
  });

  it('quand un bâtiment capturé occupe un sol national', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await raise(t, seat, 'farm', MARNE);
    const rival = await seatDoc(t, guest);
    await changeColour(t, rival.seasonId, async (ctx) => {
      await ctx.db.insert('buildings', {
        seasonId: rival.seasonId,
        playerId: rival._id,
        key: 'barracks',
        regionId: MARNE,
        point: pointIn(MARNE),
        level: 1,
        capturedAt: Date.now(),
      });
    });
    expect(linkedAt(await holdsTheContract(t, seat), MARNE)).toBe(false);
    await holdsTheContract(t, guest);
  });

  it('quand un adversaire est éliminé et que son sol cesse d’être le sien', async () => {
    const t = boot();
    const { seat, guest, third } = await launchedSeason(t);
    await plant(t, seat, point(RUSSIA));
    expect(linkedAt(await holdsTheContract(t, seat), RUSSIA)).toBe(false);

    const me = await seatDoc(t, seat);
    await t.run(async (ctx) => {
      const loser = await seatIn(ctx, guest);
      await leaveTheWar(ctx, (await ctx.db.get(loser.seasonId))!, loser, Date.now(), {
        kind: 'playerEliminated',
        by: 'france',
        capturerId: me._id,
        irregulars: false,
      });
    });
    expect(linkedAt(await holdsTheContract(t, seat), RUSSIA)).toBe(true);
    await holdsTheContract(t, third);
  });

  it('sous la portée d’un point de niveau supérieur', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    expect(outpostReachKm(2)).toBeGreaterThan(outpostReachKm(1));
    const outpostId = await plant(t, seat, point(PRAHOVA));
    const seasonId = (await seatDoc(t, seat)).seasonId;
    await changeColour(t, seasonId, (ctx) => ctx.db.patch(outpostId, { level: 2 }));
    await holdsTheContract(t, seat);
  });
});
