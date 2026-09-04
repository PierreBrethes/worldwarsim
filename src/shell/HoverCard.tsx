import type { ReactNode } from 'react';

/**
 * **Une seule façon de faire une popin de survol** (68a). Le bandeau des ressources l'a inventée
 * — un carton de papier posé sous ce que la souris touche, jamais cliquable, jamais un `title`
 * natif — et la fiche de l'abaque la reprend telle quelle. Deux cartons dessinés séparément
 * finissent par diverger sur le grain, le filet ou l'encre, sur exactement le genre de détail
 * que personne ne relit.
 *
 * L'ancre est un décalage dans le **parent positionné de l'appelant** : lui seul sait quelle
 * boîte est son repère, la carte ne fait que s'y poser. Sans `top`, elle se pose sous cette
 * boîte ; sans `width`, elle tient sur une ligne — une largeur donnée est ce qui autorise la
 * phrase à passer à la ligne.
 */
export function HoverCard({
  left,
  top,
  ink = 'var(--ink)',
  width,
  children,
}: {
  left: number;
  top?: number;
  ink?: string;
  width?: number;
  children: ReactNode;
}) {
  return (
    <div
      className={`paper-grain pointer-events-none absolute z-40 border border-[var(--ink)] px-[8px] py-[4px] text-[11.5px] ${
        top === undefined ? 'top-full mt-[3px]' : ''
      }`}
      style={{
        left,
        top,
        width,
        color: ink,
        whiteSpace: width === undefined ? 'nowrap' : undefined,
      }}
    >
      {children}
    </div>
  );
}
