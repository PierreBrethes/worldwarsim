import { useMutation } from 'convex/react';
import { useCallback, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { fr } from '@/i18n/fr';
import type { Telegraph } from '@/data/telegraph';
import { TelegraphThread } from '@/shell/TelegraphThread';
import { useNarrowScreen } from '@/shell/viewport';
import { DragHandle } from './Draggable';
import { FloatingWindow, useWindowSized, type WindowProps } from './Window';
import type { Seat } from '@/data/session';

/**
 * **Le cadre du plateau, et rien de plus** : le fil et son champ d'envoi sont partagés avec le
 * salon (`shell/TelegraphThread.tsx`), qui les porte à demeure. Ce qui appartient en propre à
 * cette surface tient en trois choses — elle s'ouvre, elle se pousse, et elle se ferme, ce qui
 * est le geste qui date la lecture.
 */
export function TelegraphWindow({
  telegraph,
  seat,
  onClose,
  ...windowProps
}: WindowProps & { telegraph: Telegraph; seat: Seat }) {
  const sized = useWindowSized();
  const narrow = useNarrowScreen();
  const markRead = useMutation(api.messages.markRead);
  const [active, setActive] = useState<Id<'players'> | null>(null);
  const channel = telegraph.direct.find((candidate) => candidate.with === active);

  /** Lu à la fermeture, comme le journal : ce qu'on a eu le temps de voir est lu. Chaque canal se
   *  date quand on le quitte, par un autre onglet ou par la fermeture. */
  const leave = useCallback(
    () => void markRead(active === null ? seat : { ...seat, with: active }).catch(() => undefined),
    [markRead, seat, active],
  );
  const close = useCallback(() => {
    leave();
    onClose();
  }, [leave, onClose]);
  const open = (next: Id<'players'> | null) => {
    if (next === active) return;
    leave();
    setActive(next);
  };

  return (
    <FloatingWindow name="telegraph" onClose={close} {...windowProps} width={460}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        {/* **Sous le seuil, le fil prend toute la hauteur** (refonte mobile, 1i) : l'en-tête tient
            une ligne, le champ reste collé au clavier. */}
        {narrow ? (
          <div className="flex h-[52px] shrink-0 items-center gap-[10px] border-b border-[var(--ink)] pr-3 pl-4">
            {/* Le canal passe sous le titre : à côté, à 375 px, il ne gardait que « ca… ». */}
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="font-(family-name:--font-display) text-[21px] leading-none font-extrabold tracking-[.04em] uppercase">
                {fr.telegraph.header}
              </span>
              <span className="truncate font-(family-name:--font-display) text-[13px] leading-none text-[var(--ink-quiet)] italic">
                {channel === undefined
                  ? fr.telegraph.channel
                  : fr.telegraph.privateChannel(channel.nickname)}
              </span>
            </span>
            <button
              type="button"
              onClick={close}
              className="shrink-0 cursor-pointer border border-[var(--ink)] px-3 text-[10px] font-semibold tracking-[.18em] uppercase"
            >
              {fr.common.close}
            </button>
          </div>
        ) : (
          <DragHandle className="flex shrink-0 items-center justify-between border-b border-[var(--ink)] px-4 py-[9px]">
            <span className="eyebrow">{fr.telegraph.header}</span>
            <span className="font-(family-name:--font-display) text-[12px] text-[var(--ink-quiet)] italic">
              {channel === undefined
                ? fr.telegraph.channel
                : fr.telegraph.privateChannel(channel.nickname)}
            </span>
            <button
              type="button"
              onClick={close}
              className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.common.close}
            </button>
          </DragHandle>
        )}

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

        <div className={`flex min-h-0 flex-1 flex-col ${narrow ? '' : 'px-4 py-2'}`}>
          <TelegraphThread
            key={active ?? 'general'}
            messages={channel === undefined ? telegraph.messages : channel.messages}
            {...(channel === undefined ? {} : { to: channel.with })}
            seat={seat}
            height={sized ? 'fill' : 420}
            autoFocus
          />
        </div>
      </div>
    </FloatingWindow>
  );
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
