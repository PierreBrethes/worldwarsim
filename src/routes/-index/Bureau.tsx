import { Link, useNavigate } from '@tanstack/react-router';
import { useRef, useState, type FormEvent } from 'react';
import { fr } from '@/i18n/fr';
import { Stamp } from '@/shell/Stamp';

const BUREAU_ID = 'bureau';
const CODE_ID = 'front-code';
const HINT_ID = 'front-code-hint';
const CODE_LENGTH = 6;
const CELL_EM = 2.5;

/** « J'ai un code » : on descend au bureau et la main est déjà dans le champ. */
export function focusCode(still: boolean): void {
  document.getElementById(BUREAU_ID)?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
  document.getElementById(CODE_ID)?.focus({ preventScroll: true });
}

/**
 * **Le bureau des engagements** : le code d'invitation, qui ouvre `/rejoindre/CODE`, et sous lui
 * les deux autres entrées — fonder une partie, qui passe par l'ouverture d'un dossier, et entrer
 * avec le sien. Pas de porte qui fonde sans compte (ADR 0022).
 *
 * Le bouton n'est jamais grisé : un code incomplet dit, en rouge, ce qui lui manque.
 */
export function Bureau() {
  const navigate = useNavigate();
  const field = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const missing = CODE_LENGTH - code.length;

  /** Le code n'est pas jugé ici : c'est la page d'invitation qui refuse un mauvais code, avec la
   *  phrase du serveur. On n'écarte que ce qu'un collage apporte en trop. */
  const accept = (raw: string) =>
    setCode(raw.replace(/\s/g, '').toUpperCase().slice(0, CODE_LENGTH));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (missing > 0) field.current?.focus();
    else void navigate({ to: '/rejoindre/$code', params: { code } });
  };

  const say = fr.front.bureau.say;
  const incomplete = code.length > 0 && missing > 0;

  return (
    <section id={BUREAU_ID} className="lp-encadre" aria-label={fr.front.bureau.folio}>
      <span className="lp-encadre-stamp">
        <Stamp label={fr.front.onInvitation} tone="critical" />
      </span>
      <form onSubmit={submit} autoComplete="off">
        <label htmlFor={CODE_ID} className="lp-kicker">
          {fr.front.bureau.codeTitle}
        </label>
        <div className="lp-code-row">
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
              ref={field}
              id={CODE_ID}
              aria-describedby={HINT_ID}
              value={code}
              onChange={(event) => accept(event.target.value)}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </div>
          <button className="lp-btn lp-btn--solid" type="submit">
            {fr.front.bureau.open}
          </button>
        </div>
        <p id={HINT_ID} className={incomplete ? 'lp-say lp-refus' : 'lp-say'} aria-live="polite">
          {code.length === 0 ? say.empty : missing > 0 ? say.missing(missing) : say.ready(code)}
        </p>
      </form>
      <div className="lp-doors">
        <span>{fr.front.bureau.noCode}</span>
        <Link to="/connexion" search={{ ouvrir: true }}>
          {fr.front.bureau.found}
        </Link>
        <span aria-hidden>·</span>
        <Link to="/connexion">{fr.front.bureau.haveFile}</Link>
      </div>
    </section>
  );
}
