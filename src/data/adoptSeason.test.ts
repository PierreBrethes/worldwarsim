import { describe, expect, it, vi } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
import { adoptSeason } from './adoptSeason';

const held = (id: string) => ({ seasonId: id as Id<'seasons'> });

describe('adoptSeason', () => {
  it('retient la saison quand le compte y tient une place', async () => {
    const keepSeat = vi.fn();
    const adopted = await adoptSeason('s2', {
      token: 'jeton',
      seatsOf: () => Promise.resolve([held('s1'), held('s2')]),
      keepSeat,
    });
    expect(adopted).toBe(true);
    expect(keepSeat).toHaveBeenCalledExactlyOnceWith('s2');
  });

  it('ignore une saison où le compte n’a pas de place', async () => {
    const keepSeat = vi.fn();
    const adopted = await adoptSeason('s9', {
      token: 'jeton',
      seatsOf: () => Promise.resolve([held('s1')]),
      keepSeat,
    });
    expect(adopted).toBe(false);
    expect(keepSeat).not.toHaveBeenCalled();
  });

  it('ignore le paramètre sans session, et quand le serveur ne répond pas', async () => {
    const keepSeat = vi.fn();
    const seatsOf = vi.fn(() => Promise.resolve([held('s1')]));
    expect(await adoptSeason('s1', { token: null, seatsOf, keepSeat })).toBe(false);
    expect(seatsOf).not.toHaveBeenCalled();
    expect(
      await adoptSeason('s1', {
        token: 'jeton',
        seatsOf: () => Promise.reject(new Error('x')),
        keepSeat,
      }),
    ).toBe(false);
    expect(keepSeat).not.toHaveBeenCalled();
  });
});
