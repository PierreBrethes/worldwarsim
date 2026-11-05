// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
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

/** « Aucun accrochage » is drawn once the rings are, at the continent's zoom only (#466). */
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
    <ContactMarks contacts={[]} engine={engine as never} intel={false} ink={null} />,
  );
  act(() => {
    engine.onContacts([]);
    rest();
  });
  const shown = queryByText(fr.contacts.none) !== null;
  cleanup();
  return shown;
}

describe('ContactMarks banner', () => {
  it('stands at the continent and nowhere else', () => {
    expect(bannerAt(60)).toBe(true);
    expect(bannerAt(30)).toBe(false);
    expect(bannerAt(100)).toBe(false);
  });
});
