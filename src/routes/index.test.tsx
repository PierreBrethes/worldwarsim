// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { fr } from '@/i18n/fr';
import { peekArrival, takeArrival } from '@/data/arrival';
import { forgetSession, keepSession } from '@/data/session';
import { Landing } from './-index/Landing';
import { Route as ConnexionRoute } from './connexion';
import { Route as IndexRoute } from './index';

afterEach(() => {
  cleanup();
  forgetSession();
  takeArrival();
});

/** jsdom n'évalue aucune requête média, ne mesure rien et ne joue aucune vidéo. */
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
);

/** La vraie garde de `/`, et deux pages témoins à la place des surfaces qu'elle ouvre : l'arbre
 *  réel monterait le plateau, three.js compris, pour vérifier une redirection. */
const mount = () => {
  const root = createRootRoute({ component: Outlet });
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    beforeLoad: (context) => IndexRoute.options.beforeLoad?.(context as never),
    component: Landing,
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/accueil',
    component: () => <p>accueil</p>,
  });
  const invitation = createRoute({
    getParentRoute: () => root,
    path: '/rejoindre/$code',
    component: function Invitation() {
      return <p>invitation {invitation.useParams().code}</p>;
    },
  });
  const connexion = createRoute({
    getParentRoute: () => root,
    path: '/connexion',
    validateSearch: ConnexionRoute.options.validateSearch,
    component: () => <p>connexion</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([index, home, invitation, connexion]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(<RouterProvider router={router} />);
  return router;
};

const codeField = () => screen.findByLabelText(fr.front.codeLabel);

it('sert la une à qui n’a pas de session : son titre, sa carte, son coupon', async () => {
  mount();
  expect(await screen.findByRole('heading', { name: fr.front.headline })).toBeTruthy();
  expect(screen.getByRole('img', { name: fr.front.mapLabel })).toBeTruthy();
  expect(await codeField()).toBeTruthy();
});

it('cercle les sept points de la course sur la carte, par leur nom', async () => {
  mount();
  await screen.findByRole('heading', { name: fr.front.headline });
  for (const name of [
    'Narvik',
    'Tanger',
    'Lisbonne',
    'Istanbul',
    'Halifax',
    'Hong Kong',
    'Rangoun',
  ])
    expect(screen.getByText(name.toUpperCase())).toBeTruthy();
});

/** Rien du film ne se télécharge pour qui ne le demande pas : ni la vidéo ni son affiche. */
it('ne monte le film qu’à la demande', async () => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  mount();
  const open = await screen.findByRole('button', { name: fr.front.film });
  expect(document.querySelector('video')).toBeNull();
  expect(document.querySelector('img')).toBeNull();

  fireEvent.click(open);
  expect(document.querySelector('video')).not.toBeNull();
});

it('mène « fonder une partie » à l’ouverture d’un dossier puis à la fondation, « entrer » à la connexion', async () => {
  const router = mount();
  fireEvent.click(await screen.findByRole('link', { name: fr.front.found }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/connexion'));
  expect(router.state.location.search).toEqual({ ouvrir: true, suite: 'fonder' });

  await router.navigate({ to: '/' });
  fireEvent.click(await screen.findByRole('link', { name: fr.front.enter }));
  await waitFor(() => expect(router.state.location.search).toEqual({}));
});

it('ouvre l’invitation au sixième caractère, en capitales, sans bouton', async () => {
  const router = mount();
  const field = await codeField();
  expect(screen.queryByRole('button', { name: /invitation/ })).toBeNull();

  fireEvent.change(field, { target: { value: 'k7q2p' } });
  expect(router.state.location.pathname).toBe('/');
  fireEvent.change(field, { target: { value: ' k7q2px ' } });

  await waitFor(() => expect(router.state.location.pathname).toBe('/rejoindre/K7Q2PX'));
});

it('prévient avant la frappe que l’invitation s’ouvre au sixième caractère', async () => {
  mount();
  const field = await codeField();
  const said = document.getElementById(field.getAttribute('aria-describedby')!);
  expect(said?.textContent).toBe(fr.codeField.hint);
});

it('dit en rouge ce qui manque à un code incomplet qu’on valide, et garde la main dans le champ', async () => {
  const router = mount();
  const field = await codeField();

  fireEvent.change(field, { target: { value: 'k7m2' } });
  expect(screen.queryByText(fr.codeField.missing(2))).toBeNull();
  fireEvent.submit(field);

  const say = screen.getByText(fr.codeField.missing(2));
  expect(say.parentElement?.hasAttribute('data-refusal')).toBe(true);
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(router.state.location.pathname).toBe('/');
  expect(document.activeElement).toBe(field);
});

/** Un code que l'alphabet ne tire jamais n'ouvre rien : la page d'invitation n'aurait fait que
 *  le refuser, un écran plus loin. */
it('refuse à la frappe la lettre qu’aucun code ne porte, et n’ouvre pas avec elle', async () => {
  const router = mount();
  const field = await codeField();

  fireEvent.change(field, { target: { value: 'k7q2p0' } });

  expect(screen.getByText(fr.codeField.stray('0'))).toBeTruthy();
  expect(router.state.location.pathname).toBe('/');
});

/** Un collage « ·K7Q2PX » porte une espace de tête : un `maxlength` natif la compterait et
 *  couperait le dernier caractère avant que le champ ne la retire. Pas de `userEvent` ici : le
 *  garde est l'attribut absent, que `fireEvent.change` ne peut pas contourner. */
it('ne borne pas le champ avant le nettoyage du collage', async () => {
  mount();
  expect((await codeField()).hasAttribute('maxlength')).toBe(false);
});

it('renvoie à l’accueil qui a une session, et dit qu’on arrive', async () => {
  keepSession('un-jeton');
  const router = mount();
  expect(await screen.findByText('accueil')).toBeTruthy();
  expect(router.state.location.pathname).toBe('/accueil');
  expect(peekArrival()).toBe(true);
});

it('n’annonce aucune arrivée à qui lit la une', async () => {
  mount();
  await screen.findByRole('heading', { name: fr.front.headline });
  expect(peekArrival()).toBe(false);
});
