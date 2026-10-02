import { useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import { FILM_URL } from './media';

/**
 * **Le film se demande, il ne s'impose pas** : un lien, puis une `<dialog>` native — Échap la
 * ferme sans une ligne de plus. Le son part parce que le clic l'autorise. La vidéo n'est montée
 * qu'à l'ouverture : rien ne se télécharge pour qui ne clique pas, et le lien reste sur un
 * téléphone, où le fond, lui, renonce au film.
 */
export function FilmTrailer({ className = '' }: { className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  const show = () => {
    setFailed(false);
    setOpen(true);
    dialog.current?.showModal();
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={`cursor-pointer text-[11.5px] text-[var(--ink-note)] underline underline-offset-4 hover:text-[var(--ink)] ${className}`}
      >
        {fr.film.open}
      </button>
      <dialog
        ref={dialog}
        aria-label={fr.film.title}
        onClose={() => setOpen(false)}
        className="m-auto w-[min(92vw,1100px)] border border-[var(--ink)] bg-[var(--desk)] p-0 text-[var(--paper)] backdrop:bg-[rgba(8,6,3,.82)]"
      >
        <div className="flex justify-end px-3 py-2">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="cursor-pointer text-[11px] tracking-[.22em] uppercase hover:text-[var(--interaction)]"
          >
            {fr.common.close}
          </button>
        </div>
        {open &&
          (failed ? (
            <p role="alert" className="px-6 pt-4 pb-10 text-center text-[13.5px]">
              {fr.film.unavailable}
            </p>
          ) : (
            <video
              className="block aspect-video w-full bg-black"
              src={FILM_URL}
              controls
              autoPlay
              playsInline
              onError={() => setFailed(true)}
            />
          ))}
      </dialog>
    </>
  );
}
