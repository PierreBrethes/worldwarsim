// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import type { Underway } from '@/domain/underway';
import { UnderwayColumn } from './UnderwayColumn';

/**
 * **« En cours », sous le bandeau du téléphone** (refonte mobile, 1a et 1d) : une ligne par
 * compte à rebours, un toucher qui recentre, un en-tête qui replie — et la ligne de ce qui vient
 * de partir qui reste dépliée malgré le pli.
 */
beforeEach(() => localStorage.clear());
afterEach(cleanup);

const line = (id: string, label: string, minutes: number): Underway => ({
  id,
  endsAt: Date.now() + minutes * 60_000,
  label,
  face: { kind: 'outpost' },
  place: { kind: 'outpost', outpostId: id },
  moving: false,
});

const LINES = [line('a', 'marche → Somme', 14), line('b', 'mine → niveau 4', 89)];

describe('the underway column', () => {
  it('does not exist when nothing runs', () => {
    const { container } = render(
      <UnderwayColumn lines={[]} nation="france" fresh={null} onLocate={() => {}} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('reads each countdown with its label, and a touch recentres on it', () => {
    const onLocate = vi.fn();
    render(<UnderwayColumn lines={LINES} nation="france" fresh={null} onLocate={onLocate} />);
    expect(screen.getByText('marche → Somme')).toBeTruthy();

    act(() => screen.getByTitle(fr.underway.locate('mine → niveau 4')).click());
    expect(onLocate).toHaveBeenCalledWith(LINES[1]);
  });

  it('folds to its hours, remembers it, and keeps what was just sent unfolded', () => {
    render(<UnderwayColumn lines={LINES} nation="france" fresh="b" onLocate={() => {}} />);

    act(() => screen.getByTitle(fr.underway.fold).click());
    expect(screen.queryByText('marche → Somme')).toBeNull();
    expect(screen.getByText('mine → niveau 4')).toBeTruthy();
    expect(localStorage.getItem('wws-underway')).toBe('folded');
  });
});
