import { useMutation } from 'convex/react';
import { useCallback } from 'react';
import { api } from '../../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import type { Telegraph } from '@/data/telegraph';
import { TelegraphThread } from '@/shell/TelegraphThread';
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
  const markRead = useMutation(api.messages.markRead);

  /** Lu à la fermeture, comme le journal : ce qu'on a eu le temps de voir est lu. */
  const close = useCallback(() => {
    void markRead(seat).catch(() => undefined);
    onClose();
  }, [markRead, seat, onClose]);

  return (
    <FloatingWindow name="telegraph" onClose={close} {...windowProps} width={460}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <DragHandle className="flex shrink-0 items-center justify-between border-b border-[var(--ink)] px-4 py-[9px]">
          <span className="eyebrow">{fr.telegraph.header}</span>
          <span className="font-(family-name:--font-display) text-[12px] text-[var(--ink-quiet)] italic">
            {fr.telegraph.channel}
          </span>
          <button
            type="button"
            onClick={close}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-2">
          <TelegraphThread
            telegraph={telegraph}
            seat={seat}
            height={sized ? 'fill' : 420}
            autoFocus
          />
        </div>
      </div>
    </FloatingWindow>
  );
}
