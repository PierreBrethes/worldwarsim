import { useLayoutEffect, type RefObject } from 'react';

/**
 * **Le réglage d'animations tel que la racine le porte** (`__root.tsx`) : absent hors du jeu,
 * dans un test par exemple, et rien ne bouge alors.
 */
export const motionNow = (): string | undefined => document.documentElement.dataset.motion;

/** Une durée des jetons (`tokens.css`), en millisecondes : le JS ne recopie pas le rythme. */
export const durationToken = (name: '--dur-quick' | '--dur-base' | '--dur-slow'): number =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

export const easeOutToken = (): string =>
  getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || 'ease-out';

/**
 * **Ce qui s'ouvre repart par où il est venu** : au démontage, une copie inerte du cadre
 * (`frame`) prend sa place le temps de sa sortie (`enter` remplacé par `leave`, `index.css`), puis
 * s'efface. Une copie plutôt qu'un démontage retenu : la fenêtre partie ne relance ni ses
 * crochets ni sa fermeture, et la route n'a rien à savoir.
 *
 * La copie se pose en tête de son parent, sous ce qui s'ouvre à sa place : passer d'une fenêtre
 * à l'autre, c'est la nouvelle qui se déplie par-dessus celle qui se replie. Une surface que
 * Suspense ne fait que cacher reste branchée, et ne laisse donc pas de copie.
 */
export function useLeaveGhost(
  frame: RefObject<HTMLElement | null>,
  enter: string,
  leave: string,
): void {
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    return () => {
      const motion = motionNow();
      const parent = node.parentNode;
      if ((motion !== 'full' && motion !== 'reduced') || parent === null) return;
      // Une copie de défileur revient en haut : sa position se relève tant qu'il est branché.
      const scrolled = [...node.querySelectorAll('*')].flatMap((element, rank) =>
        element.scrollTop || element.scrollLeft
          ? [{ rank, top: element.scrollTop, left: element.scrollLeft }]
          : [],
      );
      const ghost = node.cloneNode(true) as HTMLElement;
      queueMicrotask(() => {
        if (node.isConnected || !parent.isConnected) return;
        const moving = ghost.classList.contains(enter)
          ? ghost
          : ghost.querySelector<HTMLElement>(`.${enter}`);
        if (moving === null) return;
        ghost.inert = true;
        ghost.setAttribute('aria-hidden', 'true');
        moving.classList.replace(enter, leave);
        parent.insertBefore(ghost, parent.firstChild);
        const all = ghost.querySelectorAll('*');
        for (const { rank, top, left } of scrolled) {
          all[rank]!.scrollTop = top;
          all[rank]!.scrollLeft = left;
        }
        const drop = () => ghost.remove();
        moving.addEventListener('animationend', (event) => event.target === moving && drop());
        setTimeout(drop, 1000);
      });
    };
  }, [frame, enter, leave]);
}
