import { useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import { FILM_CUTS, subtitleAt, type FilmCut } from './film-cuts';

/**
 * **Le film, à la demande** : trente secondes du jeu tel qu'il se joue, muettes et sous-titrées,
 * dans une `<dialog>` native. Rien ne se télécharge pour qui ne le demande pas — ni le film ni
 * son affiche : la une n'en porte que le bouton.
 */
export function Film() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [cut, setCut] = useState<FilmCut | null>(null);

  return (
    <>
      <button
        type="button"
        className="lp-film"
        onClick={() => {
          /** Le téléphone a sa découpe en 9:16 : les mêmes plans, cadrés pour la main. */
          setCut(matchMedia(PHONE_QUERY).matches ? 'tall' : 'wide');
          dialog.current?.showModal();
        }}
      >
        {fr.front.film}
      </button>
      <dialog
        ref={dialog}
        className="lp-projection"
        aria-label={fr.film.title}
        onClose={() => setCut(null)}
      >
        <div className="lp-projection-bar">
          <button type="button" onClick={() => dialog.current?.close()}>
            {fr.common.close}
          </button>
        </div>
        {cut !== null && <Projection cut={cut} />}
      </dialog>
    </>
  );
}

const PHONE_QUERY = '(max-width: 760px)';

function Projection({ cut }: { cut: FilmCut }) {
  const [failed, setFailed] = useState(false);
  const [subtitle, setSubtitle] = useState<ReturnType<typeof subtitleAt>>(null);
  if (failed)
    return (
      <p role="alert" className="lp-projection-lost">
        {fr.film.unavailable}
      </p>
    );
  return (
    <div className="lp-screen" data-cut={cut}>
      <video
        src={FILM_CUTS[cut].video}
        poster={FILM_CUTS[cut].poster}
        muted
        controls
        autoPlay
        playsInline
        onTimeUpdate={(event) => setSubtitle(subtitleAt(event.currentTarget.currentTime))}
        onError={() => setFailed(true)}
      />
      {subtitle !== null && <p className="lp-subtitle">{fr.film.subtitles[subtitle]}</p>}
    </div>
  );
}
