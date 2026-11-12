// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChargeBar } from './ChargeBar';

vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));
afterEach(cleanup);

const NONE = { food: 0, steel: 0, coal: 0, oil: 0, ammunition: 0 };

/** **La place à bord compte la récolte** (ADR 0041, #551) : sa barre et son total. */
describe('a charge bar', () => {
  it('counts the harvest aboard in the total and says it in the tooltip', () => {
    const { container } = render(
      <ChargeBar
        load={{ ammunition: 60, oil: 0, coal: 0 }}
        harvest={{ ...NONE, coal: 90, steel: 10 }}
        capacity={200}
      />,
    );
    expect(container.textContent).toContain('160/200');
    expect(container.querySelector('.charge-bar')!.getAttribute('title')).toContain('90 charbon');
    expect(container.querySelector('.charge-bar')!.getAttribute('title')).toContain('10 acier');
  });

  it('reads a harvest still growing in whole units, never 69.99…', () => {
    const { container } = render(
      <ChargeBar
        load={{ ammunition: 0, oil: 0, coal: 0 }}
        harvest={{ ...NONE, coal: 69.9968575 }}
        capacity={200}
      />,
    );
    expect(container.textContent).toContain('69/200');
    expect(container.querySelector('.charge-bar')!.getAttribute('title')).toContain('69 charbon');
  });

  it('is the load alone when nothing is harvested', () => {
    const { container } = render(
      <ChargeBar load={{ ammunition: 60, oil: 0, coal: 0 }} capacity={200} />,
    );
    expect(container.textContent).toContain('60/200');
  });
});
