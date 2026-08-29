import { useMutation } from 'convex/react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { fr, nationLabel } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import type { Telegraph, TelegraphMessage } from '@/data/telegraph';
import { MESSAGE_MAX_CHARS } from '@/domain/telegraph';

/** À partir d'où le décompte paraît : plus tôt, il compterait par-dessus l'épaule du joueur. */
const COUNTDOWN_FROM = 60;

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
 */
export function TelegraphThread({
  telegraph,
  token,
  height,
  autoFocus = false,
}: {
  telegraph: Telegraph;
  token: string;
  height: number | 'fill';
  autoFocus?: boolean;
}) {
  const post = useMutation(api.messages.post);
  const [draft, setDraft] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);

  const send = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0) return;
    // Le champ se vide tout de suite : le fil est optimiste, et un refus le rend intact.
    setDraft('');
    setRefusal(null);
    void post({ token, text }).catch((error: unknown) => {
      setDraft(text);
      handleError(error, setRefusal);
    });
  }, [draft, post, token]);

  const thread = useRef<HTMLDivElement>(null);
  const last = telegraph.messages.at(-1)?.id ?? null;
  useLayoutEffect(() => {
    const box = thread.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [last]);

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
        className={height === 'fill' ? 'min-h-0 flex-1 overflow-auto' : 'flex-1 overflow-auto'}
        style={height === 'fill' ? undefined : { maxHeight: height }}
      >
        {telegraph.messages.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-[var(--ink-soft)] italic">
            {fr.telegraph.empty}
          </p>
        ) : (
          telegraph.messages.map((message) => <Line key={message.id} message={message} />)
        )}
      </div>

      <div className="mt-[8px] shrink-0">
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
            className="min-w-0 flex-1 border border-[var(--ink-quiet)] bg-transparent px-[9px] py-[6px] text-[13.5px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--ink)]"
          />
          <button
            type="button"
            onClick={send}
            disabled={draft.trim().length === 0}
            className="shrink-0 cursor-pointer bg-[var(--ink)] px-3 py-[7px] text-[9px] tracking-[.2em] text-[var(--paper)] uppercase hover:bg-[var(--interaction)] disabled:cursor-not-allowed disabled:opacity-40"
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
 * **Le texte est du texte.** React échappe ce qu'il rend et rien ici n'ajoute d'interprétation :
 * pas de markdown, pas de lien cliquable, pas de `dangerouslySetInnerHTML`. C'est la seule
 * défense dont ce canal ait besoin, et elle tient parce qu'on n'écrit pas la ligne qui la
 * contournerait.
 */
function Line({ message }: { message: TelegraphMessage }) {
  return (
    <div className="border-b border-[rgba(42,33,24,.16)] py-[7px] last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span
          title={nationLabel(message.nation)}
          className="text-[10px] font-bold tracking-[.16em] uppercase"
          style={{ color: message.ink }}
        >
          {message.nickname}
        </span>
        <span className="flex-1" />
        <span className="font-(family-name:--font-mono) text-[10px] text-[var(--ink-faint)]">
          {new Date(message.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <p className="mt-[2px] text-[13.5px] leading-[1.45] break-words text-[var(--ink)]">
        {message.text}
      </p>
    </div>
  );
}
