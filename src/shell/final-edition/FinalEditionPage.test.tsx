// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editionFixture } from './edition.fixture';
import { FinalEditionPage } from './FinalEditionPage';

/** La largeur que la page croit avoir : le téléphone sous le seuil. */
let narrow = false;
beforeEach(() => {
  narrow = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: narrow && query.includes('max-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  /** Sans atlas : la page se lit sans carte ni noms de lieux. */
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});
afterEach(cleanup);

function mount(node: ReactNode) {
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({ getParentRoute: () => root, path: '/', component: () => node });
  const home = createRoute({ getParentRoute: () => root, path: '/accueil', component: () => null });
  render(
    <RouterProvider
      router={createRouter({
        routeTree: root.addChildren([page, home]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })}
    />,
  );
}

const ear = () => screen.getByText('le verdict').parentElement!;

describe('l’édition finale d’une Mondiale', () => {
  it('tamponne le vainqueur en tête de l’oreille, quel que soit son rang, et dit son avance', async () => {
    mount(<FinalEditionPage edition={editionFixture()} />);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveProperty(
      'textContent',
      'La France l’emporte',
    );
    const verdict = ear();
    expect(within(verdict).getByText('vainqueur')).toBeTruthy();
    expect(within(verdict).getByText('France')).toBeTruthy();
    expect(within(verdict).getByText('3 h')).toBeTruthy();
    expect(verdict.textContent).toContain('avant l’horloge');
    /** La France n'est que deuxième au territoire. */
    const ranking = screen.getByText('Le classement final').parentElement!;
    expect(within(ranking).getAllByRole('listitem')[0]!.textContent).toContain('Allemagne');
  });

  it('dit « à l’horloge » et l’égalité, sans vainqueur', async () => {
    mount(
      <FinalEditionPage
        edition={editionFixture({ verdict: { reason: 'draw', winnerNation: null } })}
      />,
    );
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'Égalité à l’horloge',
    );
    expect(within(ear()).getByText('à l’horloge')).toBeTruthy();
    expect(within(ear()).queryByText('vainqueur')).toBeNull();
  });

  it('dit qui a clos à la main, et ne tamponne que les éliminés', async () => {
    mount(
      <FinalEditionPage
        edition={editionFixture({
          verdict: { reason: 'closed', winnerNation: null, closedBy: 'germany' },
        })}
      />,
    );
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe(
      'La saison est close',
    );
    expect(ear().textContent).toContain('close à la main par l’Allemagne');
    expect(screen.queryByText('vaincu')).toBeNull();
    expect(screen.queryByText('égalité')).toBeNull();
    expect(screen.getAllByText('éliminé').length).toBeGreaterThan(0);
  });

  it('donne à l’éliminé la même édition, son oreille à l’heure de sa chute', async () => {
    mount(<FinalEditionPage edition={editionFixture({ mine: 'italy' })} />);
    const mine = (await screen.findByText('votre feuillet')).parentElement!;
    expect(mine.textContent).toMatch(/Tombé .*\./);
    expect(screen.getAllByText(/Son sol est passé aux irréguliers/).length).toBe(1);
  });

  it('compte les dépêches de chaque nation au carnet', async () => {
    mount(<FinalEditionPage edition={editionFixture()} />);
    const carnet = (await screen.findByText('Le carnet des trois nations')).closest('.fe-fold')!;
    expect(within(carnet as HTMLElement).getAllByText('Dépêches')).toHaveLength(3);
    expect(within(carnet as HTMLElement).getByText('41')).toBeTruthy();
  });

  it('ouvre le feuillet depuis l’oreille, puis celui d’une autre nation', async () => {
    mount(<FinalEditionPage edition={editionFixture()} />);
    fireEvent.click(await screen.findByText('votre feuillet'));
    expect(screen.getByRole('heading', { name: 'Votre feuillet' })).toBeTruthy();
    expect(screen.getByText('Le territoire, édition par édition')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Allemagne/ }));
    expect(screen.getByRole('heading', { name: 'Le feuillet de l’Allemagne' })).toBeTruthy();
    fireEvent.click(screen.getByText('revenir à la une'));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('montre la une en image, ma ligne en pied par défaut, la une neutre en une case', async () => {
    mount(<FinalEditionPage edition={editionFixture()} />);
    fireEvent.click(await screen.findByText('Enregistrer la une'));
    const sheet = screen.getByRole('dialog', { name: 'La une, en image' });
    const mine = within(sheet).getByRole('button', { name: 'Ma saison' });
    expect(mine.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Rien de moi' }));
    expect(mine.getAttribute('aria-pressed')).toBe('false');
  });

  it('au téléphone, colle la ligne du joueur dès le haut, repliée, et la déplie au toucher', async () => {
    narrow = true;
    mount(<FinalEditionPage edition={editionFixture()} />);
    const pin = await screen.findByRole('button', { expanded: false });
    fireEvent.click(pin);
    expect(pin.getAttribute('aria-expanded')).toBe('true');
  });
});
