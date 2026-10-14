import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';
import { signIn, joinSeat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });

describe('seasons.create by mode', () => {
  it('imposes seven days on a Mondiale whatever clock is asked', async () => {
    const t = boot();
    const token = await signIn(t, 'Pierre');
    const { seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'mondiale',
    });
    const season = await t.run((ctx) => ctx.db.get(seasonId));
    expect(season).toMatchObject({ durationHours: 168, mode: 'mondiale' });
  });

  it('founds a Blitz at two hours on its theatre, and refuses a missing or unknown one', async () => {
    const t = boot();
    const token = await signIn(t, 'Pierre');
    const { seasonId } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'blitz',
      theatre: 'pacific',
    });
    expect(await t.run((ctx) => ctx.db.get(seasonId))).toMatchObject({
      durationHours: 2,
      theatre: 'pacific',
    });
    await expect(
      t.mutation(api.seasons.create, { token, compensation: 0.5, mode: 'blitz' }),
    ).rejects.toThrow(/THEATRE_REQUIRED/);
    await expect(
      t.mutation(api.seasons.create, { token, compensation: 0.5, mode: 'blitz', theatre: 'x' }),
    ).rejects.toThrow(/UNKNOWN_THEATRE/);
  });

  it('refuses a player past the theatre in a Blitz and says so on the invitation', async () => {
    const t = boot();
    const token = await signIn(t, 'Pierre');
    const { code } = await t.mutation(api.seasons.create, {
      token,
      compensation: 0.5,
      mode: 'blitz',
      theatre: 'europe',
    });
    for (let rank = 1; rank < 3; rank += 1) await joinSeat(t, code, `Joueur ${String(rank)}`);
    expect((await t.query(api.seasons.invitation, { code })).refusal).toBe('BLITZ_FULL');
    const late = await signIn(t, 'Retard');
    await expect(t.mutation(api.seasons.join, { token: late, code })).rejects.toThrow(/BLITZ_FULL/);
  });
});
