// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { Rail } from './Rail';

/**
 * **Le rang des tuiles dit sa suite** (#251) : une flèche n'est posée que s'il y a une suite de son
 * côté — absente, pas grisée — et ses bords s'estompent de même.
 */
const ROOM = 200;
const LENGTH = 500;

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  for (const [name, value] of [
    ['clientWidth', ROOM],
    ['scrollWidth', LENGTH],
  ] as const)
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => value });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const name of ['clientWidth', 'scrollWidth'])
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
});

const rail = (narrow = false) =>
  render(
    <Rail narrow={narrow} motion="full" label="tuiles">
      {() => <i>une tuile</i>}
    </Rail>,
  );
const group = () => screen.getByRole('group');

describe('the rail of tiles', () => {
  it('shows the arrow of the side where it goes on, and none on the other', () => {
    rail();
    expect(screen.queryByLabelText(fr.personalBoard.next)).not.toBeNull();
    expect(screen.queryByLabelText(fr.personalBoard.previous)).toBeNull();
    expect(group().dataset.after).toBe('true');
    expect(group().dataset.before).toBe('false');
  });

  it('swaps its arrows at the far end', () => {
    rail();
    group().scrollLeft = LENGTH - ROOM;
    act(() => void fireEvent.scroll(group()));
    expect(screen.queryByLabelText(fr.personalBoard.next)).toBeNull();
    expect(screen.queryByLabelText(fr.personalBoard.previous)).not.toBeNull();
    expect(group().dataset.before).toBe('true');
    expect(group().dataset.after).toBe('false');
  });

  it('has no arrow when everything fits, nor on the phone', () => {
    cleanup();
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get: () => ROOM,
    });
    rail();
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get: () => LENGTH,
    });
    rail(true);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hands the focus on when the arrow that held it goes', () => {
    rail();
    screen.getByLabelText(fr.personalBoard.next).focus();
    group().scrollLeft = LENGTH - ROOM;
    act(() => void fireEvent.scroll(group()));
    expect(document.activeElement).toBe(screen.getByLabelText(fr.personalBoard.previous));
  });
});
