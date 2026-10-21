import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadWorld } = vi.hoisted(() => ({ loadWorld: vi.fn() }));
vi.mock('@/domain/world', () => ({ loadWorld }));
vi.mock('./atlas', () => ({ loadAtlas: () => Promise.resolve({}) }));
vi.mock('./convexClient', () => ({ convexClient: {} }));
vi.mock('./session', () => ({ readSeat: () => ({ token: 'token', seasonId: 'season' }) }));

/**
 * The error screen's "Réessayer" runs the loader again. A world fetch that failed once (the
 * network dropped for a second) must not be remembered, or the button can never succeed and
 * only a full reload gets out.
 */
describe('loadGame', () => {
  // The world promise lives at module level: each case needs a module of its own.
  const freshLoadGame = async () => {
    vi.resetModules();
    return (await import('./loadGame')).loadGame;
  };

  beforeEach(() => loadWorld.mockReset());

  it('fetches the world again after a failure', async () => {
    const world = { countries: [] };
    loadWorld.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(world);

    const loadGame = await freshLoadGame();
    await expect(loadGame()).rejects.toThrow('network');
    await expect(loadGame()).resolves.toMatchObject({ state: 'active', world });
    expect(loadWorld).toHaveBeenCalledTimes(2);
  });

  it('shares one successful fetch between visits', async () => {
    loadWorld.mockResolvedValue({ countries: [] });

    const loadGame = await freshLoadGame();
    await loadGame();
    await loadGame();
    expect(loadWorld).toHaveBeenCalledTimes(1);
  });
});
