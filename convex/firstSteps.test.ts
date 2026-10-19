import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });

describe('les premiers pas', () => {
  it('retient les gestes vus, dans leur ordre, et la liste passée puis reprise', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
    const guest = await joinSeat(t, code, 'Léa');
    await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...seat, ready: true });
    await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
    await t.mutation(api.players.declareReady, { ...guest, ready: true });
    await t.mutation(api.seasons.launch, seat);
    expect((await t.query(api.view.playerView, seat)).firstSteps).toEqual({
      done: [],
      shown: 'open',
    });

    await t.mutation(api.firstSteps.check, { ...seat, steps: ['move'] });
    await t.mutation(api.firstSteps.check, { ...seat, steps: ['hq', 'move'] });
    await t.mutation(api.firstSteps.show, { ...seat, shown: 'skipped' });
    expect((await t.query(api.view.playerView, seat)).firstSteps).toEqual({
      done: ['hq', 'move'],
      shown: 'skipped',
    });
    await expect(
      t.mutation(api.firstSteps.check, { ...seat, steps: ['hq', 'hq'] }),
    ).rejects.toThrow(/FIRST_STEPS_INVALID/);
    // Les pas d'un joueur ne sont pas ceux de l'autre.
    expect((await t.query(api.view.playerView, guest)).firstSteps.done).toEqual([]);
  });
});
