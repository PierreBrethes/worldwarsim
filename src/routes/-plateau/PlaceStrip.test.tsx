// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PlaceStrip } from './PlaceStrip';

vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

afterEach(cleanup);

const reading = { place: 'Valais', country: null, held: null, deposits: [] };

const strip = (groundOpen: boolean) =>
  render(
    <PlaceStrip
      loadPlaces={() => Promise.resolve([])}
      onGo={() => {}}
      reading={reading}
      groundOpen={groundOpen}
      scale={null}
    />,
  );

/** **La fiche de survol est la référence** (#725) : dépliée, la barrette ne redit pas le sol. */
it('says what is under the cursor once the hover card is folded or absent', () => {
  strip(false);
  expect(screen.getByText('sous le curseur')).toBeTruthy();
  expect(screen.getByText('Valais')).toBeTruthy();
});

it('keeps only the search while the hover card is unfolded', () => {
  strip(true);
  expect(screen.queryByText('sous le curseur')).toBeNull();
  expect(screen.getByPlaceholderText('Chercher un lieu')).toBeTruthy();
});
