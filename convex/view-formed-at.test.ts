import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { PlayerView } from '../src/domain/player-view';
import { nominalStrength } from './constants';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatDoc } from './seats.fixture';
import type { Seat } from './seats.fixture';

/** **L'instant de formation d'une troupe** (#524) : servi pour les siennes seules. */
describe('formedAt in the view', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 8, 7, 12));
  });
  afterEach(() => vi.useRealTimers());

  it('serves the creation time of each own troop, and no one else’s troop', async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
    const guest = await joinSeat(t, code, 'Léa');
    for (const [place, nation] of [
      [seat, 'france'],
      [guest, 'ussr'],
    ] as const) {
      await t.mutation(api.players.reserveNation, { ...place, nation });
      await t.mutation(api.players.declareReady, { ...place, ready: true });
    }
    await t.mutation(api.seasons.launch, seat);
    const troopOf = async (who: Seat) => {
      const player = await seatDoc(t, who);
      const id = await t.run((ctx) =>
        ctx.db.insert('troops', {
          seasonId: player.seasonId,
          playerId: player._id,
          role: 'fighter',
          tier: 1,
          nominalStrength: nominalStrength('fighter', 1),
          currentStrength: nominalStrength('fighter', 1),
          stationedAt: { lon: 2.3, lat: 48.8 },
        }),
      );
      return { id, at: (await t.run((ctx) => ctx.db.get(id)))!._creationTime };
    };
    const mine = await troopOf(seat);
    const theirs = await troopOf(guest);
    const view = (await t.query(api.view.playerView, seat)) as unknown as PlayerView;
    const own = view.me.troops.find(({ id }) => id === mine.id);
    expect(own?.formedAt).toBe(mine.at);
    expect(view.me.troops.some(({ id }) => id === theirs.id)).toBe(false);
    expect(JSON.stringify(view)).not.toContain(String(theirs.at));
  });
});
