// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConvexProvider } from 'convex/react';
import type { ConvexReactClient } from 'convex/react';
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Seat } from '@/data/session';
import { fr } from '@/i18n/fr';
import { NotificationsSection } from './NotificationsSection';

const words = fr.settingsWindow.notifications;
const seat = { token: 'jeton', seasonId: 'season-1' } as unknown as Seat;
const ENDPOINT = 'https://push.example/appareil';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1';

type Environment = {
  userAgent?: string;
  standalone?: boolean;
  push?: boolean;
  permission?: NotificationPermission;
  subscribed?: boolean;
  publicKey?: string | null;
};

/** Le navigateur et le serveur tels que la section les voit : l'API Push est un bouchon, les
 *  requêtes répondent ce que le cas dit, et chaque mutation est un espion. */
function mount(environment: Environment = {}) {
  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p256dh', auth: 'auth' } }),
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  };
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(environment.subscribed ? subscription : null)),
    subscribe: vi.fn(() => Promise.resolve(subscription)),
  };
  const registration = { pushManager };
  vi.stubGlobal('navigator', {
    userAgent: environment.userAgent ?? 'Mozilla/5.0 Chrome/126.0',
    maxTouchPoints: 0,
    ...(environment.push === false
      ? {}
      : {
          serviceWorker: {
            ready: Promise.resolve(registration),
            getRegistration: () => Promise.resolve(registration),
          },
        }),
  });
  if (environment.push !== false) vi.stubGlobal('PushManager', class {});
  else vi.stubGlobal('PushManager', undefined);
  if (environment.push === false) delete (window as { PushManager?: unknown }).PushManager;
  const requestPermission = vi.fn(() => Promise.resolve('granted' as NotificationPermission));
  vi.stubGlobal('Notification', {
    permission: environment.permission ?? 'default',
    requestPermission,
  });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('standalone') && environment.standalone === true,
    media: query,
  }));

  const answers: Record<string, unknown> = {
    'notifications:publicKey': environment.publicKey === undefined ? 'AQID' : environment.publicKey,
    'notifications:subscribed': environment.subscribed === true,
    'notifications:preferences': {
      attack: true,
      outpost: true,
      sighting: false,
      dryFire: true,
      season: true,
      telegraph: true,
    },
  };
  const mutation = vi.fn((_reference: unknown, _args: unknown) => Promise.resolve(null));
  const client = {
    watchQuery: (query: Parameters<typeof getFunctionName>[0]) => ({
      localQueryResult: () => answers[getFunctionName(query)],
      onUpdate: () => () => {},
      journal: () => undefined,
    }),
    mutation,
  } as unknown as ConvexReactClient;
  render(
    <ConvexProvider client={client}>
      <NotificationsSection seat={seat} />
    </ConvexProvider>,
  );
  const named = (name: string) =>
    mutation.mock.calls.filter(([reference]) => getFunctionName(reference as never) === name);
  return { mutation, named, requestPermission, pushManager, subscription };
}

const deviceBox = () =>
  screen.getByRole('checkbox', { name: words.deviceLabel }) as HTMLInputElement;

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('dit que le navigateur ne sait pas, au lieu d’une case morte', () => {
  mount({ push: false });
  expect(screen.getByText(words.unsupported)).toBeTruthy();
  expect(deviceBox().disabled).toBe(true);
});

it('demande d’installer l’application sur un iPhone resté dans Safari', () => {
  mount({ userAgent: IPHONE, push: false });
  expect(screen.getByText(words.needsInstall)).toBeTruthy();
  expect(deviceBox().disabled).toBe(true);
});

it('dit que la permission est refusée, et renvoie aux réglages du navigateur', () => {
  mount({ permission: 'denied' });
  expect(screen.getByText(words.denied)).toBeTruthy();
  expect(deviceBox().disabled).toBe(true);
});

it('demande la permission au clic, puis abonne l’appareil au compte', async () => {
  const { requestPermission, pushManager, named } = mount();
  expect(requestPermission).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: words.test })).toBeNull();

  fireEvent.click(deviceBox());

  await waitFor(() => expect(named('notifications:subscribe')).toHaveLength(1));
  expect(requestPermission).toHaveBeenCalledOnce();
  expect(pushManager.subscribe).toHaveBeenCalledOnce();
  expect(named('notifications:subscribe')[0]![1]).toMatchObject({
    token: 'jeton',
    endpoint: ENDPOINT,
    p256dh: 'p256dh',
    auth: 'auth',
  });
});

it('est active quand l’appareil est abonné : on peut le désabonner et envoyer une dépêche d’essai', async () => {
  const { named, subscription } = mount({ permission: 'granted', subscribed: true });

  await waitFor(() => expect(deviceBox().checked).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: words.test }));
  await waitFor(() => expect(named('notifications:sendTest')).toHaveLength(1));

  fireEvent.click(deviceBox());
  await waitFor(() => expect(named('notifications:unsubscribe')).toHaveLength(1));
  expect(named('notifications:unsubscribe')[0]![1]).toEqual({ token: 'jeton', endpoint: ENDPOINT });
  expect(subscription.unsubscribe).toHaveBeenCalledOnce();
});

it('laisse les préférences du compte modifiables sans appareil abonné', async () => {
  const { named } = mount({ permission: 'denied' });

  expect(
    (screen.getByRole('checkbox', { name: words.types.sighting }) as HTMLInputElement).checked,
  ).toBe(false);
  fireEvent.click(screen.getByRole('checkbox', { name: words.types.sighting }));

  await waitFor(() => expect(named('notifications:setPreference')).toHaveLength(1));
  expect(named('notifications:setPreference')[0]![1]).toEqual({
    token: 'jeton',
    type: 'sighting',
    enabled: true,
  });
});
