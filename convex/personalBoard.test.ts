import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

describe('le plateau personnel ouvert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('retient l’heure et les stocks réglés de cette heure, pour la récolte suivante', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
    const guest = await joinSeat(t, code, 'Léa');
    await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
    await t.mutation(api.players.declareReady, { ...seat, ready: true });
    await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
    await t.mutation(api.players.declareReady, { ...guest, ready: true });
    await t.mutation(api.seasons.launch, seat);
    expect((await t.query(api.view.playerView, seat)).boardRead).toBeNull();

    await t.mutation(api.personalBoard.markRead, seat);
    const view = await t.query(api.view.playerView, seat);
    expect(view.boardRead?.at).toBe(MIDDAY.getTime());
    expect(view.boardRead?.stocks).toEqual(
      Object.fromEntries(
        Object.entries(view.me.resources).map(([key, resource]) => [key, resource.stock]),
      ),
    );
  });
});
