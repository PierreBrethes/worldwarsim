// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Id } from '../../../convex/_generated/dataModel';
import type { JournalDispatch, PlayerView } from '@/domain/player-view';
import { fr } from '@/i18n/fr';
import { JournalWindow } from './JournalWindow';

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
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(cleanup);

const BASE = Date.UTC(2026, 10, 23, 14, 0, 0);
const delivery = (minutes: number, text: string, unread = false): JournalDispatch => ({
  at: BASE - minutes * 60_000,
  t: new Date(BASE - minutes * 60_000).toISOString().slice(11, 19),
  severity: 'routine',
  kind: 'delivery',
  text,
  unread,
  remaining: null,
  resolutionAt: null,
  combat: null,
  place: { lon: 2, lat: 48 },
});

const mount = (journal: JournalDispatch[]) => {
  const view = {
    journal,
    mode: 'mondiale',
    season: { number: 1, elapsedHours: 5, durationHours: 168, outcome: { concludedAt: null } },
    me: { slots: { used: 0, total: 2 } },
  } as unknown as PlayerView;
  const client = { mutation: async () => null } as unknown as ConvexReactClient;
  render(
    <ConvexProvider client={client}>
      <JournalWindow
        view={view}
        seat={{ token: 'jeton', seasonId: 'season-1' as Id<'seasons'> }}
        rumors={[]}
        selectedRumorId={null}
        onSelectRumor={() => {}}
        garrisonAt={() => null}
        onShowCombat={() => {}}
        onLocate={() => {}}
        onOpenGarrison={() => {}}
        onClose={() => {}}
        rank={0}
        inFront
        onBringForward={() => {}}
      />
    </ConvexProvider>,
  );
};

const TEXTS = ['Livraison trois.', 'Livraison deux.', 'Livraison une.'];

it('replie trois livraisons au même lieu en une liasse, et la déplie d’un clic', () => {
  mount(TEXTS.map((text, rank) => delivery(1 + rank * 5, text)));
  const bundle = screen.getByRole('button', { expanded: false });

  expect(bundle.textContent).toContain('× 3');
  expect(screen.getAllByText(/Livraison/)).toHaveLength(1);

  fireEvent.click(bundle);

  expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
  expect(screen.getAllByText(/Livraison/)).toHaveLength(4);

  fireEvent.click(screen.getByRole('button', { expanded: true }));

  expect(screen.getAllByText(/Livraison/)).toHaveLength(1);
});

it('déplie la liasse de la dépêche ouverte, et la surligne, quand ‹ › y entre', () => {
  mount([
    { ...delivery(1, 'Autre lieu.'), place: { lon: 9, lat: 9 } },
    ...TEXTS.map((text, rank) => delivery(21 + rank * 5, text)),
  ]);
  fireEvent.click(screen.getByText('Autre lieu.'));
  expect(screen.queryByRole('button', { expanded: true })).toBeNull();

  fireEvent.click(screen.getByLabelText(fr.journal.next));

  expect(screen.getByRole('button', { expanded: true })).toBeTruthy();
  expect(document.querySelector('[aria-current="true"]')?.textContent).toContain(
    'Livraison trois.',
  );
});
