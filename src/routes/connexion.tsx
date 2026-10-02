import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import { Masthead } from '@/shell/Masthead';
import { Newspaper, ThickRuleInverse, usePageTurn, type Turning } from '@/shell/Newspaper';
import { convexClient } from '@/data/convexClient';
import { AccountForm } from '@/shell/AccountForm';
import { FilmTrailer } from '@/shell/FilmTrailer';

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
    <Newspaper width={WIDTH} turning={turning} backdrop="film">
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

/** La feuille de connexion : le formulaire partagé, puis l'accueil. */
export function ConnectedSignIn() {
  const navigate = useNavigate();
  const { turning, turn } = usePageTurn();
  const [registering, setRegistering] = useState(false);

  return (
    <Sheet turning={turning} tagline={registering ? fr.auth.registerTagline : fr.auth.loginTagline}>
      <AccountForm
        onModeChange={setRegistering}
        onSignedIn={() => turn(() => void navigate({ to: '/accueil' }))}
      />
      <div className="mx-[30px] pb-5 text-center">
        <FilmTrailer />
      </div>
    </Sheet>
  );
}
