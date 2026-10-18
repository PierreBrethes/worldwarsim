import { insideWindow, minutesSinceMidnight, windowExit, type TimeWindow } from './rest-window';

/**
 * **Les notifications, sans base ni réseau** : ce qui part, groupé, et à quelle heure. Les
 * phrases vivent ici et non dans `src/i18n/fr.ts` : `fr.ts` tire le catalogue des pays et la moitié
 * du domaine, et le serveur n'a besoin que de six phrases — le choix est gravé dans
 * `WWS/docs/design/propositions/notifications-push-et-alarmes.md`. **Aucune ne nomme un pays ni
 * une nation** : un écran verrouillé est lu par n'importe qui, et ce que le brouillard cache à un
 * adversaire, il le cache à l'épaule d'un voisin.
 */
export const PUSH_TYPES = [
  'attack',
  'outpost',
  'sighting',
  'dryFire',
  'season',
  'telegraph',
] as const;

export type PushType = (typeof PUSH_TYPES)[number];

export type PushPreferences = Readonly<Record<PushType, boolean>>;

/** Un compte qui n'a rien écrit a tout coché ; un champ que le schéma ajoutera plus tard aussi. */
export const pushPreferencesOf = (written: Partial<PushPreferences> | undefined): PushPreferences =>
  Object.fromEntries(PUSH_TYPES.map((type) => [type, written?.[type] ?? true])) as PushPreferences;

/** Le joueur est « en jeu » s'il a battu depuis moins de deux minutes. */
export const IN_PLAY_WINDOW_MS = 2 * 60_000;
export const TELEGRAPH_PUSH_INTERVAL_MS = 60 * 60_000;
export const FLUSH_DELAY_MS = 60_000;

export const push = {
  title: 'La Manchette',
  attack: 'Une passe de résolution a eu lieu : une de vos forces a été attaquée.',
  outpostDisabled: 'Un de vos avant-postes est désactivé.',
  foundationLost: 'Un de vos avant-postes en chantier est détruit avec sa garnison.',
  captureThreat: 'Un de vos sites est en cours de capture.',
  siteLost: 'Un de vos sites a été capturé.',
  sighting: 'Une colonne adverse a été relevée dans une de vos portées.',
  dryFire: 'Des troupes à sec n’ont pas tiré : sans coups, ni frappe ni riposte.',
  seasonLaunched: 'La saison est lancée.',
  rendezvousSoon: (minutes: number) => `La Blitz commence dans ${minutes} minutes : à table.`,
  seasonConcluded: 'La saison est close.',
  seasonDominated: 'La saison est dominée : un belligérant l’emporte.',
  telegraphOne: 'Un message au télégraphe.',
  telegraphMany: (count: number) => `${count} messages au télégraphe.`,
  alarmLabels: {
    attack: (count: number) =>
      count === 1 ? 'une passe de résolution' : `${count} passes de résolution`,
    outpost: (count: number) =>
      count === 1
        ? 'un avant-poste désactivé ou détruit'
        : `${count} avant-postes désactivés ou détruits`,
    sighting: (count: number) =>
      count === 1 ? 'une colonne relevée' : `${count} colonnes relevées`,
    dryFire: (count: number) => (count === 1 ? 'un tir à sec' : `${count} tirs à sec`),
    season: (count: number) =>
      count === 1 ? 'une nouvelle de la saison' : `${count} nouvelles de la saison`,
  },
  alarmSummary: (count: number, labels: string) => `${count} alarmes : ${labels}.`,
} as const;

/** `windows` est une fenêtre de `board-search.ts` : le plateau ne lit la saison que dans le
 *  stockage local, donc l'adresse n'en porte pas. */
export const journalUrl = '/plateau?windows=journal';
export const telegraphUrl = '/plateau?windows=telegraph';

/**
 * **Une attaque seule ouvre sa dépêche, pas le journal** (lot mobile-3, §6) : l'adresse porte
 * l'identifiant de l'engagement, et rien de ce que l'écran verrouillé affiche ne change — la
 * phrase reste celle de `push.attack`, qui ne nomme personne. Le plateau la lit (`report`) et
 * centre la carte sur le lieu du combat.
 */
export const reportUrl = (reportId: string): string =>
  `/plateau?report=${encodeURIComponent(reportId)}`;

export type QueuedPush = {
  readonly type: PushType;
  readonly at: number;
  readonly phrase: string;
  readonly label: string;
  readonly url: string;
};

export type OutgoingPush = {
  readonly body: string;
  readonly url: string;
  readonly tag: string;
};

const ALARM_ORDER: ReadonlyArray<Exclude<PushType, 'telegraph'>> = [
  'attack',
  'outpost',
  'sighting',
  'dryFire',
  'season',
];

/**
 * **Le reste part en une seule notification** : un événement, sa phrase ; plusieurs, un résumé.
 * Le télégraphe est tenu à part — il a sa propre cadence.
 *
 * **Une alarme seule ouvre sa propre adresse** — sa dépêche pour une attaque, l'accueil pour le
 * rappel d'une Blitz, le journal pour le reste. **En lot, l'adresse suit les attaques, pas le
 * compte des alarmes** (lot mobile-3, §6). Une seule attaque dans le lot ouvre sa dépêche, même quand la colonne relevée en approche part dans la
 * même minute — c'est le cas ordinaire, le relevé précède l'arrivée de peu. Plusieurs attaques
 * gardent le journal : une adresse ne mène qu'à une dépêche, et choisir l'une tairait les autres.
 */
export function groupAlarms(
  rows: ReadonlyArray<QueuedPush>,
  seasonId: string,
): OutgoingPush | null {
  const alarms = rows.filter((row) => row.type !== 'telegraph').sort((a, b) => a.at - b.at);
  if (alarms.length === 0) return null;
  const tag = `${seasonId}:alarms`;
  const attacks = alarms.filter((row) => row.type === 'attack');
  const url = attacks.length === 1 ? attacks[0]!.url : journalUrl;
  if (alarms.length === 1) return { body: alarms[0]!.phrase, url: alarms[0]!.url, tag };
  const labels = ALARM_ORDER.flatMap((type) => {
    const count = alarms.filter((row) => row.type === type).length;
    return count === 0 ? [] : [push.alarmLabels[type](count)];
  }).join(', ');
  return { body: push.alarmSummary(alarms.length, labels), url, tag };
}

export function groupTelegraph(count: number, seasonId: string): OutgoingPush | null {
  if (count === 0) return null;
  return {
    body: count === 1 ? push.telegraphOne : push.telegraphMany(count),
    url: telegraphUrl,
    tag: `${seasonId}:telegraph`,
  };
}

export type SeatHolding = {
  readonly presentAt: number | null;
  readonly restWindow: TimeWindow;
  readonly telegraphPushedAt: number | null;
};

export type SeatReading = {
  /** La fin de la fenêtre de repos si on y est, sinon `null` : rien ne part avant, et le vidage
   *  revient à cet instant. Le repos passe devant la présence — un joueur qui veille tard dans sa
   *  nuit a déclaré qu'il ne voulait pas être dérangé, et veiller ne lui retire pas ce droit. */
  readonly restUntil: number | null;
  /** Vu depuis moins de deux minutes : l'écran montre déjà les alarmes, elles sont abandonnées. */
  readonly inPlay: boolean;
  readonly telegraphAllowed: boolean;
  readonly telegraphRetryAt: number | null;
};

export function readSeat(seat: SeatHolding, now: number): SeatReading {
  const resting = insideWindow(minutesSinceMidnight(now), seat.restWindow);
  const restUntil = resting ? windowExit(now, seat.restWindow) : null;
  const inPlay = seat.presentAt !== null && now - seat.presentAt < IN_PLAY_WINDOW_MS;
  const nextTelegraphAt =
    seat.telegraphPushedAt === null ? null : seat.telegraphPushedAt + TELEGRAPH_PUSH_INTERVAL_MS;
  const telegraphAllowed = nextTelegraphAt === null || nextTelegraphAt <= now;
  return {
    restUntil,
    inPlay,
    telegraphAllowed,
    telegraphRetryAt: telegraphAllowed ? null : nextTelegraphAt,
  };
}

/** Un compte garde ses dix derniers appareils : au-delà le plus ancien cède la place, et un
 *  compte ne devient pas un moyen de faire partir cent requêtes d'un seul appel. */
export const MAX_PUSH_DEVICES = 10;
export const PUSH_TEST_INTERVAL_MS = 10_000;
/** Une clé P-256 non compressée fait 87 caractères en base64url, le secret 22. */
export const PUSH_KEY_MAX_LENGTH = 256;

/** Les services de push des navigateurs : FCM (Chrome, Edge, Brave, Opera, Vivaldi, Samsung
 *  Internet), Mozilla autopush (Firefox), Apple (Safari macOS et iOS), WNS (Edge sous Windows). */
const PUSH_SERVICE_SUFFIXES = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

/**
 * **Une adresse de service de push connu, et pas autre chose.** L'endpoint vient du client et
 * c'est le serveur qui l'appelle : une liste noire de formes d'hôtes se contourne par le DNS
 * (`127.0.0.1.nip.io`), une liste blanche de domaines non. HTTPS sur son port, sans identifiants.
 * Un navigateur au service exotique ne s'abonne pas — c'est le prix.
 */
export function isPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return PUSH_SERVICE_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * **Le libellé d'un appareil, tiré de l'user-agent** — pour la liste des Réglages, pas pour
 * identifier : « Chrome sur Android », « Safari sur iPhone ». Ce qu'on ne reconnaît pas reste
 * « Appareil inconnu » plutôt qu'une chaîne brute de quatre-vingts caractères.
 */
export function deviceLabelOf(userAgent: string): string {
  const system = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'Mac'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(userAgent)
        ? 'Firefox'
        : /Chrome\/|CriOS/.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  if (browser === null && system === null) return 'Appareil inconnu';
  if (browser === null) return system!;
  return system === null ? browser : `${browser} sur ${system}`;
}
