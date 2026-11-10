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
import { setMapMotionSetting } from '@/data/mapMotion';
import { forgetSession, keepSession } from '@/data/session';
import { COUPON_DEPARTURE_MS, Landing } from './-index/Landing';
import { Route as ConnexionRoute } from './connexion';
import { Route as IndexRoute } from './index';

afterEach(() => {
  vi.useRealTimers();
  setMapMotionSetting('auto');
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

const coupon = () => screen.getByRole('region', { name: fr.front.coupon });
const struckCells = () => document.querySelectorAll('.code-cells [data-struck]').length;

/** Rendre l'horloge sans l'avancer laisse tomber tout délai encore en attente : une navigation
 *  qui arrive ensuite n'en attendait aucun. */
const opened = async (router: ReturnType<typeof mount>, code: string) => {
  vi.useRealTimers();
  await waitFor(() => expect(router.state.location.pathname).toBe(`/rejoindre/${code}`));
};

it('ouvre l’invitation au sixième caractère, en capitales, sans bouton, le temps que le coupon parte', async () => {
  const router = mount();
  const field = await codeField();
  expect(screen.queryByRole('button', { name: /invitation/ })).toBeNull();
  vi.useFakeTimers();

  fireEvent.change(field, { target: { value: 'k7q2p' } });
  expect(coupon().hasAttribute('data-leaving')).toBe(false);
  fireEvent.change(field, { target: { value: ' k7q2px ' } });
  expect(coupon().hasAttribute('data-leaving')).toBe(true);

  await vi.advanceTimersByTimeAsync(COUPON_DEPARTURE_MS - 1);
  expect(router.state.location.pathname).toBe('/');
  await vi.advanceTimersByTimeAsync(1);
  await opened(router, 'K7Q2PX');
});

/** Le délai décide seul : jsdom ne joue aucune animation et n'émet jamais `animationend`, et
 *  l'invitation s'ouvre quand même. Il reste court : l'animation récompense, elle ne retient pas. */
it('borne le départ du coupon à une demi-seconde', () => {
  expect(COUPON_DEPARTURE_MS).toBeGreaterThan(0);
  expect(COUPON_DEPARTURE_MS).toBeLessThanOrEqual(500);
});

it.each(['reduced', 'off'] as const)(
  'ouvre l’invitation sans délai ni départ quand les animations sont « %s »',
  async (setting) => {
    setMapMotionSetting(setting);
    const router = mount();
    const field = await codeField();
    vi.useFakeTimers();

    fireEvent.change(field, { target: { value: 'k7q2px' } });

    expect(coupon().hasAttribute('data-leaving')).toBe(false);
    await opened(router, 'K7Q2PX');
  },
);

it('frappe la case du caractère tapé, et aucune quand le code est collé', async () => {
  mount();
  const field = await codeField();

  fireEvent.change(field, { target: { value: 'k' } });
  expect(document.querySelectorAll('.code-cells span')[0]?.hasAttribute('data-struck')).toBe(true);
  fireEvent.change(field, { target: { value: 'k7' } });
  expect(document.querySelectorAll('.code-cells span')[1]?.hasAttribute('data-struck')).toBe(true);
  expect(struckCells()).toBe(1);

  fireEvent.change(field, { target: { value: 'k7q2p' } });
  expect(struckCells()).toBe(0);
});

it.each(['k7q2px', 'https://exemple.test/rejoindre/k7q2px?depuis=sms'])(
  'remplit les six cases d’un coup pour « %s » collé, puis détache le coupon',
  async (pasted) => {
    const router = mount();
    const field = await codeField();
    vi.useFakeTimers();

    fireEvent.change(field, { target: { value: pasted } });

    expect(struckCells()).toBe(0);
    expect(document.querySelectorAll('.code-cells [data-full]').length).toBe(6);
    expect(coupon().hasAttribute('data-leaving')).toBe(true);
    await vi.advanceTimersByTimeAsync(COUPON_DEPARTURE_MS);
    await opened(router, 'K7Q2PX');
  },
);

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
it('refuse à la frappe la lettre qu’aucun code ne porte : rien ne s’ouvre, le coupon reste', async () => {
  const router = mount();
  const field = await codeField();

  vi.useFakeTimers();

  fireEvent.change(field, { target: { value: 'k7q2p0' } });

  expect(screen.getByText(fr.codeField.stray('0'))).toBeTruthy();
  expect(coupon().hasAttribute('data-leaving')).toBe(false);
  await vi.advanceTimersByTimeAsync(COUPON_DEPARTURE_MS * 2);
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
