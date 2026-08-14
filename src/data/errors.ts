import { ConvexError } from 'convex/values';
import type { ErrorCode } from '../../convex/errors';
import { fr } from '@/i18n/fr';
import { notify } from '@/shell/notifications';

/**
 * The server only speaks in codes (see `convex/errors.ts`); `fr.errors` turns each code into
 * a French sentence. A code without an entry is a bug — it goes out as a generic notification
 * rather than a blank screen, and the console keeps the detail.
 */
export function errorCode(error: unknown): ErrorCode | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (typeof data !== 'object' || data === null) return null;
  const code = (data as { code?: unknown }).code;
  return typeof code === 'string' && code in fr.errors ? (code as ErrorCode) : null;
}

/** The French sentence of an expected error; `null` when it was not foreseen. */
export function errorMessage(error: unknown): string | null {
  const code = errorCode(error);
  if (code === null) return null;
  return fr.errors[code]((error as ConvexError<never>).data as Record<string, unknown>);
}

/**
 * The standard handling of a failed mutation: an expected error shows where the player acts,
 * an unexpected one goes out as a notification — never a silent screen.
 */
export function handleError(error: unknown, inline: (message: string) => void): void {
  const message = errorMessage(error);
  if (message !== null) {
    inline(message);
    return;
  }
  console.error(error);
  notify(fr.unexpectedError);
}
