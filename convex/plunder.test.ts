import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { BuildingKey } from '../src/domain/ids';
import { regionFacts } from './regions';
import schema from './schema';
import { revalidatePlunderTarget, surveyedPlunderTarget } from './movement/orders';
import { surveyFromPoint } from './surveys';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);
const PRAHOVA = 'ROU-310';

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

async function playerOf(t: ReturnType<typeof boot>, token: string) {
  return t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (player === null) throw new Error('player not found');
    return player;
  });
}

async function building(
  t: ReturnType<typeof boot>,
  token: string,
  key: BuildingKey,
  seasonId?: Id<'seasons'>,
) {
  const player = await playerOf(t, token);
  return t.run((ctx) =>
    ctx.db.insert('buildings', {
      seasonId: seasonId ?? player.seasonId,
      playerId: player._id,
      key,
      regionId: PRAHOVA,
      level: 1,
    }),
  );
}

async function observe(t: ReturnType<typeof boot>, token: string) {
  const player = await playerOf(t, token);
  return t.run((ctx) =>
    surveyFromPoint(ctx, player._id, regionFacts(PRAHOVA)!.point, Date.now(), 1),
  );
}

async function resolve(
  t: ReturnType<typeof boot>,
  token: string,
  buildingId: Id<'buildings'>,
  atArrival = false,
) {
  const player = await playerOf(t, token);
  return t.run((ctx) =>
    atArrival
      ? revalidatePlunderTarget(ctx, player, buildingId)
      : surveyedPlunderTarget(ctx, player, buildingId),
  );
}

describe('surveyed plunder targets', () => {
  it('serves only the minimal warehouse snapshot filed for the observer', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const warehouseId = await building(t, guest, 'warehouse');

    await observe(t, token);

    const view = await t.query(api.view.playerView, { token });
    expect(view.surveyedInstallations).toEqual([
      { id: warehouseId, key: 'warehouse', regionId: PRAHOVA },
    ]);
    expect(JSON.stringify(view.surveyedInstallations)).not.toContain('stock');
    expect(JSON.stringify(view.surveyedInstallations)).not.toContain('garrison');
    await expect(resolve(t, token, warehouseId)).resolves.toMatchObject({ _id: warehouseId });
  });

  it('accepts a surveyed legacy depot as the same warehouse target', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const depotId = await building(t, guest, 'depot');
    await observe(t, token);

    expect((await t.query(api.view.playerView, { token })).surveyedInstallations).toEqual([
      { id: depotId, key: 'warehouse', regionId: PRAHOVA },
    ]);
    await expect(resolve(t, token, depotId)).resolves.toMatchObject({ _id: depotId });
  });

  it('reveals neither an old row without an inventory nor a building raised after the survey', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    await observe(t, token);
    const warehouseId = await building(t, guest, 'warehouse');

    expect((await t.query(api.view.playerView, { token })).surveyedInstallations).toEqual([]);
    await expect(resolve(t, token, warehouseId)).rejects.toThrow('UNKNOWN_BUILDING');
  });

  it('uses one opaque refusal for unknown, friendly, cross-season and non-warehouse targets', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const me = await playerOf(t, token);
    const friendly = await building(t, token, 'warehouse');
    const hq = await building(t, guest, 'hq');
    const otherSeason = await t.run((ctx) =>
      ctx.db.insert('seasons', {
        code: 'OTHER',
        status: 'launched',
        durationHours: 48,
        compensation: 0.5,
        seed: 1,
        playableRegion: 'world',
        launchedAt: Date.now(),
      }),
    );
    const crossed = await building(t, guest, 'warehouse', otherSeason);
    await observe(t, token);

    const missing = 'missing-building' as Id<'buildings'>;
    for (const target of [missing, friendly, hq, crossed]) {
      await expect(resolve(t, token, target)).rejects.toThrow('UNKNOWN_BUILDING');
    }

    await expect(t.run((ctx) => revalidatePlunderTarget(ctx, me, hq))).rejects.toThrow(
      'UNKNOWN_BUILDING',
    );
  });

  it('revalidates an already authorised target at arrival without requiring fresh intelligence', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const warehouseId = await building(t, guest, 'warehouse');
    await observe(t, token);

    await expect(resolve(t, token, warehouseId, false)).resolves.toMatchObject({
      _id: warehouseId,
    });
    const me = await playerOf(t, token);
    await t.run((ctx) => ctx.db.patch(warehouseId, { playerId: me._id }));
    await expect(resolve(t, token, warehouseId, false)).rejects.toThrow('UNKNOWN_BUILDING');
  });
});
