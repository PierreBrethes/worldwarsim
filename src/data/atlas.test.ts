import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The error screen's "Réessayer" runs the loader again. An atlas fetch that failed once (the
 * network dropped for a second) must not be remembered, or the button can never succeed and
 * only a full reload gets out.
 */
describe('loadAtlas', () => {
  const FILE = {
    type: 'Topology',
    transform: { scale: [1, 1], translate: [0, 0] },
    objects: { regions: { type: 'GeometryCollection', geometries: [] } },
    arcs: [],
  };
  // The promise lives at module level: each case needs a module of its own.
  const freshLoadAtlas = async () => {
    vi.resetModules();
    return (await import('./atlas')).loadAtlas;
  };
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the atlas again after a failure, then shares the one that succeeded', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(FILE) });
    vi.stubGlobal('fetch', fetch);

    const loadAtlas = await freshLoadAtlas();
    await expect(loadAtlas()).rejects.toThrow('network');
    await expect(loadAtlas()).resolves.toMatchObject({ regions: [] });
    await loadAtlas();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
