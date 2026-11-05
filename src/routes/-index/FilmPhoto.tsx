import { useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import { FILM_CUTS, FILM_LOOP, loopedTime, subtitleAt, type FilmCut } from './film';

/**
 * **La photographie de la une, et le film qui la prolonge.** L'image d'affiche est toujours
 * dessous : tant que le fichier manque, ou que le mouvement est réduit, c'est elle qu'on voit.
 * Par-dessus, une boucle muette (un segment du film, `FILM_LOOP`) ; le cartouche ouvre le film
 * entier dans une `<dialog>` native. Le film est muet et sous-titré : le son viendra avec le
 * front qui s'entend (#405).
 */
export function FilmPhoto({ cut, still }: { cut: FilmCut; still: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [looping, setLooping] = useState(true);
  const files = FILM_CUTS[cut];

  return (
    <>
      <img className="lp-poster" src={files.poster} alt={fr.front.posterAlt} />
      {!still && looping && (
        <video
          key={cut}
          className="lp-loop"
          src={files.video}
          muted
          autoPlay
          playsInline
          aria-hidden
          onLoadedMetadata={(event) => (event.currentTarget.currentTime = FILM_LOOP.from)}
          onTimeUpdate={(event) => {
            const video = event.currentTarget;
            const next = loopedTime(video.currentTime);
            if (next !== video.currentTime) video.currentTime = next;
          }}
          onError={() => setLooping(false)}
        />
      )}
      <button
        type="button"
        className="lp-plate"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
        }}
      >
        {fr.front.film}
      </button>
      <dialog
        ref={dialog}
        className="lp-projection"
        aria-label={fr.film.title}
        onClose={() => setOpen(false)}
      >
        <div className="lp-projection-bar">
          <button type="button" onClick={() => dialog.current?.close()}>
            {fr.common.close}
          </button>
        </div>
        {open && <Projection cut={cut} />}
      </dialog>
    </>
  );
}

/** Le film entier, monté à l'ouverture : rien ne se télécharge pour qui ne clique pas. */
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
