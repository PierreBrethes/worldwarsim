// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactMarks } from './ContactMarks';

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

/** With no contact, nothing is written on the map (#607): the banner said « rien » for good. */
function bannerAt(distance: number): boolean {
  let rest = () => {};
  const engine = {
    cameraDistance: () => distance,
    subscribeRest: (listener: () => void) => {
      rest = listener;
      return () => {};
    },
    markRects: () => [],
    reserveNames: () => {},
    invalidate: () => {},
    onContacts: (() => {}) as (spots: unknown) => void,
  };
  const { queryByText } = render(
    <ContactMarks contacts={[]} engine={engine as never} offscreen={false} ink={null} />,
  );
  act(() => {
    engine.onContacts([]);
    rest();
  });
  const shown = queryByText(/Aucun accrochage/) !== null;
  cleanup();
  return shown;
}

describe('ContactMarks without a contact', () => {
  it('draws no banner, at the continent or anywhere else', () => {
    expect(bannerAt(60)).toBe(false);
    expect(bannerAt(30)).toBe(false);
    expect(bannerAt(100)).toBe(false);
  });
});
