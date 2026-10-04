// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { Seat } from '@/data/session';
import { MovementPreview, type OrderChoice, type Previewed } from './MovementPreview';

/**
 * **La feuille d'ordre du téléphone** (refonte mobile, 1c) : le type d'ordre s'y choisit en
 * onglets, et l'envoi se tient appuyé — un toucher ne fait rien partir, lâcher avant la fin non
 * plus. jsdom n'a ni `PointerEvent` ni capture : le pointeur est donné en événements souris
 * nommés comme lui, et la capture est neutralisée.
 */
const sent = vi.fn();
const client = {
  watchQuery: () => ({
    localQueryResult: () => undefined,
    onUpdate: () => () => {},
    journal: () => undefined,
  }),
  mutation: (_reference: unknown, args: unknown) => {
    sent(args);
    return Promise.resolve({ movementId: 'M-1', minutes: 100, arrivesAt: 1_000 });
  },
} as unknown as ConvexReactClient;

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  HTMLElement.prototype.setPointerCapture = () => {};
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  sent.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const SEAT = { token: 'jeton', seasonId: 'saison' } as unknown as Seat;
const AIM = {
  kind: 'outpost',
  outpostId: 'O-1',
  hostCountry: 'BEL',
  coastal: false,
} as const;
const ATTACK: OrderChoice = {
  aim: AIM,
  type: 'attack',
  label: 'attaque',
  consequence: 'Trace l’arc réel et propose l’envoi : attaque.',
  mission: { kind: 'march' },
};
const RAID: OrderChoice = { ...ATTACK, type: 'raid', label: 'raid d’avant-poste' };
const PREVIEW = {
  minutes: 100,
  arrivesAt: 6_000_000,
  holdUntil: null,
  destinationName: 'Flandre-Occidentale',
  originName: 'Pas-de-Calais',
  route: {
    mode: 'land',
    points: [
      { lon: 2.3, lat: 50.5 },
      { lon: 3.0, lat: 51.0 },
    ],
    legs: [{ medium: 'land', distanceUnits: 10 }],
    distanceUnits: 10,
    costUnits: 10,
    landCost: 10,
  },
} as unknown as Previewed;

function mount(onChoose = vi.fn(), onSent = vi.fn()) {
  render(
    <ConvexProvider client={client}>
      <MovementPreview
        seat={SEAT}
        origin={{
          kind: 'point',
          lonLat: [2.3, 50.5],
          country: 'FRA',
          afloat: false,
          coastal: false,
        }}
        troopIds={['T-1']}
        strength={50}
        choice={ATTACK}
        choices={[ATTACK, RAID]}
        onChoose={onChoose}
        at={{ x: 0, y: 0 }}
        preview={PREVIEW}
        slots={{ used: 1, total: 3 }}
        originName="Pas-de-Calais"
        onClose={() => {}}
        onSent={onSent}
      />
    </ConvexProvider>,
  );
  return { onChoose, onSent };
}

/** Le bouton change de mot sous le doigt — « maintenez… » — donc on le tient par son nœud. */
const holdButton = () => screen.getByRole('button', { name: new RegExp(fr.orderSheet.hold, 'i') });
const press = (button: HTMLElement, name: string) =>
  button.dispatchEvent(new MouseEvent(name, { bubbles: true, button: 0 }));

describe('the order sheet', () => {
  it('offers every order the target accepts as a tab, and hands the chosen one back', () => {
    const { onChoose } = mount();
    expect(screen.getByRole('radio', { name: 'attaque' }).getAttribute('aria-checked')).toBe(
      'true',
    );

    act(() => screen.getByRole('radio', { name: 'raid d’avant-poste' }).click());
    expect(onChoose).toHaveBeenCalledWith(RAID);
  });

  it('sends nothing when the finger lets go before the end', () => {
    mount();
    const button = holdButton();
    act(() => press(button, 'pointerdown'));
    act(() => vi.advanceTimersByTime(300));
    expect(button.textContent).toContain(fr.orderSheet.holding);
    act(() => press(button, 'pointerup'));
    act(() => vi.advanceTimersByTime(1_000));
    expect(sent).not.toHaveBeenCalled();
  });

  it('sends the order once held to the end, and says what left', async () => {
    const { onSent } = mount();
    act(() => press(holdButton(), 'pointerdown'));
    act(() => vi.advanceTimersByTime(800));
    await act(async () => {});

    expect(sent).toHaveBeenCalledOnce();
    expect(onSent).toHaveBeenCalledWith({
      movementId: 'M-1',
      arrivesAt: 1_000,
      destination: 'Flandre-Occidentale',
    });
  });
});
