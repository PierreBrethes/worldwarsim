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
import { forgetSession, keepSession } from '@/data/session';
import { Landing } from './-index/Landing';
import { Route as ConnexionRoute } from './connexion';
import { Route as IndexRoute } from './index';

afterEach(() => {
  cleanup();
  forgetSession();
});

/** jsdom n'évalue aucune requête média et ne joue aucune vidéo : la une doit tenir avec sa
 *  photographie fixe. */
vi.stubGlobal('matchMedia', (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
}));

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

it('sert la une à qui n’a pas de session', async () => {
  mount();
  expect(await screen.findByRole('heading', { name: fr.front.headline })).toBeTruthy();
  expect(screen.getByLabelText(fr.front.bureau.codeTitle)).toBeTruthy();
});

it('dit les deux éditions, la Mondiale en jours', async () => {
  mount();
  expect(await screen.findByText(/^3 à 14 jours/)).toBeTruthy();
  expect(screen.getByText(/^1 à 2 h/)).toBeTruthy();
});

it('met une image fixe à la place du film, qui n’est pas encore là', async () => {
  mount();
  await screen.findByRole('heading', { name: fr.front.headline });
  expect(screen.getByRole('img', { name: fr.front.posterAlt })).toBeTruthy();
});

it('mène « fonder une partie » à l’ouverture d’un dossier, « j’ai un dossier » à la connexion', async () => {
  const router = mount();
  fireEvent.click(await screen.findByRole('link', { name: fr.front.bureau.found }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/connexion'));
  expect(router.state.location.search).toEqual({ ouvrir: true });

  await router.navigate({ to: '/' });
  fireEvent.click(await screen.findByRole('link', { name: fr.front.bureau.haveFile }));
  await waitFor(() => expect(router.state.location.search).toEqual({}));
});

it('dit en rouge ce qui manque à un code incomplet, sans griser le bouton', async () => {
  const router = mount();
  const field = await screen.findByLabelText(fr.front.bureau.codeTitle);
  const open = screen.getByRole('button', { name: fr.front.bureau.open });
  expect(open).toHaveProperty('disabled', false);

  fireEvent.change(field, { target: { value: 'k7m2' } });
  const say = screen.getByText(fr.front.bureau.say.missing(2));
  expect(say.className).toContain('lp-refus');

  fireEvent.click(open);
  expect(router.state.location.pathname).toBe('/');
  expect(document.activeElement).toBe(field);
});

it('renvoie à l’accueil qui a une session', async () => {
  keepSession('un-jeton');
  const router = mount();
  expect(await screen.findByText('accueil')).toBeTruthy();
  expect(router.state.location.pathname).toBe('/accueil');
});

it('ouvre l’invitation au sixième caractère, en capitales', async () => {
  const router = mount();
  const field = await screen.findByLabelText(fr.front.bureau.codeTitle);

  fireEvent.change(field, { target: { value: ' k7q2px ' } });
  fireEvent.submit(field);

  await waitFor(() => expect(router.state.location.pathname).toBe('/rejoindre/K7Q2PX'));
});

/** Un collage « ·K7Q2PX » porte une espace de tête : un `maxlength` natif la compterait et
 *  couperait le dernier caractère avant que `accept` ne la retire. Pas de `userEvent` ici : le
 *  garde est l'attribut absent, que `fireEvent.change` ne peut pas contourner. */
it('ne borne pas le champ avant le nettoyage du collage', async () => {
  mount();
  const field = await screen.findByLabelText(fr.front.bureau.codeTitle);
  expect(field.hasAttribute('maxlength')).toBe(false);
});

it('dit « touchez » au doigt et « un clic » à la souris, avec les mots du jeu', async () => {
  mount();
  expect(await screen.findByText(fr.front.gestures.lift.text(false))).toBeTruthy();
  expect(screen.getByText(fr.front.gestures.place.text(fr.errors.DISEMBARK_AT_SEA()))).toBeTruthy();
  expect(screen.getByText(fr.aim.submit)).toBeTruthy();
  cleanup();

  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  mount();
  expect(await screen.findByText(fr.front.gestures.lift.text(true))).toBeTruthy();
});
