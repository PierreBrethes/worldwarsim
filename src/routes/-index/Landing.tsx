import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type CSSProperties } from 'react';
import { fr } from '@/i18n/fr';
import { useMapMotion } from '@/data/mapMotion';
import { EngravedDefs } from '@/emblems/EngravedMap';
import { CodeField } from '@/shell/CodeField';
import { Wordmark } from '@/shell/Masthead';
import { Stamp } from '@/shell/Stamp';
import { Film } from './Film';
import { Situation } from './Situation';
import './landing.css';

/** Le seuil où la feuille est assez large pour le monde entier (`landing.css` tient le même). */
const WIDE_QUERY = '(min-width: 1100px)';

function useWideSheet(): boolean {
  const [wide, setWide] = useState(() => matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const query = matchMedia(WIDE_QUERY);
    const follow = () => setWide(query.matches);
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);
  return wide;
}

/**
 * **La une publique : une feuille, une carte, un coupon.** Comme la une d'un quotidien de 1940,
 * elle porte sa manchette, un titre en bandeau et la carte de la situation — qui est le jeu : la
 * carte du monde réel, huit nations, sept points, des ordres qui partent. Posé sur la carte, le
 * coupon-réponse : le code d'invitation, et les deux autres portes (fonder, entrer). Au sixième
 * caractère le coupon se détache et part, puis l'invitation s'ouvre ; animations réduites ou
 * coupées, elle s'ouvre aussitôt.
 *
 * Tout tient dans l'écran. Aucune donnée de partie, aucune requête au serveur ; le film ne se
 * charge que si on le demande.
 */
/**
 * Le temps que le coupon met à se détacher avant que l'invitation ne s'ouvre, animations actives.
 * C'est ce délai qui ouvre, pas la fin de l'animation : un onglet en arrière-plan ou un style
 * absent ne rendent jamais `animationend`. `landing.css` le lit par `--departure`.
 * @a-mesurer
 */
export const COUPON_DEPARTURE_MS = 420;

export function Landing() {
  const navigate = useNavigate();
  const world = useWideSheet();
  const motion = useMapMotion();
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    if (leaving === null) return;
    const departure = setTimeout(
      () => void navigate({ to: '/rejoindre/$code', params: { code: leaving } }),
      COUPON_DEPARTURE_MS,
    );
    return () => clearTimeout(departure);
  }, [leaving, navigate]);

  const open = (code: string) => {
    if (motion === 'full') setLeaving(code);
    else void navigate({ to: '/rejoindre/$code', params: { code } });
  };

  return (
    <div className="lp">
      <EngravedDefs />
      <main className="lp-sheet">
        <header className="lp-masthead">
          <div className="lp-masthead-rules" aria-hidden />
          <h1 className="lp-wordmark">
            <Wordmark size="clamp(44px, min(11.6vw, 13.7dvh), 112px)" />
          </h1>
          <div className="lp-dateline">
            <span className="lp-wide">{fr.masthead.dateline}</span>
            <span className="lp-wide">{fr.front.date(new Date())}</span>
            <span>{fr.front.amongFriends}</span>
          </div>
        </header>

        <h2 className="lp-banner">{fr.front.headline}</h2>

        <div className="lp-plate">
          <figure>
            <div role="img" aria-label={fr.front.mapLabel}>
              <Situation world={world} />
            </div>
            <figcaption>
              <span>{fr.front.caption}</span>
              <Film />
            </figcaption>
          </figure>

          <section
            className="lp-coupon"
            aria-label={fr.front.coupon}
            data-leaving={leaving === null ? undefined : ''}
            style={{ '--departure': `${COUPON_DEPARTURE_MS}ms` } as CSSProperties}
          >
            <span className="lp-coupon-stamp">
              <Stamp label={fr.front.onInvitation} tone="critical" />
            </span>
            <CodeField label={fr.front.codeLabel} onOpen={open} />
            <p className="lp-doors">
              <span>{fr.front.noCode}</span>
              <Link to="/connexion" search={{ ouvrir: true, suite: 'fonder' }}>
                {fr.front.found}
              </Link>
              <span>{fr.front.haveFile}</span>
              <Link to="/connexion">{fr.front.enter}</Link>
            </p>
          </section>
        </div>
      </main>

      <footer className="lp-footer">
        {fr.front.footer} · <Link to="/credits">{fr.front.credits}</Link>
      </footer>
    </div>
  );
}
