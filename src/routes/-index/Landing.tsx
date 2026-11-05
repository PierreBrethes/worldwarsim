import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useMapMotion } from '@/data/mapMotion';
import { fr } from '@/i18n/fr';
import { Wordmark } from '@/shell/Masthead';
import { Bureau, focusCode } from './Bureau';
import { FilmPhoto } from './FilmPhoto';
import type { FilmCut } from './film';
import { Gestures } from './Gestures';
import './landing.css';

const PHONE_QUERY = '(max-width: 760px)';

/** Le téléphone a sa découpe du film, en 9:16 : les mêmes plans, cadrés pour la main. */
function useFilmCut(): FilmCut {
  const [tall, setTall] = useState(() => matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const query = matchMedia(PHONE_QUERY);
    const follow = () => setTall(query.matches);
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);
  return tall ? 'tall' : 'wide';
}

/**
 * **La une publique : la une d'un journal posée sur la table** (maquette « A · La une »,
 * `WWS/prototypes/accueil-v1/une.html`, choisie le 05/11/2026). Sa photographie est le film : une
 * boucle muette, ou l'image d'affiche quand le mouvement est réduit ou que le fichier manque.
 * À côté, le titre, les deux éditions et le bureau des engagements ; sous le pli, les quatre
 * gestes d'aujourd'hui.
 *
 * Aucune donnée de partie, aucune requête au serveur.
 */
export function Landing() {
  const still = useMapMotion() !== 'full';
  const cut = useFilmCut();

  useEffect(() => {
    document.body.classList.add('lp-scroll');
    return () => document.body.classList.remove('lp-scroll');
  }, []);

  return (
    <div className="lp" data-still={still ? '' : undefined}>
      <main className="lp-sheet">
        <header className="lp-masthead" aria-label={fr.front.headline}>
          <div className="lp-masthead-rules" aria-hidden />
          <h1 className="lp-wordmark">
            <Wordmark size="clamp(40px, 9.4vw, 124px)" />
          </h1>
          <div className="lp-dateline">
            <span>
              {fr.front.dateline}
              <span className="lp-long">{fr.front.datelineLong}</span>
            </span>
            <span className="lp-long">{fr.front.date(new Date())}</span>
            <span>{fr.front.onInvitation}</span>
          </div>
        </header>

        <div className="lp-body">
          <figure className="lp-photo-col">
            <div className="lp-photo">
              <FilmPhoto cut={cut} still={still} />
            </div>
            <figcaption className="lp-caption">{fr.front.caption}</figcaption>
          </figure>

          <div className="lp-lead">
            <span className="lp-kicker lp-refus">{fr.front.kicker}</span>
            <h2>{fr.front.headline}</h2>
            <p className="lp-chapo">{fr.front.lede}</p>
            <div className="lp-editions">
              {fr.front.editions.map((edition) => (
                <article key={edition.name}>
                  <span className="lp-kicker">{edition.kicker}</span>
                  <b>{edition.name}</b>
                  <span className="lp-meta">{edition.meta}</span>
                  <span className="lp-text">{edition.text}</span>
                </article>
              ))}
            </div>
            <Bureau />
          </div>
        </div>

        <Gestures cut={cut} />
      </main>

      <footer className="lp-footer">
        {fr.front.footer} · {fr.front.staged} · <Link to="/credits">{fr.front.credits}</Link>
      </footer>

      <nav className="lp-sticky" aria-label={fr.front.enter}>
        <button type="button" className="lp-btn lp-btn--solid" onClick={() => focusCode(still)}>
          {fr.front.haveCode}
        </button>
        <Link className="lp-btn" to="/connexion">
          {fr.front.enter}
        </Link>
      </nav>
    </div>
  );
}
