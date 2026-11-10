import { useAction } from 'convex/react';
import { useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { keepSession } from '@/data/session';
import { nicknameRefusal, passwordRefusal } from '@/domain/account';
import { spriteUrl } from '@/emblems/units/manifest';

const ERROR_ID = 'auth-error';
const NICK_HINT = 'auth-nickname-hint';
const PASS_HINT = 'auth-password-hint';

/**
 * **La carte d'accréditation** : deux champs, et rien d'autre (ADR 0022) — pas d'e-mail, donc
 * pas de « mot de passe oublié ». Deux onglets pour les deux gestes, qui demandent la même chose ;
 * à l'ouverture d'un dossier, les règles du pseudo et du mot de passe s'écrivent sous chaque champ
 * pendant la frappe, par les fonctions mêmes du serveur (`src/domain/account.ts`). Le bouton
 * n'est jamais grisé : un champ qui manque est dit sous lui, en rouge, et prend la main. Le refus
 * du serveur se lit sous le formulaire.
 *
 * Partagée par `/connexion` et l'invitation : la session est gardée dès que le serveur la donne,
 * puis chacun enchaîne sa suite avec `onSignedIn`.
 */
export function AccountForm({
  onSignedIn,
  invited = false,
  opening = false,
  portrait = 'france',
}: {
  readonly onSignedIn: (token: string) => Promise<void> | void;
  readonly invited?: boolean;
  /** Start on the tab that opens a file, for whoever came to found a game and has none. */
  readonly opening?: boolean;
  readonly portrait?: string | null;
}) {
  const register = useAction(api.auth.register);
  const login = useAction(api.auth.login);
  const [registering, setRegistering] = useState(opening);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accredited, setAccredited] = useState(false);
  /** Ce que la carte refuse ne se dit qu'une fois demandé : pas de rouge sous un champ vide que
   *  personne n'a encore touché. */
  const [asked, setAsked] = useState(false);

  const nickOk = registering ? nicknameRefusal(nickname) === null : nickname.trim().length > 0;
  const passOk = registering ? passwordRefusal(password) === null : password.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!nickOk || !passOk) {
      setAsked(true);
      document.getElementById(nickOk ? 'auth-password' : 'auth-nickname')?.focus();
      return;
    }
    setError(null);
    setPending(true);
    try {
      const { token } = await (registering ? register : login)({ nickname, password });
      keepSession(token);
      setAccredited(true);
      await onSignedIn(token);
    } catch (problem) {
      handleError(problem, setError);
    } finally {
      setPending(false);
    }
  };

  const switchTo = (next: boolean) => {
    setRegistering(next);
    setError(null);
    setAsked(false);
  };
  const describedBy = (hint: string) => (error ? `${hint} ${ERROR_ID}` : hint);
  const sprite = spriteUrl(portrait, 'infantry', 1);

  return (
    <>
      <div className="tabs" role="tablist" aria-label={fr.auth.tabs}>
        <button
          type="button"
          role="tab"
          aria-selected={!registering}
          onClick={() => switchTo(false)}
        >
          {fr.auth.haveFile}
        </button>
        <button type="button" role="tab" aria-selected={registering} onClick={() => switchTo(true)}>
          {fr.auth.openFile}
        </button>
      </div>
      <form className="pass" id="authform" onSubmit={submit} noValidate>
        <div className="head">
          <b>{registering ? fr.auth.requestTitle : fr.auth.cardTitle}</b>
          <span className="eyebrow">
            {registering ? fr.auth.newCorrespondent : fr.auth.cardNumber(nickname.trim().length)}
          </span>
        </div>
        <figure className="portrait" style={{ margin: 0 }}>
          {sprite !== null && <img src={sprite} alt="" />}
          <figcaption>{fr.auth.portraitCaption}</figcaption>
        </figure>
        <div className="fields">
          <div className="field">
            <label htmlFor="auth-nickname">{fr.auth.nicknameLabel}</label>
            <input
              id="auth-nickname"
              name="username"
              autoComplete="username"
              value={nickname}
              maxLength={40}
              placeholder={fr.auth.nicknamePlaceholder}
              aria-invalid={error || (asked && !nickOk) ? true : undefined}
              aria-describedby={describedBy(NICK_HINT)}
              onChange={(event) => setNickname(event.target.value)}
            />
            <span
              id={NICK_HINT}
              className={`hint ${nickOk ? (registering && nickname ? 'ok' : '') : nickname || asked ? 'bad' : ''}`}
            >
              {registering
                ? nickname || asked
                  ? nickOk
                    ? fr.auth.nicknameFree
                    : fr.auth.nicknameRule
                  : fr.auth.nicknameNote
                : asked && !nickOk
                  ? fr.auth.nicknameMissing
                  : ' '}
            </span>
          </div>
          <div className="field">
            <label htmlFor="auth-password">{fr.auth.passwordLabel}</label>
            <input
              id="auth-password"
              name="password"
              type="password"
              autoComplete={registering ? 'new-password' : 'current-password'}
              value={password}
              placeholder={fr.auth.passwordPlaceholder}
              aria-invalid={error || (asked && !passOk) ? true : undefined}
              aria-describedby={describedBy(PASS_HINT)}
              onChange={(event) => setPassword(event.target.value)}
            />
            <span id={PASS_HINT} className={`hint ${!passOk && (password || asked) ? 'bad' : ''}`}>
              {registering
                ? !passOk && (password || asked)
                  ? fr.auth.passwordRule
                  : fr.auth.passwordNote
                : asked && !passOk
                  ? fr.auth.passwordMissing
                  : ' '}
            </span>
          </div>
        </div>
        {accredited && (
          <div className="stamp pop" aria-hidden>
            {registering ? fr.auth.fileOpened : fr.auth.accredited}
          </div>
        )}
      </form>
      {error && (
        <p id={ERROR_ID} role="alert" className="wire-note">
          {error}
        </p>
      )}
      <button type="submit" form="authform" className="btn primary wide" aria-busy={pending}>
        {pending
          ? fr.auth.pending
          : invited
            ? registering
              ? fr.auth.registerAndJoin
              : fr.auth.loginAndJoin
            : registering
              ? fr.auth.registerSubmit
              : fr.auth.loginSubmit}
      </button>
    </>
  );
}
