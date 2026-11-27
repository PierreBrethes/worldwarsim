// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TodoChip } from '@/domain/todo-chips';
import { TodoChips } from './TodoChips';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chip = (id: string, count: number, word: string, targets = 1): TodoChip => ({
  id,
  count,
  word,
  alert: false,
  targets,
  unfolds: false,
});

const CHIPS = [
  chip('troopWithoutOrder', 6, 'troupes sans ordre', 3),
  chip('unsupplied', 3, 'troupes hors ravitaillement', 2),
  chip('unharvested', 1, 'tas sans tournée'),
  chip('unlinkedSites', 1, 'site hors réseau'),
];

/** jsdom has no layout: a row is as wide as the letters it shows, ten pixels each. */
const lettersAreTenPixels = () =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const right = (this.textContent ?? '').length * 10;
    return { right, left: 0, top: 0, bottom: 0, width: right, height: 0 } as DOMRect;
  });

const mount = (width: number, onPick = vi.fn()) => {
  window.innerWidth = width;
  return render(<TodoChips step={null} chips={CHIPS} rankOf={() => 0} onPick={onPick} />);
};

describe('the chips row', () => {
  it('keeps every label while the room holds them', () => {
    lettersAreTenPixels();
    mount(2000);
    expect(screen.getByRole('button', { name: /sans ordre/ }).textContent).toBe(
      '6troupes sans ordre1 / 3 ›',
    );
    expect(screen.getByText('site hors réseau')).toBeTruthy();
  });

  it('folds the right-hand chips to their count, the first ones keeping their text', () => {
    lettersAreTenPixels();
    // Full text is 6+18+7 + 3+27+7 + 1+16 + 1+16 = 102 letters: 1020 px.
    mount(900);
    expect(screen.getByText('troupes sans ordre')).toBeTruthy();
    expect(screen.queryByText('site hors réseau')).toBeNull();
    const folded = screen.getByRole('button', { name: '1 site hors réseau' });
    expect(folded.textContent).toBe('1');
    expect(folded.getAttribute('title')).toBe('1 site hors réseau');
  });

  it('leads with the id of the chip that was clicked', () => {
    lettersAreTenPixels();
    const onPick = vi.fn();
    mount(2000, onPick);
    fireEvent.click(screen.getByRole('button', { name: /tas sans tournée/ }));
    expect(onPick).toHaveBeenCalledWith('unharvested');
  });
});
