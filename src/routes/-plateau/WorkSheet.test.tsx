// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import type { Seat } from '@/data/session';
import { WorkSheet } from './WorkSheet';

/** **La fiche d'un chantier** (#587) : « Annuler » pour une ligne en file, la phrase pour la tête. */
const sent = vi.fn();
const client = {
  watchQuery: () => ({ localQueryResult: () => undefined, onUpdate: () => () => {} }),
  mutation: (_reference: unknown, args: unknown) => {
    sent(args);
    return Promise.resolve({ refunded: {} });
  },
} as unknown as ConvexReactClient;

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  sent.mockClear();
});
afterEach(cleanup);

const work = (id: string, level = 1) => ({
  id,
  name: 'Ferme',
  key: 'farm',
  outpostId: null,
  regionId: 'FR-NOR',
  regionName: 'Nord',
  point: null,
  minutesLeft: 20,
  minutes: 30,
  level,
  specialty: null,
  respecialize: false,
});
const view = {
  loadedAt: Date.UTC(2026, 9, 20, 12),
  me: {
    defeated: false,
    hqLevel: 1,
    construction: work('W-1'),
    constructionQueue: [work('W-2')],
  },
} as unknown as PlayerView;

const mount = (workId: string, onClose = () => {}) =>
  render(
    <ConvexProvider client={client}>
      <WorkSheet
        view={view}
        seat={{ token: 't', seasonId: 's' } as unknown as Seat}
        workId={workId}
        onClose={onClose}
      />
    </ConvexProvider>,
  );

describe('the sheet of a work line', () => {
  it('cancels a queued line, with the mutation the server refuses a started one', () => {
    mount('W-2');
    expect(screen.getByText(fr.personalBoard.workSiteNothing)).toBeTruthy();
    act(() => screen.getByRole('button', { name: fr.economy.queueCancel }).click());
    expect(sent).toHaveBeenCalledWith(expect.objectContaining({ constructionId: 'W-2' }));
  });

  it('says a started work does not cancel any more, in place of the button', () => {
    mount('W-1');
    expect(screen.getByText(fr.errors.CONSTRUCTION_ALREADY_STARTED())).toBeTruthy();
    expect(screen.queryByRole('button', { name: fr.economy.queueCancel })).toBeNull();
  });

  it('closes itself when its line is gone', () => {
    const onClose = vi.fn();
    mount('W-gone', onClose);
    expect(onClose).toHaveBeenCalled();
  });
});
