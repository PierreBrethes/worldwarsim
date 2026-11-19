// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { Offer } from '@/domain/offers';
import { leadOffersOf, StrikeOrders } from './StrikeOrders';

afterEach(cleanup);

const station = {
  kind: 'point',
  lonLat: [6, 49],
  country: 'LUX',
  afloat: false,
  ground: 'land',
  coastal: false,
} as const;
const aim = { kind: 'camp', campId: 'c', lon: 6, lat: 49, hostCountry: 'LUX' } as never;
const offer = (place: string, refusal: string | null, code: string | null = null): Offer =>
  ({
    key: 'strike',
    rank: 'strike',
    refusal,
    loses: null,
    pile: { station, troopIds: ['a', 'b'], place },
    aim,
    code,
  }) as Offer;

describe('StrikeOrders', () => {
  it('names the pile on the button, and a touch sends it (#588)', () => {
    const send = vi.fn();
    const ready = offer('Thionville', null);
    render(<StrikeOrders offers={[ready]} onOffer={send} />);
    const button = screen.getByRole('button', { name: /Thionville · 2 troupes/ });
    expect(button.textContent).toContain(fr.drop.verbs.attack);
    act(() => button.click());
    expect(send).toHaveBeenCalledWith(ready);
  });

  it('says a refused pile in its place, without a button', () => {
    render(
      <StrikeOrders
        offers={[offer('Metz', fr.errors.INFANTRY_REQUIRED(), 'INFANTRY_REQUIRED')]}
        onOffer={() => {}}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Metz · 2 troupes/)).toBeTruthy();
    expect(screen.getByText(fr.errors.INFANTRY_REQUIRED())).toBeTruthy();
  });

  it('says once that no pile takes to the sea', () => {
    const refused = (place: string) =>
      offer(place, fr.errors.LAND_TARGET_REQUIRED(), 'LAND_TARGET_REQUIRED');
    render(<StrikeOrders offers={[refused('Metz'), refused('Nancy')]} onOffer={() => {}} />);
    expect(screen.getAllByText(fr.strikes.noShip)).toHaveLength(1);
    expect(screen.queryByText(/Metz/)).toBeNull();
  });

  it('says no pile is in reach when there is none, and nothing for a point I hold', () => {
    const { rerender } = render(<StrikeOrders offers={[]} onOffer={() => {}} />);
    expect(screen.getByText(fr.strikes.noPile)).toBeTruthy();
    rerender(<StrikeOrders offers={[]} empty={false} onOffer={() => {}} />);
    expect(screen.queryByText(fr.strikes.noPile)).toBeNull();
  });

  it('leads the short sheet with the first pile that can go, else the first said', () => {
    const refused = offer('Metz', 'non');
    const ready = offer('Nancy', null);
    expect(leadOffersOf([refused, ready])).toEqual([ready]);
    expect(leadOffersOf([refused])).toEqual([refused]);
    expect(leadOffersOf([])).toEqual([]);
  });
});
