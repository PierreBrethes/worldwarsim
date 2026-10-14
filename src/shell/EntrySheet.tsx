import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { fr } from '@/i18n/fr';
import { useSession } from '@/data/session';
import { Newspaper, type Turning } from './Newspaper';

/**
 * **La feuille d'entrée : la une et les crédits**, deux pages qu'un visiteur voit avant d'avoir
 * un compte, et une seule mesure. Sous 768 px la marge intérieure n'est plus les
 * 30 px du bureau : la feuille zoomée à l'échelle d'interface (`.hud`) ne laissait que 300 px
 * à une enseigne qui en demandait 400, d'où la manchette rognée du relevé mobile (C3). La marge
 * est une variable, `--sheet-pad`, que tout ce qui se pose sur la feuille lit au lieu d'écrire
 * son propre chiffre.
 */
export function EntrySheet({
  width,
  turning,
  backdrop = 'film',
  children,
}: {
  width: number;
  turning: Turning;
  backdrop?: 'map' | 'film';
  children: ReactNode;
}) {
  return (
    <Newspaper width={width} turning={turning} backdrop={backdrop}>
      <div className="paper-grain @container relative border border-[var(--ink)] text-[var(--ink)] float [--sheet-pad:30px] max-md:[--sheet-pad:16px]">
        {children}
      </div>
    </Newspaper>
  );
}

/** Ce qu'il faut toucher, au doigt comme à la souris : le mot ne grossit pas, son creux si. */
export const TOUCH_TARGET = 'inline-flex min-h-11 items-center';

/**
 * **La sortie d'une feuille d'entrée** : la une pour qui n'a pas de compte, l'accueil pour qui en
 * a un. La connexion et l'invitation ne se quittaient que par le retour du navigateur — et un
 * visiteur renvoyé à l'accueil y trouvait la porte du compte, pas la page d'où il venait.
 */
export function SheetExit() {
  const signedIn = useSession() !== null;
  return (
    <div className="mx-(--sheet-pad) pb-2 text-center">
      <Link
        to={signedIn ? '/accueil' : '/'}
        className={`text-[11.5px] text-[var(--ink-note)] underline underline-offset-4 hover:text-[var(--ink)] ${TOUCH_TARGET}`}
      >
        {signedIn ? fr.invitation.toHome : fr.front.back}
      </Link>
    </div>
  );
}
