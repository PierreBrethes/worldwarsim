import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';

/**
 * **Un titre de quotidien, en CSS et jamais en image.** Le jeu s'appelle La Manchette, et une
 * manchette est le titre d'un journal avec sa bande : l'article en italique, le nom en didone,
 * un filet rouge dessous. Un logo au trait vit à toutes les tailles, prend l'encre de son
 * support et se corrige en une ligne ; un PNG se re-exporte, se floute au zoom et arrive après
 * le reste de la page.
 *
 * **Le filet est le seul aplat rouge de la charte**, et il garde `--critical` sur le papier
 * comme sur le bureau sombre ; tout le reste prend `currentColor`. Sous 9 px l'article devient
 * illisible : le plancher compte plus que la proportion à petite taille. **Aucune fonte
 * ajoutée** : Bodoni Moda est déjà celle du display.
 *
 * Tout se mesure en `em` de la taille donnée, pour qu'une taille puisse être une longueur CSS —
 * `min(…, …cqi)` — et que l'enseigne suive la feuille qui la porte au lieu d'en déborder.
 */
export function Wordmark({ size = 34 }: { size?: number | string }) {
  const em = typeof size === 'number' ? `${size}px` : size;
  return (
    <span
      className="inline-flex flex-col items-stretch whitespace-nowrap"
      aria-label={fr.masthead.title}
      role="img"
      style={{ fontSize: em }}
    >
      <span
        aria-hidden
        className="inline-flex items-baseline"
        style={{
          gap: '.12em',
          fontFamily: 'var(--font-display)',
          lineHeight: 0.98,
        }}
      >
        <span style={{ fontStyle: 'italic', fontWeight: 500, fontSize: 'max(9px, .5em)' }}>
          {fr.masthead.article}
        </span>
        <span
          style={{
            fontWeight: 800,
            letterSpacing: '.01em',
            textTransform: 'uppercase',
          }}
        >
          {fr.masthead.word}
        </span>
      </span>
      <span
        aria-hidden
        style={{
          marginTop: '.06em',
          height: 'max(2px, .09em)',
          background: 'var(--critical)',
          transform: 'rotate(-0.6deg)',
        }}
      />
    </span>
  );
}

/**
 * La manchette complète, telle qu'un quotidien la porte : filet double au-dessus, le titre, filet
 * simple, puis la ligne de date. Elle prend l'encre du support — sur le papier de l'accueil, le
 * filet rouge est la seule couleur de la page, et c'est ce qui en fait un repère.
 */
export function Masthead({
  date,
  dateline = fr.masthead.dateline,
  wordmarkSize = 54,
}: {
  date: ReactNode;
  dateline?: ReactNode;
  wordmarkSize?: number | string;
}) {
  return (
    <div className="text-[var(--ink)]">
      <div aria-hidden>
        <div className="h-[3px] bg-[var(--ink)]" />
        <div className="mt-[2px] h-px bg-[var(--ink)]" />
      </div>
      <div className="flex justify-center py-[18px]">
        <Wordmark size={wordmarkSize} />
      </div>
      <div aria-hidden className="h-px bg-[var(--ink)]" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-[6px] text-[10px] tracking-[.2em] text-[var(--ink-note)] uppercase">
        <span>{dateline}</span>
        <span className="font-(family-name:--font-mono) tracking-[.12em]">{date}</span>
      </div>
    </div>
  );
}
