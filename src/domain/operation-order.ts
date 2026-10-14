import {
  creationRefusalOf,
  seatRangeOf,
  type CreationRefusal,
  type SeasonMode,
} from './season-mode';
import { THEATRES, type TheatreId } from './theatres';

/**
 * **L'ordre d'opérations d'une partie** : ce que le fondateur règle à la fondation et reprend au
 * salon jusqu'au lancement (choix 5, 8, 9, 10 et M15 de la note du 14/10). Une seule fonction de
 * refus pour la fondation, la modification et l'écran (ADR 0015).
 */
export type Settings = {
  readonly mode: SeasonMode;
  /** Un théâtre de `THEATRES`, ou `THEATRE_DRAW` : tiré par la graine au lancement. */
  readonly theatre: string | null;
  /** Le rendez-vous d'une Blitz ; `null` : dès que la table est complète. */
  readonly scheduledAt: number | null;
  readonly remind: boolean | null;
  readonly hqCaptureHours: number | null;
  readonly seatCap: number | null;
};

export const THEATRE_DRAW = 'draw';
export const HQ_CAPTURE_HOURS = [12, 24] as const;
export const DEFAULT_HQ_CAPTURE_HOURS = 12;
export const REMINDER_MINUTES = 15;
/** Un battement toutes les 25 s au salon : trois manqués, on a quitté la table. */
export const LOBBY_BEAT_SECONDS = 25;
const AT_TABLE_MS = 3 * LOBBY_BEAT_SECONDS * 1000;

export type SettingsRefusal =
  | CreationRefusal
  | 'SETTING_NOT_IN_MODE'
  | 'INVALID_CAPTURE_HOURS'
  | 'RENDEZVOUS_PAST'
  | 'SEATS_OUT_OF_RANGE'
  | 'THEATRE_TOO_SMALL';

const rangeOf = (settings: Settings) => seatRangeOf(settings.mode, settings.theatre);

/** Le plafond de la table : ce que le mode et le théâtre tiennent, ou moins si le fondateur l'a dit. */
export const seatCapOf = (settings: Settings): number =>
  Math.min(settings.seatCap ?? Number.POSITIVE_INFINITY, rangeOf(settings).max);

export function settingsRefusalOf(
  settings: Settings,
  context: { readonly seated: number; readonly now: number; readonly rendezvousChanged: boolean },
): SettingsRefusal | null {
  const blitz = settings.mode === 'blitz';
  const theatre = settings.theatre === THEATRE_DRAW ? 'europe' : (settings.theatre ?? undefined);
  const created = creationRefusalOf(settings.mode, theatre);
  if (created !== null) return created;
  if (
    blitz
      ? settings.hqCaptureHours !== null
      : settings.scheduledAt !== null || settings.remind !== null
  ) {
    return 'SETTING_NOT_IN_MODE';
  }
  if (
    !blitz &&
    settings.hqCaptureHours !== null &&
    !HQ_CAPTURE_HOURS.some((hours) => hours === settings.hqCaptureHours)
  ) {
    return 'INVALID_CAPTURE_HOURS';
  }
  if (
    context.rendezvousChanged &&
    settings.scheduledAt !== null &&
    settings.scheduledAt <= context.now
  ) {
    return 'RENDEZVOUS_PAST';
  }
  const range = rangeOf(settings);
  if (context.seated > range.max) return 'THEATRE_TOO_SMALL';
  /** Au-delà du plafond, le plafond tient (`seatCapOf`) : passer à un théâtre plus petit ne
   *  demande pas de baisser les places d'abord. */
  if (settings.seatCap !== null && settings.seatCap < Math.max(range.min, context.seated)) {
    return 'SEATS_OUT_OF_RANGE';
  }
  return null;
}

export type Presence =
  | { readonly kind: 'present' }
  | { readonly kind: 'away'; readonly minutes: number }
  /** Une place d'avant la lampe : jamais mesurée, elle ne bloque rien. */
  | { readonly kind: 'unknown' };

export function presenceOf(seenAt: number | null, now: number): Presence {
  if (seenAt === null) return { kind: 'unknown' };
  if (now - seenAt < AT_TABLE_MS) return { kind: 'present' };
  return { kind: 'away', minutes: Math.floor((now - seenAt) / 60_000) };
}

export type LaunchRefusal =
  'NOT_ENOUGH_PLAYERS' | 'BLITZ_FULL' | 'PLAYERS_NOT_READY' | 'PLAYERS_ABSENT';

export type LaunchPlan =
  | { readonly refusal: null }
  | { readonly refusal: LaunchRefusal; readonly nicknames?: ReadonlyArray<string> };

/**
 * **Qui part au lancement** (choix 6, J1 b). En Blitz on joue ensemble : un absent bloque tant
 * que l'heure n'est pas venue ; passée l'heure, on part sans l'attendre mais **il garde sa
 * place** — posé comme les autres, il joue en arrivant en retard. Son « prêt » ne compte plus,
 * sa nation si : sans elle, rien à poser. Sans heure convenue (« table complète »), l'heure ne
 * vient jamais d'elle-même — le fondateur en fixe une. Celui qui lance est à la table.
 */
export function launchPlanOf<Id>(input: {
  readonly mode: SeasonMode;
  readonly scheduledAt: number | null;
  readonly range: { readonly min: number; readonly max: number };
  readonly now: number;
  readonly caller: Id;
  readonly seats: ReadonlyArray<{
    readonly id: Id;
    readonly nickname: string;
    readonly ready: boolean;
    readonly nation: boolean;
    readonly seenAt: number | null;
  }>;
}): LaunchPlan {
  const absent =
    input.mode === 'blitz'
      ? input.seats.filter(
          (seat) => seat.id !== input.caller && presenceOf(seat.seenAt, input.now).kind === 'away',
        )
      : [];
  const hourCome = input.scheduledAt !== null && input.now >= input.scheduledAt;
  if (absent.length > 0 && !hourCome) {
    return { refusal: 'PLAYERS_ABSENT', nicknames: absent.map((seat) => seat.nickname) };
  }
  if (input.seats.length < input.range.min) return { refusal: 'NOT_ENOUGH_PLAYERS' };
  if (input.mode === 'blitz' && input.seats.length > input.range.max) {
    return { refusal: 'BLITZ_FULL' };
  }
  const stragglers = input.seats.filter((seat) =>
    absent.includes(seat) ? !seat.nation : !seat.ready,
  );
  if (stragglers.length > 0) {
    return { refusal: 'PLAYERS_NOT_READY', nicknames: stragglers.map((seat) => seat.nickname) };
  }
  return { refusal: null };
}

/** Le théâtre « au sort » : parmi ceux qui assoient la table, par la graine de la saison. */
export function drawTheatre(seed: number, seated: number): TheatreId {
  const fitting = THEATRES.filter(
    (theatre) => theatre.players.min <= seated && seated <= theatre.players.max,
  );
  return fitting[Math.abs(Math.floor(seed)) % fitting.length]!.id;
}

/** Le rendez-vous par défaut : le prochain 21:00 de l'heure locale. */
export function nextEvening(now: Date): number {
  const evening = new Date(now);
  evening.setHours(21, 0, 0, 0);
  if (evening.getTime() <= now.getTime()) evening.setDate(evening.getDate() + 1);
  return evening.getTime();
}
