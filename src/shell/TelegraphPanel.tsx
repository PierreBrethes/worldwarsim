import { useMutation } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { fr } from '@/i18n/fr';
import type { Telegraph } from '@/data/telegraph';
import type { Seat } from '@/data/session';
import { TelegraphThread } from './TelegraphThread';

/**
 * **Le télégraphe est un seul widget** : onglets Général et privés, fil groupé par auteur. La
 * fenêtre du plateau et le salon le posent chacun dans son cadre ; ce hook porte ce qu'ils
 * partagent, l'onglet courant et la date de lecture, qui se pose en le quittant.
 */
export function useTelegraphTabs(telegraph: Telegraph, seat: Seat) {
  const markRead = useMutation(api.messages.markRead);
  const [active, setActive] = useState<Id<'players'> | null>(null);
  const channel = telegraph.direct.find((candidate) => candidate.with === active);
  const leave = useCallback(
    () => void markRead(active === null ? seat : { ...seat, with: active }).catch(() => undefined),
    [markRead, seat, active],
  );
  const open = (next: Id<'players'> | null) => {
    if (next === active) return;
    leave();
    setActive(next);
  };
  return { active, channel, leave, open };
}

export function TelegraphPanel({
  telegraph,
  tabs,
  seat,
  lobby = false,
  height,
  autoFocus = false,
  inset = '',
}: {
  telegraph: Telegraph;
  tabs: ReturnType<typeof useTelegraphTabs>;
  seat: Seat;
  lobby?: boolean;
  height: number | 'fill';
  autoFocus?: boolean;
  /** Marges du fil seul : les onglets restent à pleine largeur du cadre. */
  inset?: string;
}) {
  const { active, channel, open } = tabs;
  return (
    <>
      {telegraph.direct.length > 0 && (
        <div
          role="tablist"
          className="flex shrink-0 overflow-x-auto border-b border-[var(--ink)] text-[10px] tracking-[.14em] uppercase"
        >
          <Tab
            label={fr.telegraph.general}
            unread={telegraph.generalUnread}
            selected={active === null}
            onSelect={() => open(null)}
          />
          {telegraph.direct.map((other) => (
            <Tab
              key={other.with}
              label={other.nickname}
              ink={other.ink}
              unread={other.unread}
              selected={active === other.with}
              onSelect={() => open(other.with)}
            />
          ))}
        </div>
      )}
      <div className={`flex min-h-0 flex-1 flex-col ${inset}`}>
        <TelegraphThread
          key={active ?? 'general'}
          messages={channel === undefined ? telegraph.general : channel.messages}
          {...(channel === undefined ? {} : { to: channel.with })}
          seat={seat}
          lobby={lobby}
          height={height}
          autoFocus={autoFocus}
        />
      </div>
    </>
  );
}

/** Le salon n'a pas de bouton de fermeture : la lecture se date au démontage. */
export function useReadOnUnmount(leave: () => void): void {
  const latest = useRef(leave);
  latest.current = leave;
  useEffect(() => () => latest.current(), []);
}

function Tab({
  label,
  ink,
  unread,
  selected,
  onSelect,
}: {
  label: string;
  ink?: string;
  unread: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex shrink-0 cursor-pointer items-center gap-[6px] border-r border-(color:--ink)/30 px-3 py-[7px] font-semibold ${
        selected ? 'bg-[var(--ink)] text-[var(--paper)]' : 'hover:bg-(--ink)/10'
      }`}
      style={selected || ink === undefined ? undefined : { color: ink }}
    >
      {label}
      {!selected && unread > 0 && (
        <span
          aria-label={fr.rail.telegraphUnread(unread)}
          className="min-w-[16px] bg-[var(--critical)] px-1 text-center text-[9px] text-[var(--paper)]"
        >
          {unread}
        </span>
      )}
    </button>
  );
}
