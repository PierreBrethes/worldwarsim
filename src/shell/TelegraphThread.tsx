import { useMutation } from 'convex/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { fr, nationLabel } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import type { TelegraphMessage } from '@/data/telegraph';
import { asPressDate } from '@/domain/duration';
import { typeInk } from '@/domain/nations';
import { MESSAGE_MAX_CHARS, threadLayout } from '@/domain/telegraph';
import type { Seat } from '@/data/session';
import { useNarrowScreen } from './viewport';

/** À partir d'où le décompte paraît : plus tôt, il compterait par-dessus l'épaule du joueur. */
const COUNTDOWN_FROM = 60;

/** **Ce qu'« être en bas » tolère.** Le plateau porte une échelle CSS, et les trois mesures de
 *  défilement y tombent en fractions de pixel : à l'égalité stricte, le fil se décrochait tout
 *  seul de son propre dernier message. */
const NEAR_BOTTOM_PX = 24;

/**
 * **Le canal général, partout où il paraît.** Deux écrans le servent et un seul le compose : la
 * fenêtre du plateau, qu'on ouvre et qu'on pousse, et le salon, où il est posé à demeure — c'est
 * là que l'écriture acceptée dès le lobby prend son sens (« on se chambre en attendant le
 * lancement »). Le cadre change, le fil non : deux copies auraient divergé sur la première
 * correction.
 *
 * `height` est la seule chose que le cadre lui dise : un nombre tant que la surface se dimensionne
 * sur son contenu, `fill` dès qu'elle porte une hauteur à elle — un plafond en pixels dans une
 * fenêtre redimensionnée est une boîte qui refuse de grandir avec celle qui l'entoure.
 *
 * **Et ce nombre est une hauteur, pas un plafond.** Posé en `max-height`, il laissait le cadre
 * grandir message après message jusqu'à le toucher : la fenêtre du plateau bougeait sous la main
 * du joueur à chaque dépêche reçue, ce qui est le retour de Pierre du 15/09. Une boîte de taille
 * stable qui défile est le comportement d'un fil ; une boîte qui grandit est un document.
 */
export function TelegraphThread({
  messages,
  to,
  seat,
  height,
  autoFocus = false,
}: {
  messages: ReadonlyArray<TelegraphMessage>;
  to?: Id<'players'>;
  seat: Seat;
  height: number | 'fill';
  autoFocus?: boolean;
}) {
  const narrow = useNarrowScreen();
  const post = useMutation(api.messages.post);
  const [draft, setDraft] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);

  /**
   * **Le fil se recolle au dernier message, sauf si on est remonté le lire.** Sans cette
   * réserve, une dépêche arrivée pendant qu'on relit trois écrans plus haut arrachait la lecture
   * pour la ramener en bas — le fil décidait où le joueur regarde.
   */
  const thread = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const last = messages.at(-1)?.id ?? null;
  useLayoutEffect(() => {
    const box = thread.current;
    if (box && pinned.current) box.scrollTop = box.scrollHeight;
  }, [last]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) return;
    // Écrire est un geste qui ramène en bas : on ne poste pas pour rester ailleurs.
    pinned.current = true;
    // Le champ se vide tout de suite : le fil est optimiste, et un refus le rend intact.
    setDraft('');
    setRefusal(null);
    void post({
      ...seat,
      text,
      ...(to === undefined ? {} : { to }),
    }).catch((error: unknown) => {
      setDraft(text);
      handleError(error, setRefusal);
    });
  }, [draft, post, seat, to]);

  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  const left = MESSAGE_MAX_CHARS - draft.length;

  return (
    <>
      {/* **Un fil composé, pas une messagerie** : des lignes justifiées à la même marge, un
          filet léger entre elles, et l'encre nationale pour toute distinction d'émetteur. Des
          bulles alignées à droite raconteraient une conversation de téléphone. */}
      <div
        ref={thread}
        onScroll={(event) => {
          const box = event.currentTarget;
          pinned.current = box.scrollHeight - box.scrollTop - box.clientHeight <= NEAR_BOTTOM_PX;
        }}
        className={`min-h-0 overflow-y-auto overscroll-contain ${height === 'fill' ? 'flex-1' : ''} ${
          narrow ? 'px-3 py-[10px]' : ''
        } flex flex-col`}
        style={height === 'fill' ? undefined : { height }}
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-[var(--ink-soft)] italic">
            {fr.telegraph.empty}
          </p>
        ) : (
          <Bands messages={messages} />
        )}
      </div>

      <div
        className={`shrink-0 ${narrow ? 'border-t-2 border-[var(--ink)] px-3 pt-[10px] pb-3' : 'mt-[8px]'}`}
      >
        <div className="flex items-center gap-2">
          <input
            ref={field}
            value={draft}
            maxLength={MESSAGE_MAX_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              send();
            }}
            placeholder={fr.telegraph.placeholder}
            className={`telegraph-field min-w-0 flex-1 border text-[var(--ink)] outline-none placeholder:text-[var(--ink-note)] ${
              narrow
                ? 'min-h-[46px] border-[var(--ink)] bg-(--paper)/50 px-3 focus:outline-2 focus:outline-[var(--interaction)]'
                : 'border-[var(--ink-quiet)] bg-transparent px-[9px] py-[6px] text-[13.5px] focus:border-[var(--ink)] focus:outline-2 focus:outline-[var(--interaction)]'
            }`}
          />
          <button
            type="button"
            onClick={send}
            disabled={draft.trim().length === 0}
            className={`shrink-0 cursor-pointer bg-[var(--ink)] text-[var(--paper)] uppercase hover:bg-[var(--interaction)] disabled:cursor-not-allowed disabled:opacity-40 ${
              narrow
                ? 'min-h-[46px] px-4 text-[11px] font-bold tracking-[.18em]'
                : 'px-3 py-[7px] text-[9px] tracking-[.2em]'
            }`}
          >
            {fr.telegraph.send}
          </button>
        </div>
        {(refusal !== null || left <= COUNTDOWN_FROM) && (
          <div className="mt-[6px] flex items-baseline justify-between gap-3">
            <span className="text-[11.5px] text-[var(--critical)]">{refusal}</span>
            {left <= COUNTDOWN_FROM && (
              <span className="ml-auto shrink-0 font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
                {fr.telegraph.remaining(left)}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * **The thread, on desktop and phone alike** (mobile redesign 1i, extended to desktop on
 * 14/10): consecutive messages from one player sit under one name in tight bands; one's own on
 * the right in ink, the others on the left with the name tinted by their nation. A date crosses
 * the thread at each new day.
 *
 * **Text is text.** React escapes what it renders and nothing here adds interpretation: no
 * markdown, no clickable link, no `dangerouslySetInnerHTML`. That is the only defence this
 * channel needs, and it holds as long as nobody writes the line that would bypass it.
 */
function Bands({ messages }: { messages: ReadonlyArray<TelegraphMessage> }) {
  return threadLayout(messages).map(({ entry: message, opensDay, opensRun }, index) => (
    <div key={message.id} className="contents">
      {/* Chaque séparateur est le premier de son enveloppe : `first:` les aurait tous collés. */}
      {opensDay && (
        <div
          className={`flex items-center gap-[10px] text-[9.5px] tracking-[.18em] text-[var(--ink-note)] uppercase ${
            index === 0 ? 'mb-2' : 'my-2'
          }`}
        >
          <span className="h-px flex-1 bg-(--ink)/30" />
          {dayOf(message.at)}
          <span className="h-px flex-1 bg-(--ink)/30" />
        </div>
      )}
      <div
        className={`flex max-w-[86%] flex-col ${message.mine ? 'items-end self-end' : 'items-start self-start'} ${
          opensRun ? 'mt-2' : 'mt-[2px]'
        }`}
      >
        {opensRun && (
          <div className="mx-[2px] mb-[2px] flex items-baseline gap-2">
            <span
              title={message.mine ? undefined : nationLabel(message.nation)}
              className="text-[9.5px] font-bold tracking-[.18em] uppercase"
              style={{ color: message.mine ? 'var(--ink-soft)' : typeInk(message.ink) }}
            >
              {message.mine ? fr.telegraph.you : message.nickname}
            </span>
            <span className="font-(family-name:--font-mono) text-[9.5px] text-[var(--ink-note)]">
              {timeOf(message.at)}
            </span>
          </div>
        )}
        <p
          className={`border px-2 pt-1 pb-[5px] text-[14.5px] leading-[1.3] wrap-anywhere ${
            message.mine
              ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
              : 'border-(color:--ink)/35 bg-(--paper)/45 text-[var(--ink)]'
          }`}
        >
          {message.text}
        </p>
        {message.readAtIstanbul === true && (
          <span className="mx-[2px] mt-[2px] font-(family-name:--font-mono) text-[9px] tracking-[.18em] text-[var(--critical)] uppercase">
            {fr.points.istanbul.stamp}
          </span>
        )}
      </div>
    </div>
  ));
}

const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « aujourd'hui », « hier », puis la date de presse : le fil se lit comme un carnet. */
function dayOf(at: number): string {
  const day = new Date(at).toDateString();
  const today = new Date();
  if (day === today.toDateString()) return fr.telegraph.today;
  today.setDate(today.getDate() - 1);
  return day === today.toDateString() ? fr.telegraph.yesterday : asPressDate(at);
}
