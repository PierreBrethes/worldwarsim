// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcView, PlayerView } from '@/domain/player-view';
import { tapeNow } from '@/map/front-sound';
import { useFrontSound } from './FrontTape';

const link = vi.hoisted(() => ({ connected: true }));
vi.mock('convex/react', () => ({
  useConvexConnectionState: () => ({ isWebSocketConnected: link.connected }),
}));

/** Un contexte audio qui joue tout et ne produit rien : chaque nœud rend un nœud. */
const node: unknown = new Proxy(() => node, {
  get: (_, key) =>
    key === 'getChannelData' ? () => new Float32Array(8) : key === 'then' ? undefined : node,
  apply: () => node,
});
const audio = vi.hoisted(() => ({ state: 'running', sound: 'full' }));
vi.mock('@/data/audio', async (original) => ({
  ...(await original<typeof import('@/data/audio')>()),
  soundNow: () => audio.sound,
  sharedAudio: () =>
    new Proxy(
      {},
      {
        get: (_, key) =>
          key === 'state'
            ? audio.state
            : key === 'currentTime'
              ? 0
              : key === 'sampleRate'
                ? 8000
                : key === 'resume'
                  ? () => Promise.resolve()
                  : () => node,
      },
    ),
}));

const arc = (id: string, lon: number): ArcView =>
  ({
    state: 'enemyDetected',
    id,
    from: [lon, 49],
    to: [lon + 1, 49],
    route: { legs: [{ medium: 'land', distanceUnits: 1 }], points: [[lon, 49]] },
    headingAtMe: false,
  }) as unknown as ArcView;

const board = (arcs: ReadonlyArray<ArcView>) =>
  ({
    mode: 'mondiale',
    theatre: null,
    me: { buildings: [], capitalPoint: [2.35, 48.85], openingPoint: null },
    arcs,
    journal: [],
    press: null,
  }) as unknown as PlayerView;

const eight = Array.from({ length: 8 }, (_, n) => arc(`a${n}`, 2 + n));

// jsdom tient la page pour cachée : le plateau, lui, est sous les yeux.
Object.defineProperty(document, 'hidden', { value: false });
vi.stubGlobal('matchMedia', () => ({ matches: false }));

beforeEach(() => {
  vi.useFakeTimers();
  link.connected = true;
  audio.state = 'running';
  audio.sound = 'full';
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const silentCount = () => tapeNow().lines.filter((line) => line.silent).length;
const heardCount = () => tapeNow().lines.filter((line) => !line.silent).length;

describe('le front au plateau', () => {
  it('après une coupure du websocket, trois phrases sonnent et le reste s’imprime sans son', () => {
    const hook = renderHook(({ view }) => useFrontSound(view, 'saison-1', false), {
      initialProps: { view: board([]) },
    });
    link.connected = false;
    hook.rerender({ view: board([]) });
    link.connected = true;
    hook.rerender({ view: board(eight) });
    act(() => void vi.advanceTimersByTime(30_000));
    expect(heardCount()).toBe(3);
    expect(silentCount()).toBe(5);
    hook.unmount();
  });

  it('une autre saison remet la bande à blanc', () => {
    const first = renderHook(({ view }) => useFrontSound(view, 'saison-2', false), {
      initialProps: { view: board([]) },
    });
    first.rerender({ view: board([arc('x', 3)]) });
    expect(tapeNow().lines).toHaveLength(1);
    first.unmount();
    renderHook(() => useFrontSound(board([]), 'saison-3', false));
    expect(tapeNow().lines).toEqual([]);
  });

  it('démonté, le plateau ne laisse rien sonner', () => {
    const hook = renderHook(({ view }) => useFrontSound(view, 'saison-4', false), {
      initialProps: { view: board([]) },
    });
    hook.rerender({ view: board(eight.slice(0, 3)) });
    hook.unmount();
    act(() => void vi.advanceTimersByTime(30_000));
    expect(tapeNow().lines).toHaveLength(1);
  });

  it('un contexte arrêté (Safari, au retour) imprime la phrase sans son', () => {
    audio.state = 'interrupted';
    const hook = renderHook(({ view }) => useFrontSound(view, 'saison-5', false), {
      initialProps: { view: board([]) },
    });
    hook.rerender({ view: board([arc('y', 3)]) });
    expect(tapeNow().lines.map((line) => line.silent)).toEqual([true]);
    hook.unmount();
  });

  it('son coupé, la phrase s’imprime « sans son »', () => {
    audio.sound = 'off';
    const hook = renderHook(({ view }) => useFrontSound(view, 'saison-6', false), {
      initialProps: { view: board([]) },
    });
    hook.rerender({ view: board([arc('z', 3)]) });
    expect(tapeNow().lines.map((line) => line.silent)).toEqual([true]);
    hook.unmount();
  });
});
