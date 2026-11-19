// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { RESOURCES } from '@/domain/ids';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { ResearchWindow } from './ResearchWindow';

/**
 * **La fiche du Centre de recherche, au téléphone** (#587) : une feuille basse à deux onglets,
 * « poste » et « arbre » — plus de fenêtre plein écran.
 */
const client = {
  watchQuery: () => ({ localQueryResult: () => undefined, onUpdate: () => () => {} }),
  mutation: () => Promise.resolve(),
} as unknown as ConvexReactClient;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(cleanup);

const view = {
  loadedAt: Date.UTC(2026, 9, 20, 12),
  me: {
    defeated: false,
    hqLevel: 1,
    regions: [{ id: 'FR-CEN', name: 'Centre' }],
    buildings: [{ id: 'B-9', key: 'researchCenter', name: 'Centre', regionId: 'FR-CEN', level: 1 }],
    research: { researched: [], running: null, queue: [] },
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 500, ratePerHour: 0, cap: 1000 }]),
    ),
  },
} as unknown as PlayerView;

const mount = (onClose = () => {}) =>
  render(
    <ConvexProvider client={client}>
      <ResearchWindow
        view={view}
        seat={{ token: 't', seasonId: 's' } as unknown as Seat}
        focused="B-9"
        rank={0}
        inFront
        onBringForward={() => {}}
        onClose={onClose}
      />
    </ConvexProvider>,
  );

describe('the research sheet on a phone', () => {
  it('opens on « poste », and « arbre » shows the tree', () => {
    mount();
    expect(
      screen.getByRole('tab', { name: fr.research.tabs.post }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByText(fr.research.bench)).toBeTruthy();
    expect(screen.queryByText(fr.research.legendDone)).toBeNull();

    act(() => screen.getByRole('tab', { name: fr.research.tabs.tree }).click());
    expect(screen.getByText(fr.research.legendDone)).toBeTruthy();
    expect(screen.queryByText(fr.research.bench)).toBeNull();
  });

  it('is a sheet, not a full-page window, and closes by its header', () => {
    const onClose = vi.fn();
    mount(onClose);
    expect(document.querySelector('[data-surface="research"]')).toBeNull();
    act(() => screen.getByRole('button', { name: fr.common.close }).click());
    expect(onClose).toHaveBeenCalled();
  });
});
