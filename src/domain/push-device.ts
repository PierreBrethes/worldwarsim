/**
 * **Ce que cet appareil peut faire des notifications**, jugé sur ce que le navigateur dit de lui —
 * sans toucher au navigateur, pour que les quatre cas se testent à la main. Le quatrième, la case
 * qui s'active, est le seul où quelque chose se demande ; les trois autres sont des phrases au
 * lieu d'une case morte (ADR 0015).
 */
export type DeviceCapabilities = {
  readonly serviceWorker: boolean;
  readonly pushManager: boolean;
  readonly notification: boolean;
  readonly permission: NotificationPermission | null;
  readonly appleDevice: boolean;
  /** Ouvert depuis l'icône de l'écran d'accueil. */
  readonly installed: boolean;
};

export type PushSupport = 'unsupported' | 'needs-install' | 'denied' | 'available';

/**
 * Sur iPhone, Safari n'expose Web Push qu'à une application ajoutée à l'écran d'accueil : dans
 * l'onglet l'API est simplement absente, et « navigateur sans Web Push » mentirait — la bonne
 * phrase est celle de l'installation, qui passe donc avant.
 */
export function pushSupportOf(capabilities: DeviceCapabilities): PushSupport {
  if (capabilities.appleDevice && !capabilities.installed) return 'needs-install';
  if (!capabilities.serviceWorker || !capabilities.pushManager || !capabilities.notification) {
    return 'unsupported';
  }
  return capabilities.permission === 'denied' ? 'denied' : 'available';
}

/** La clé publique VAPID arrive en base64 d'URL ; `subscribe` la veut en octets. */
export function applicationServerKeyOf(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let rank = 0; rank < raw.length; rank += 1) bytes[rank] = raw.charCodeAt(rank);
  return bytes;
}
