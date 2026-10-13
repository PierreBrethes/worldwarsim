import { useState, type ReactNode } from 'react';
import { fr } from '@/i18n/fr';

/**
 * **La phrase d'aide repliée sous un « ? »** (table d'état-major) : posée à demeure, elle se lisait
 * une fois et pesait ensuite sur chaque ouverture de la fenêtre. Dépliée, elle flotte à côté de sa
 * marque plutôt que de pousser la page — ouvrir l'aide ne déplace pas ce qu'elle explique.
 * `details` plutôt qu'un bouton à état : le clavier, l'état déplié et la bascule viennent du
 * navigateur. La note se pose du côté où il y a la place : une fenêtre qui défile la couperait
 * au bord.
 */
export function HelpMark({ children }: { children: ReactNode }) {
  const [side, setSide] = useState({ upward: false, leftward: true });
  return (
    <details className="relative inline-block align-middle">
      {/* Le côté se mesure au clic, avant que la note ne s'ouvre : mesurée après, elle se
          montrerait une image du mauvais côté puis sauterait. */}
      <summary
        onClick={(event) => {
          const details = event.currentTarget.parentElement as HTMLElement;
          const mark = details.getBoundingClientRect();
          const room = roomOf(details);
          setSide({
            upward: room.bottom - mark.bottom < 180,
            leftward: room.right - mark.left < NOTE_WIDTH + 10,
          });
        }}
        aria-label={fr.common.help}
        title={fr.common.help}
        className="block cursor-pointer list-none [&::-webkit-details-marker]:hidden"
      >
        <span className="grid h-[16px] w-[16px] place-items-center border border-(color:--ink)/50 font-(family-name:--font-display) text-[11px] leading-none text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)]">
          ?
        </span>
      </summary>
      <span
        className={`float absolute z-20 block max-w-[70vw] border border-[var(--ink)] bg-[var(--paper)] px-3 py-[8px] text-left font-(family-name:--font-body) text-[12px] leading-[1.45] font-normal tracking-normal text-[var(--ink-soft)] normal-case italic ${
          side.leftward ? 'right-0' : 'left-0'
        } ${side.upward ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'}`}
        style={{ width: NOTE_WIDTH }}
      >
        {children}
      </span>
    </details>
  );
}

const NOTE_WIDTH = 300;

/** Ce qui couperait la note : le premier ancêtre qui défile, sinon l'écran. */
function roomOf(element: HTMLElement): { bottom: number; right: number } {
  for (let up = element.parentElement; up !== null; up = up.parentElement) {
    if (/auto|scroll|hidden/.test(getComputedStyle(up).overflowY)) {
      const box = up.getBoundingClientRect();
      return {
        bottom: Math.min(box.bottom, window.innerHeight),
        right: Math.min(box.right, window.innerWidth),
      };
    }
  }
  return { bottom: window.innerHeight, right: window.innerWidth };
}
