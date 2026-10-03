import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { usePushDevice } from '@/data/pushDevice';
import type { Seat } from '@/data/session';
import { PUSH_TYPES } from '@/domain/push';

const words = fr.settingsWindow.notifications;

/**
 * **Deux étages, deux portées.** La case du haut est l'appareil : elle demande la permission du
 * navigateur depuis le clic, puis abonne. Celles du bas sont le compte, modifiables même quand cet
 * appareil n'est pas abonné.
 */
export function NotificationsSection({ seat }: { seat: Seat }) {
  const device = usePushDevice(seat);
  const preferences = useQuery(api.notifications.preferences, { token: seat.token });
  const setPreference = useMutation(api.notifications.setPreference);

  const blocked =
    device.support === 'unsupported'
      ? words.unsupported
      : device.support === 'needs-install'
        ? words.needsInstall
        : device.support === 'denied'
          ? words.denied
          : device.configured === false
            ? words.unconfigured
            : null;

  return (
    <div className="mt-[18px] border-t border-(color:--ink)/22 pt-[14px]">
      <span className="eyebrow">{words.header}</span>

      <label className="mt-[10px] flex items-baseline gap-[10px] text-[13.5px] text-[var(--ink)]">
        <input
          type="checkbox"
          className="accent-[var(--ink)]"
          checked={device.active}
          disabled={blocked !== null || device.busy}
          onChange={() => void (device.active ? device.disable() : device.enable())}
        />
        {words.deviceLabel}
      </label>
      <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">{blocked ?? words.deviceNote}</p>
      {device.failed && (
        <p role="alert" className="mt-[3px] text-[11.5px] text-[var(--critical)]">
          {words.failed}
        </p>
      )}

      <div className="mt-[14px] text-[13.5px] text-[var(--ink)]">{words.typesLabel}</div>
      <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">{words.typesNote}</p>
      <div className="mt-[8px] flex flex-col gap-[6px]">
        {PUSH_TYPES.map((type) => (
          <label
            key={type}
            className="flex items-baseline gap-[10px] text-[12.5px] text-[var(--ink)]"
          >
            <input
              type="checkbox"
              className="accent-[var(--ink)]"
              checked={preferences?.[type] ?? true}
              onChange={(event) =>
                void setPreference({
                  token: seat.token,
                  type,
                  enabled: event.target.checked,
                }).catch(() => undefined)
              }
            />
            <span>
              {words.types[type]}
              {type === 'telegraph' && (
                <span className="text-[var(--ink-soft)]"> — {words.typeNotes.telegraph}</span>
              )}
            </span>
          </label>
        ))}
      </div>

      {device.active && (
        <div className="mt-[12px] flex flex-wrap items-baseline justify-between gap-2">
          <span className="min-w-[180px] flex-1 text-[11.5px] text-[var(--ink-soft)]">
            {words.testNote}
          </span>
          <button
            type="button"
            disabled={device.busy}
            onClick={() => void device.sendTest()}
            className="shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {words.test}
          </button>
        </div>
      )}
    </div>
  );
}
