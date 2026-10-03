import { useAction } from 'convex/react';
import { useState, type FormEvent } from 'react';
import { api } from '../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { handleError } from '@/data/errors';
import { keepSession } from '@/data/session';
import { nicknameRefusal, passwordRefusal } from '@/domain/account';

const ERROR_ID = 'auth-error';
const NOTE_ID = 'auth-password-note';

/**
 * **Deux champs, et rien d'autre** (ADR 0022) : pas d'e-mail, donc pas de vérification, pas de
 * lien de réinitialisation, pas de case à cocher. Un mot de passe perdu se remet à zéro par
 * l'administrateur du serveur — entre amis, c'est un message.
 *
 * Une seule forme pour les deux gestes : s'inscrire et se connecter demandent exactement la
 * même chose, et deux pages auraient fait choisir avant de savoir. Le refus se lit sous le
 * formulaire et jamais en notification — c'est là que la main est.
 *
 * Il est partagé par `/connexion` et par la feuille d'invitation : l'un et l'autre garde la
 * session dès que le serveur la donne, puis chacun enchaîne sa suite avec `onSignedIn` — qui
 * gère lui-même ses refus, parce que le compte, lui, est déjà né.
 */
export function AccountForm({
  onSignedIn,
  onModeChange,
}: {
  readonly onSignedIn: (token: string) => Promise<void> | void;
  readonly onModeChange?: (registering: boolean) => void;
}) {
  const register = useAction(api.auth.register);
  const login = useAction(api.auth.login);
  const [registering, setRegistering] = useState(false);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { token } = await (registering ? register : login)({ nickname, password });
      keepSession(token);
      await onSignedIn(token);
    } catch (problem) {
      handleError(problem, setError);
    } finally {
      setPending(false);
    }
  };

  /** **Ce que le serveur refusera, dit avant l'aller-retour** — et par la même fonction que lui
   *  (`src/domain/account.ts`), donc rien ne peut diverger. À la connexion on ne juge rien : un
   *  ancien mot de passe trop court reste le sien, et c'est au serveur de le dire. */
  const refused = registering
    ? (nicknameRefusal(nickname) ?? passwordRefusal(password)) !== null
    : nickname.trim().length === 0 || password.length === 0;

  return (
    <>
      <form onSubmit={submit} className="mx-[30px] mt-[22px]">
        <label htmlFor="auth-nickname" className="eyebrow block">
          {fr.auth.nicknameLabel}
        </label>
        <input
          id="auth-nickname"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR_ID : undefined}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          autoComplete="username"
          className="mt-[6px] w-full border border-[var(--ink)] bg-transparent px-[14px] py-3 text-[17px] text-[var(--ink)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interaction)]"
          placeholder={fr.auth.nicknamePlaceholder}
        />

        <label htmlFor="auth-password" className="eyebrow mt-[16px] block">
          {fr.auth.passwordLabel}
        </label>
        <input
          id="auth-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${ERROR_ID} ${NOTE_ID}` : NOTE_ID}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={registering ? 'new-password' : 'current-password'}
          className="mt-[6px] w-full border border-[var(--ink)] bg-transparent px-[14px] py-3 text-[17px] text-[var(--ink)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--interaction)]"
          placeholder={fr.auth.passwordPlaceholder}
        />
        <p id={NOTE_ID} className="mt-2 text-[10.5px] text-[var(--ink-note)]">
          {fr.auth.passwordNote}
        </p>

        {error && (
          <p
            id={ERROR_ID}
            role="alert"
            className="mt-4 border border-[var(--critical)] px-3 py-2 text-[12.5px]"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={refused || pending}
          className={`mt-[18px] w-full border p-[13px] text-[11px] tracking-[.22em] uppercase ${
            !refused && !pending
              ? 'cursor-pointer border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--interaction)]'
              : 'cursor-not-allowed border-(color:--ink)/30 bg-(--ink)/12 text-[var(--ink-note)]'
          }`}
        >
          {pending ? fr.auth.pending : registering ? fr.auth.registerSubmit : fr.auth.loginSubmit}
        </button>
      </form>

      <div className="mx-[30px] mt-[18px] mb-[22px] border-t border-(color:--ink)/35 pt-[12px] text-center">
        <button
          type="button"
          onClick={() => {
            onModeChange?.(!registering);
            setRegistering(!registering);
            setError(null);
          }}
          className="cursor-pointer text-[11.5px] text-[var(--ink-note)] underline underline-offset-4 hover:text-[var(--ink)]"
        >
          {registering ? fr.auth.toLogin : fr.auth.toRegister}
        </button>
      </div>
    </>
  );
}
