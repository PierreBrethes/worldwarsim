// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';
import { FootBar, FootContext, type Foot } from './foot';

/**
 * **La barre de la Blitz** (#179) : pas de plateau, donc pas de réserves — les fonds, et la clé des
 * surfaces à droite. Elle se déclare à la coque tant qu'elle est montée.
 */
afterEach(cleanup);
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

const view = {
  loadedAt: Date.now(),
  me: { funds: { stock: 1200, perMinute: 15 } },
} as unknown as PlayerView;

describe('the Blitz foot bar', () => {
  it('reads the funds beside the key, and claims itself while mounted', () => {
    const claim = vi.fn();
    const foot: Foot = { key: <button type="button">la clé</button>, claim };
    const { unmount } = render(
      <FootContext.Provider value={foot}>
        <FootBar view={view} />
      </FootContext.Provider>,
    );

    const bar = screen.getByRole('region', { name: fr.footBar.label });
    expect(bar.textContent).toContain('la clé');
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
      fr.blitz.fundsLabel(1200, 15),
    );
    expect(claim).toHaveBeenLastCalledWith(bar);

    unmount();
    expect(claim).toHaveBeenLastCalledWith(null);
  });
});
