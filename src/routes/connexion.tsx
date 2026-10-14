import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import { Wordmark } from '@/shell/Masthead';
import { convexClient } from '@/data/convexClient';
import { AccountForm } from '@/shell/AccountForm';
import { OffSeasonPage, romanDate } from '@/shell/OffSeason';

export const Route = createFileRoute('/connexion')({ component: SignIn });

function SignIn() {
  return convexClient ? (
    <ConnectedSignIn />
  ) : (
    <Card>{<p className="note">{fr.auth.noBackend}</p>}</Card>
  );
}

/** **La carte d'accréditation** : la manchette, le formulaire partagé, puis la une du joueur. */
function Card({ children }: { children: ReactNode }) {
  return (
    <OffSeasonPage>
      <div className="center">
        <article className="sheet pile entry" aria-labelledby="t-cx">
          <header className="mast">
            <div className="top" />
            <div className="top2" />
            <div className="wm" id="t-cx">
              <Wordmark size={52} />
            </div>
            <div className="rule" />
            <div className="dl">
              <span>{fr.auth.dateline}</span>
              <span>{romanDate(new Date())}</span>
            </div>
          </header>
          {children}
          <div className="foot">
            <Link className="link" to="/">
              {fr.front.back}
            </Link>
            <Link className="link" to="/credits">
              {fr.credits.open}
            </Link>
          </div>
        </article>
      </div>
    </OffSeasonPage>
  );
}

export function ConnectedSignIn() {
  const navigate = useNavigate();
  return (
    <Card>
      <AccountForm
        /** La une prend la place du formulaire : le retour du navigateur ne ramène pas un
         *  joueur connecté devant ses deux champs. Le tampon a le temps de tomber. */
        onSignedIn={() =>
          new Promise<void>((done) =>
            setTimeout(() => {
              void navigate({ to: '/accueil', replace: true });
              done();
            }, 700),
          )
        }
      />
      <div className="after">
        <p className="note" style={{ margin: 0 }}>
          {fr.auth.after}
        </p>
      </div>
    </Card>
  );
}
