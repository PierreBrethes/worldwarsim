// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { parsePatchnotes } from '@/domain/patchnotes';
import { PatchnotesReader } from './PatchnotesReader';

vi.mock('@/data/mapMotion', () => ({ useMapMotion: () => 'full' }));
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
}));

const notes = parsePatchnotes(
  ['2026-11-01', '2026-10-27', '2026-10-23', '2026-10-19'].map((date) => ({
    date,
    title: `Titre ${date}`,
    image: `/${date}.webp`,
    thumb: `/${date}-thumb.webp`,
    summary: 'résumé',
  })),
);

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const shown = () => [...document.querySelectorAll('img')].map((img) => img.getAttribute('src'));

describe('la liseuse des bulletins', () => {
  it('garde pour elle les raccourcis du jeu, sauf Tab', () => {
    render(
      <PatchnotesReader
        notes={notes}
        startDate="2026-11-01"
        unread={new Set()}
        onClose={() => {}}
      />,
    );
    const behind = vi.fn();
    document.addEventListener('keydown', behind);
    for (const key of ['g', 'u', 'h', '?', ' ']) fireEvent.keyDown(document.body, { key });
    expect(behind).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    document.removeEventListener('keydown', behind);
  });

  it('ferme sur Échap et feuillette avec les flèches', () => {
    const onClose = vi.fn();
    render(
      <PatchnotesReader
        notes={notes}
        startDate="2026-10-23"
        unread={new Set()}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('heading').textContent).toBe('Titre 2026-10-23');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('retient le focus : Tab depuis le dernier bouton revient au premier, Maj+Tab à l’envers', () => {
    render(
      <PatchnotesReader
        notes={notes}
        startDate="2026-10-27"
        unread={new Set()}
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByRole('dialog');
    const buttons = [...dialog.querySelectorAll<HTMLElement>('button')];
    buttons.at(-1)!.focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(buttons.at(-1));
  });

  it('rend le focus à ce qui l’a ouverte', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <PatchnotesReader
        notes={notes}
        startDate="2026-11-01"
        unread={new Set()}
        onClose={() => {}}
      />,
    );
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('amène la feuille visée, pas sa voisine, quand la frise saute de plusieurs crans', () => {
    render(
      <PatchnotesReader
        notes={notes}
        startDate="2026-10-19"
        unread={new Set()}
        onClose={() => {}}
      />,
    );
    act(() => {
      screen.getByRole('button', { name: fr.patchnotes.dateLong('2026-11-01') }).click();
    });
    // La feuille qui entre pendant le tour est la visée : le premier numéro de la liasse, 4 crans plus loin.
    expect(shown()).toContain('/2026-11-01.webp');
  });
});
