import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';

/**
 * **La phrase d'aide repliée sous un « ? »** (table d'état-major) : posée à demeure, elle se lisait
 * une fois et pesait ensuite sur chaque ouverture de la fenêtre. Dépliée, elle flotte sous sa
 * marque plutôt que de pousser la page — ouvrir l'aide ne déplace pas ce qu'elle explique.
 * `details` plutôt qu'un état React : le clavier, `aria-expanded` et la bascule viennent du
 * navigateur.
 */
export function HelpMark({
  children,
  align = 'right',
}: {
  children: ReactNode;
  /** Le bord de la marque auquel la note s'accroche — celui qui garde la note dans la fenêtre. */
  align?: 'left' | 'right';
}) {
  return (
    <details className="relative inline-block align-middle">
      <summary
        aria-label={fr.common.help}
        title={fr.common.help}
        className="grid h-[16px] w-[16px] cursor-pointer list-none place-items-center border border-(color:--ink)/50 font-(family-name:--font-display) text-[11px] leading-none text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)] [&::-webkit-details-marker]:hidden"
      >
        ?
      </summary>
      <p
        className={`float absolute top-[calc(100%+6px)] z-20 w-[300px] max-w-[70vw] border border-[var(--ink)] bg-[var(--paper)] px-3 py-[8px] text-left text-[12px] leading-[1.45] font-normal tracking-normal text-[var(--ink-soft)] normal-case italic ${
          align === 'right' ? 'right-0' : 'left-0'
        }`}
      >
        {children}
      </p>
    </details>
  );
}
