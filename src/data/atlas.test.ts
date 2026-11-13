import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerOf, once } from './atlas';

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
      .mockResolvedValue({ ok: true, text: () => Promise.resolve(JSON.stringify(FILE)) });
    vi.stubGlobal('fetch', fetch);

    const loadAtlas = await freshLoadAtlas();
    await expect(loadAtlas()).rejects.toThrow('network');
    await expect(loadAtlas()).resolves.toMatchObject({ regions: [] });
    await loadAtlas();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

/** A worker that only listens: the test plays its answers. */
class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
}

const asked = () => {
  const worker = new FakeWorker();
  return { worker, answer: answerOf<string>(() => worker as unknown as Worker, 'test', 'hello') };
};

describe('answerOf', () => {
  it('hands the worker its message, resolves with its answer and ends it', async () => {
    const { worker, answer } = asked();
    expect(worker.postMessage).toHaveBeenCalledWith('hello');
    worker.onmessage?.({ data: 'done' });
    await expect(answer).resolves.toBe('done');
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('rejects when the worker gives up (null), and ends it', async () => {
    const { worker, answer } = asked();
    worker.onmessage?.({ data: null });
    await expect(answer).rejects.toThrow('gave up');
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('rejects on a script error, and ends the worker', async () => {
    const { worker, answer } = asked();
    worker.onerror?.(new Error('boom'));
    await expect(answer).rejects.toThrow('boom');
    expect(worker.terminate).toHaveBeenCalled();
  });

  it('rejects on an answer it cannot read, instead of waiting for ever', async () => {
    const { worker, answer } = asked();
    worker.onmessageerror?.();
    await expect(answer).rejects.toThrow('unreadable');
    expect(worker.terminate).toHaveBeenCalled();
  });
});

describe('once', () => {
  it('shares one call, and tries afresh after a failure', async () => {
    const make = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue('up');
    const load = once(make);
    const first = load();
    expect(load()).toBe(first);
    await expect(first).rejects.toThrow('down');
    await expect(load()).resolves.toBe('up');
    await load();
    expect(make).toHaveBeenCalledTimes(2);
  });
});
