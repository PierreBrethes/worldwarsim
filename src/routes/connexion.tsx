import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useAction } from 'convex/react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { Masthead } from '@/shell/Masthead';
import { Newspaper, ThickRuleInverse, usePageTurn, type Turning } from '@/shell/Newspaper';
import { convexClient } from '@/data/convexClient';
import { handleError } from '@/data/errors';
import { keepSession } from '@/data/session';
import { nicknameRefusal, passwordRefusal } from '@/domain/account';

export const Route = createFileRoute('/connexion')({ component: SignIn });

const WIDTH = 520;

function SignIn() {
  return convexClient ? <ConnectedSignIn /> : <NoBackend />;
}

/** Sans backend, il n'y a pas de compte à créer : la feuille dit ce qui manque et s'arrête là
 *  — un formulaire qui ne peut rien envoyer n'est pas une porte, c'est une impasse. */
function NoBackend() {
  const { turning } = usePageTurn();
  return (
    <Sheet turning={turning} tagline={fr.auth.loginTagline}>
      <p className="mx-[30px] py-6 text-[13.5px] leading-[1.55]">{fr.auth.noBackend}</p>
    </Sheet>
  );
}

function Sheet({
  turning,
  tagline,
  children,
}: {
  turning: Turning;
  tagline: string;
  children: ReactNode;
}) {
  return (
    <Newspaper width={WIDTH} turning={turning}>
      <div className="paper-grain @container relative border border-[var(--ink)] text-[var(--ink)] shadow-[0_20px_46px_rgba(0,0,0,.6),0_2px_0_rgba(0,0,0,.5)]">
        <div className="px-[30px] pt-[18px] pb-[16px] text-center">
          <Masthead date={fr.auth.dateline} />
          <p className="mt-[13px] text-[11.5px] tracking-[.2em] text-[var(--ink-note)] uppercase">
            {tagline}
          </p>
        </div>

        <ThickRuleInverse />

        {children}
      </div>
    </Newspaper>
  );
}

/**
 * **Deux champs, et rien d'autre** (ADR 0022) : pas d'e-mail, donc pas de vérification, pas de
 * lien de réinitialisation, pas de case à cocher. Un mot de passe perdu se remet à zéro par
 * l'administrateur du serveur — entre amis, c'est un message.
 *
 * Une seule feuille pour les deux gestes : s'inscrire et se connecter demandent exactement la
 * même chose, et deux pages auraient fait choisir avant de savoir. Le refus se lit sous le
 * formulaire et jamais en notification — c'est là que la main est.
 */
function ConnectedSignIn() {
  const navigate = useNavigate();
  const { turning, turn } = usePageTurn();
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
      turn(() => void navigate({ to: '/accueil' }));
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
    <Sheet turning={turning} tagline={registering ? fr.auth.registerTagline : fr.auth.loginTagline}>
      <form onSubmit={submit} className="mx-[30px] mt-[22px]">
        <div className="eyebrow">{fr.auth.nicknameLabel}</div>
        <input
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          autoComplete="username"
          className="mt-[6px] w-full border border-[var(--ink)] bg-transparent px-[14px] py-3 text-[17px] text-[var(--ink)] outline-none"
          placeholder={fr.auth.nicknamePlaceholder}
        />

        <div className="eyebrow mt-[16px]">{fr.auth.passwordLabel}</div>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={registering ? 'new-password' : 'current-password'}
          className="mt-[6px] w-full border border-[var(--ink)] bg-transparent px-[14px] py-3 text-[17px] text-[var(--ink)] outline-none"
          placeholder={fr.auth.passwordPlaceholder}
        />
        <p className="mt-2 text-[10.5px] text-[var(--ink-faint)]">{fr.auth.passwordNote}</p>

        {error && (
          <p className="mt-4 border border-[var(--critical)] px-3 py-2 text-[12.5px]">{error}</p>
        )}

        <button
          type="submit"
          disabled={refused || pending}
          className={`mt-[18px] w-full border p-[13px] text-[11px] tracking-[.22em] uppercase ${
            !refused && !pending
              ? 'cursor-pointer border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--interaction)]'
              : 'cursor-not-allowed border-[rgba(42,33,24,.3)] bg-[rgba(42,33,24,.12)] text-[var(--ink-faint)]'
          }`}
        >
          {pending ? fr.auth.pending : registering ? fr.auth.registerSubmit : fr.auth.loginSubmit}
        </button>
      </form>

      <div className="mx-[30px] mt-[18px] mb-[22px] border-t border-[rgba(42,33,24,.35)] pt-[12px] text-center">
        <button
          type="button"
          onClick={() => {
            setRegistering(!registering);
            setError(null);
          }}
          className="cursor-pointer text-[11.5px] text-[var(--ink-note)] underline underline-offset-4 hover:text-[var(--ink)]"
        >
          {registering ? fr.auth.toLogin : fr.auth.toRegister}
        </button>
      </div>
    </Sheet>
  );
}
