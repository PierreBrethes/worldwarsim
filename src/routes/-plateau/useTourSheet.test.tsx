// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { useTourSheet } from './useTourSheet';

const server = vi.hoisted(() => ({
  pickups: undefined as unknown,
  start: vi.fn(() => new Promise<void>(() => {})),
}));
vi.mock('convex/react', () => ({
  useQuery: () => server.pickups,
  useMutation: () => server.start,
}));
const notify = vi.hoisted(() => vi.fn());
vi.mock('@/shell/notifications', () => ({ notify }));

const NOW = 100 * 3_600_000;
const seat = { token: 't', seasonId: 's' } as never;

const viewOf = (): PlayerView =>
  ({
    mode: 'mondiale',
    loadedAt: NOW,
    me: {
      defeated: false,
      troops: [
        {
          id: 'T',
          role: 'landTransport',
          stationedAt: { kind: 'building', buildingId: 'hq' },
          load: { ammunition: 80, oil: 0, coal: 0 },
        },
      ],
      outposts: [
        {
          id: 'O',
          hostCountry: 'FRA',
          lonLat: [5, 49],
          regionId: 'R',
          isMine: true,
          level: 2,
          standsAt: null,
          depot: { ammunition: 20, oil: 0, coal: 0 },
          depotCapacity: 150,
        },
      ],
      buildings: [
        { id: 'hq', key: 'hq', name: 'Quartier général', point: [2.35, 48.86] },
        {
          id: 'a',
          key: 'mine',
          name: 'Mine',
          regionId: 'R',
          point: [3, 50],
          heap: { amount: 100, cap: 288, resource: 'coal' },
        },
      ],
      regions: [{ id: 'R', name: 'Lorraine' }],
      extraction: [{ buildingId: 'a', heapPerHour: 40, linked: true }],
      resources: Object.fromEntries(
        RESOURCES.map((key) => [key, { stock: 100, ratePerHour: 0, cap: 1000 }]),
      ),
    },
  }) as unknown as PlayerView;

const READ = [{ buildingId: 'a', routed: true, hasQuay: false, stopPoint: null }];

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  server.pickups = READ;
  notify.mockClear();
  server.start.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('the sheet state of a transport', () => {
  it('keeps the map marks and loops it drew when the clock ticks or the view is pushed again', () => {
    const { result, rerender } = renderHook(({ view }) => useTourSheet(seat, view, vi.fn()), {
      initialProps: { view: viewOf() },
    });
    act(() => result.current.open('T'));
    act(() => result.current.startPicking());
    const { marks, loops } = result.current;
    expect(marks.size).toBeGreaterThan(0);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(result.current.marks).toBe(marks);
    expect(result.current.loops).toBe(loops);
    rerender({ view: viewOf() });
    expect(result.current.marks).toBe(marks);
    expect(result.current.loops).toBe(loops);
  });

  it('closes the sheet and says so when its transport is gone', () => {
    const { result, rerender } = renderHook(({ view }) => useTourSheet(seat, view, vi.fn()), {
      initialProps: { view: viewOf() },
    });
    act(() => result.current.open('T'));
    expect(result.current.carrierId).toBe('T');
    const gone = viewOf();
    (gone.me as unknown as { troops: unknown[] }).troops = [];
    rerender({ view: gone });
    expect(result.current.carrierId).toBeNull();
    expect(notify).toHaveBeenCalledWith(fr.tourSheet.unavailable, expect.anything());
  });

  it('waits for the exploitations to be read before it proposes a tour', () => {
    server.pickups = undefined;
    const { result, rerender } = renderHook(({ view }) => useTourSheet(seat, view, vi.fn()), {
      initialProps: { view: viewOf() },
    });
    act(() => result.current.open('T'));
    act(() => result.current.propose());
    expect(result.current.proposing).toBe(true);
    expect(result.current.proposed).toBe(false);
    expect(result.current.stops).toEqual([]);
    server.pickups = READ;
    rerender({ view: viewOf() });
    expect(result.current.proposing).toBe(false);
    expect(result.current.proposed).toBe(true);
    expect(result.current.stops.length).toBeGreaterThan(0);
  });

  it('lifts the « proposed » banner once the hand edits the proposed tour', () => {
    const { result } = renderHook(() => useTourSheet(seat, viewOf(), vi.fn()));
    act(() => result.current.open('T'));
    act(() => result.current.propose());
    expect(result.current.proposed).toBe(true);
    act(() => result.current.remove(0));
    expect(result.current.proposed).toBe(false);
  });

  it('sends a launch once, however many times the button is pressed', () => {
    const { result } = renderHook(() => useTourSheet(seat, viewOf(), vi.fn()));
    act(() => result.current.open('T'));
    act(() => result.current.propose());
    act(() => {
      result.current.launch();
      result.current.launch();
    });
    expect(server.start).toHaveBeenCalledTimes(1);
  });
});
