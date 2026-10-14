import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { fr } from '@/i18n/fr';
import { FilmTrailer } from '@/shell/FilmTrailer';

export const BUREAU_ID = 'bureau';
const CODE_ID = 'front-code';
const HINT_ID = 'front-code-hint';
const CODE_LENGTH = 6;
const CELL_EM = 2.5;

/** « J'ai un code » : on descend au bureau et la main est déjà dans le champ. */
export function focusCode(still: boolean): void {
  document.getElementById(BUREAU_ID)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
  setTimeout(
    () => document.getElementById(CODE_ID)?.focus({ preventScroll: true }),
    still ? 0 : 700,
  );
}

/**
 * **Le bureau des engagements** : les deux portes de la page, au bout de l'édition — le code
 * d'invitation, qui ouvre `/rejoindre/CODE`, et la connexion. Pas de troisième : on n'entre pas
 * seul (marque-1c).
 */
export function Bureau() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const complete = code.length === CODE_LENGTH;

  /** Le code n'est pas jugé ici : c'est la page d'invitation qui refuse un mauvais code, avec la
   *  phrase du serveur. On n'écarte que ce qu'un collage apporte en trop. */
  const accept = (raw: string) =>
    setCode(raw.replace(/\s/g, '').toUpperCase().slice(0, CODE_LENGTH));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (complete) void navigate({ to: '/rejoindre/$code', params: { code } });
  };

  return (
    <section id={BUREAU_ID} className="lp-bureau" aria-labelledby="lp-bureau-title">
      <article className="lp-clip">
        <div className="lp-folio">
          <span>{fr.front.bureau.folio}</span>
          <span>{fr.front.onInvitation}</span>
        </div>
        <h2 id="lp-bureau-title">{fr.front.bureau.title}</h2>
        <p className="lp-chapo">{fr.front.bureau.chapo}</p>
        <form onSubmit={submit} autoComplete="off">
          <label htmlFor={CODE_ID}>{fr.front.bureau.codeTitle}</label>
          {/* Un seul champ, dessiné comme six cases : six champs casseraient le collage, la
              saisie automatique et la correction, que tout le monde attend d'un champ. */}
          <div className="lp-codecells">
            {Array.from({ length: CODE_LENGTH }, (_, index) => (
              <span
                key={index}
                aria-hidden
                className={index < code.length ? 'lp-full' : undefined}
                style={{ left: `${index * CELL_EM}em` }}
              />
            ))}
            <input
              id={CODE_ID}
              aria-describedby={HINT_ID}
              value={code}
              onChange={(event) => accept(event.target.value)}
              maxLength={CODE_LENGTH}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </div>
          <p id={HINT_ID} className="lp-hint">
            {fr.front.bureau.codeHint}
          </p>
          <button
            className="lp-btn lp-btn--solid"
            type="submit"
            disabled={!complete}
            style={{ width: '100%' }}
          >
            {fr.front.bureau.open}
          </button>
        </form>
        <div className="lp-row2" style={{ borderTop: 'var(--rule-medium)', paddingTop: 12 }}>
          <Link className="lp-btn" to="/connexion">
            {fr.front.signIn}
          </Link>
          <FilmTrailer plate />
        </div>
      </article>
    </section>
  );
}
