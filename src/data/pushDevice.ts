import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  applicationServerKeyOf,
  pushSupportOf,
  type DeviceCapabilities,
  type PushSupport,
} from '@/domain/push-device';
import type { Seat } from './session';

function readCapabilities(): DeviceCapabilities {
  const apple =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return {
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : null,
    appleDevice: apple,
    installed:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** L'adresse de cet appareil auprès du service de push, `null` s'il n'est pas abonné. La
 *  déconnexion la donne au serveur pour que l'appareil cesse de sonner pour ce compte. */
export async function currentPushEndpoint(): Promise<string | null> {
  return (await currentSubscription())?.endpoint ?? null;
}

export type PushDevice = {
  readonly support: PushSupport;
  /** `false` tant que le serveur n'a pas de clé VAPID ; `undefined` le temps de la lire. */
  readonly configured: boolean | undefined;
  readonly active: boolean;
  readonly busy: boolean;
  readonly failed: boolean;
  readonly enable: () => Promise<void>;
  readonly disable: () => Promise<void>;
  readonly sendTest: () => Promise<void>;
};

/**
 * **L'abonnement de cet appareil**, de la permission jusqu'au serveur. La permission ne se
 * demande qu'à `enable`, c'est-à-dire depuis le clic sur la case — un navigateur qui voit la
 * demande au chargement la bloque pour de bon.
 */
export function usePushDevice(seat: Seat): PushDevice {
  const [capabilities, setCapabilities] = useState(readCapabilities);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const publicKey = useQuery(api.notifications.publicKey, {});
  const subscribed = useQuery(
    api.notifications.subscribed,
    endpoint === null ? 'skip' : { token: seat.token, endpoint },
  );
  const subscribe = useMutation(api.notifications.subscribe);
  const unsubscribe = useMutation(api.notifications.unsubscribe);
  const sendTestMutation = useMutation(api.notifications.sendTest);

  useEffect(() => {
    let current = true;
    void currentPushEndpoint().then((found) => {
      if (current) setEndpoint(found);
    });
    return () => {
      current = false;
    };
  }, []);

  const attempt = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setFailed(false);
    try {
      await work();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const enable = useCallback(
    () =>
      attempt(async () => {
        const permission = await Notification.requestPermission();
        setCapabilities(readCapabilities());
        if (permission !== 'granted' || !publicKey) return;
        const registration = await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKeyOf(publicKey),
          }));
        const { endpoint: address, keys } = subscription.toJSON();
        if (!address || !keys?.p256dh || !keys.auth) throw new Error('abonnement incomplet');
        await subscribe({
          token: seat.token,
          endpoint: address,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: navigator.userAgent,
        });
        setEndpoint(address);
      }),
    [attempt, publicKey, seat.token, subscribe],
  );

  const disable = useCallback(
    () =>
      attempt(async () => {
        const subscription = await currentSubscription();
        if (subscription !== null) {
          await unsubscribe({ token: seat.token, endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setEndpoint(null);
      }),
    [attempt, seat.token, unsubscribe],
  );

  const sendTest = useCallback(
    () =>
      attempt(async () => {
        await sendTestMutation({ token: seat.token });
      }),
    [attempt, seat.token, sendTestMutation],
  );

  return {
    support: pushSupportOf(capabilities),
    configured: publicKey === undefined ? undefined : publicKey !== null,
    active: endpoint !== null && subscribed === true,
    busy,
    failed,
    enable,
    disable,
    sendTest,
  };
}
