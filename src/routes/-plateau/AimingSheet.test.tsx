// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { Compass } from '@/domain/compass-rose';
import type { Destination } from '@/map/WorldMap';
import { AimTargets } from './AimingSheet';

/**
 * **Les cibles de la colonne, les plus proches sous le pouce** (refonte mobile, 1b) : trois
 * boutons, puis la liste entière d'un toucher. Chacun dit ce qu'on peut y ordonner — les seules
 * branches de sa rose qui font partir une colonne.
 */
afterEach(cleanup);

const destination = (name: string, orders: ReadonlyArray<string>): Destination => ({
  labelId: `label-${name}`,
  name,
  compass: {
    kicker: '',
    name,
    refusal: null,
    actions: [
      ...orders.map((label) => ({ key: 'aim', label })),
      { key: 'demolish', label: 'raser' },
    ],
  } as unknown as Compass,
});

const FIVE = [
  destination('Flandre-Occidentale', ['attaque', 'raid d’avant-poste']),
  destination('Nord', ['marche']),
  destination('Somme', ['marche']),
  destination('Hainaut', ['marche']),
  destination('Calvados', ['marche']),
];

describe('the aim shortcuts', () => {
  it('offers the three nearest, named with what can be ordered there and nothing else', () => {
    render(<AimTargets destinations={FIVE} onPick={() => {}} />);
    expect(screen.getByText('Somme')).toBeTruthy();
    expect(screen.queryByText('Hainaut')).toBeNull();
    expect(screen.getByText('attaque · raid d’avant-poste')).toBeTruthy();
  });

  it('opens the whole list on a touch, and hands the chosen one back', () => {
    const onPick = vi.fn();
    render(<AimTargets destinations={FIVE} onPick={onPick} />);

    act(() => screen.getByText(fr.aimSheet.allTargets(5)).click());
    act(() => screen.getByText('Calvados').click());
    expect(onPick).toHaveBeenCalledWith(FIVE[4]);
  });

  it('says how to aim on the map when no destination is in sight', () => {
    render(<AimTargets destinations={[]} onPick={() => {}} />);
    expect(screen.getByText(fr.aimSheet.pick)).toBeTruthy();
  });
});
