import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import { Masthead } from '@/shell/Masthead';
import { ThickRuleInverse, usePageTurn, type Turning } from '@/shell/Newspaper';
import { convexClient } from '@/data/convexClient';
import { AccountForm } from '@/shell/AccountForm';
import { EntrySheet, SheetExit } from '@/shell/EntrySheet';
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
      <p className="mx-(--sheet-pad) py-6 text-[13.5px] leading-[1.55]">{fr.auth.noBackend}</p>
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
    <EntrySheet width={WIDTH} turning={turning}>
      <div className="px-(--sheet-pad) pt-[18px] pb-[16px] text-center">
        <Masthead date={fr.auth.dateline} wordmarkMax={54} />
        <p className="mt-[13px] text-[11.5px] tracking-[.2em] text-[var(--ink-note)] uppercase">
          {tagline}
        </p>
      </div>

      <ThickRuleInverse margin="var(--sheet-pad)" />

      {children}
      <SheetExit />
    </EntrySheet>
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
        /** L'accueil prend la place du formulaire : le retour du navigateur ne ramène pas un
         *  joueur connecté devant ses deux champs. */
        onSignedIn={() => turn(() => void navigate({ to: '/accueil', replace: true }))}
      />
      <div className="mx-(--sheet-pad) text-center">
        <FilmTrailer />
      </div>
    </Sheet>
  );
}
