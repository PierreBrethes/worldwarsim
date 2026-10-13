// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PlayerView } from '@/domain/player-view';
import { GroundPanel } from './GroundPanel';

vi.stubGlobal('matchMedia', () => ({
  matches: true,
  addEventListener: () => {},
  removeEventListener: () => {},
}));
vi.stubGlobal('fetch', () => new Promise(() => {}));

afterEach(cleanup);

const view = {
  me: { nation: 'france', outposts: [] },
  opponents: [],
} as unknown as PlayerView;

it('opens a tapped region as a compact sheet: name and terrain first, the rest behind « détails »', () => {
  render(
    <GroundPanel
      selected="CHE"
      hoveredCountry={null}
      hoveredRegion={{ id: 'r-1', country: 'CHE', name: 'Valais', type: 'mountain' }}
      holding={null}
      suspendedUntil={null}
      view={view}
      onDeselect={() => {}}
    />,
  );
  expect(screen.getByRole('dialog').getAttribute('data-height')).toBe('peek');
  expect(screen.getByText('Valais')).toBeTruthy();
  expect(screen.getByText('détails')).toBeTruthy();
});
