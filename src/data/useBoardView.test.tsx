// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { ConvexProvider } from 'convex/react';
import type { ConvexReactClient } from 'convex/react';
import { ConvexError } from 'convex/values';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Id } from '../../convex/_generated/dataModel';
import { useBoardView } from './useBoardView';

afterEach(cleanup);

const seat = { token: 'token', seasonId: 'season' as Id<'seasons'> };

/** A client whose only query answers what the test says, and tells its subscribers. */
const fakeClient = () => {
  let current: unknown;
  const listeners = new Set<() => void>();
  const watch = {
    localQueryResult: () => {
      if (current instanceof Error) throw current;
      return current;
    },
    onUpdate: (callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    journal: () => undefined,
  };
  return {
    client: { watchQuery: () => watch } as unknown as ConvexReactClient,
    answer: (value: unknown) => {
      current = value;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
};

const mount = () => {
  const { client, answer } = fakeClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ConvexProvider client={client}>{children}</ConvexProvider>
  );
  const hook = renderHook(() => useBoardView(seat), { wrapper });
  return { ...hook, answer };
};

/**
 * **A dropped subscription does not close the board.** `useQuery` throws what the server
 * refuses, and the throw went to the route's error screen: the map was torn down under the
 * player — camera, open windows, an armed aim — for a timeout that lasts a second.
 */
it('serves the view, and says nothing is wrong', () => {
  const { result, answer } = mount();
  expect(result.current.server).toBeUndefined();

  answer({ me: 'view' });
  expect(result.current.server).toEqual({ me: 'view' });
  expect(result.current.interrupted).toBe(false);
});

it('keeps the last view and flags the interruption when the subscription fails', () => {
  const { result, answer } = mount();
  answer({ me: 'view' });

  answer(new Error('timeout'));
  expect(result.current.server).toEqual({ me: 'view' });
  expect(result.current.interrupted).toBe(true);

  answer({ me: 'fresh' });
  expect(result.current.server).toEqual({ me: 'fresh' });
  expect(result.current.interrupted).toBe(false);
});

it('still raises an error the server meant — the session is gone, the season too', () => {
  const { answer } = mount();
  answer({ me: 'view' });
  vi.spyOn(console, 'error').mockImplementation(() => {});

  expect(() => answer(new ConvexError({ code: 'SEASON_GONE' }))).toThrow();
});

it('raises the very first failure: there is no view to keep standing', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { client } = fakeClient();
  const broken = {
    watchQuery: () => ({
      localQueryResult: () => {
        throw new Error('timeout');
      },
      onUpdate: () => () => {},
      journal: () => undefined,
    }),
  } as unknown as ConvexReactClient;
  void client;

  expect(() =>
    renderHook(() => useBoardView(seat), {
      wrapper: ({ children }) => <ConvexProvider client={broken}>{children}</ConvexProvider>,
    }),
  ).toThrow('timeout');
});
