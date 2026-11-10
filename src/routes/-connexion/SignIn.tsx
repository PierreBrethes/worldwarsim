import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import { Wordmark } from '@/shell/Masthead';
import { announceArrival } from '@/data/arrival';
import { convexClient } from '@/data/convexClient';
import { AccountForm } from '@/shell/AccountForm';
import { OffSeasonPage, romanDate } from '@/shell/OffSeason';

export function SignIn() {
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

/** Le temps que le tampon tombe (`os-stamp`), avant de tourner la page. */
const STAMP_MS = 450;

export function ConnectedSignIn() {
  const navigate = useNavigate();
  const { ouvrir, suite } = useSearch({ strict: false });
  return (
    <Card>
      <AccountForm
        opening={ouvrir === true}
        /** La suite prend la place du formulaire : le retour du navigateur ne ramène pas un
         *  joueur connecté devant ses deux champs. Qui venait fonder arrive à la fondation ; les
         *  autres à l'accueil, d'où une partie seule à attendre s'ouvre d'elle-même. */
        onSignedIn={() =>
          new Promise<void>((done) =>
            setTimeout(() => {
              if (suite === 'fonder') void navigate({ to: '/fonder', replace: true });
              else {
                announceArrival();
                void navigate({ to: '/accueil', replace: true });
              }
              done();
            }, STAMP_MS),
          )
        }
      />
    </Card>
  );
}
