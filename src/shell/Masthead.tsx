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
 */
export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="inline-flex flex-col items-stretch whitespace-nowrap"
      aria-label={fr.masthead.title}
      role="img"
    >
      <span
        aria-hidden
        className="inline-flex items-baseline"
        style={{
          gap: size * 0.12,
          fontFamily: 'var(--font-display)',
          lineHeight: 0.98,
        }}
      >
        <span style={{ fontStyle: 'italic', fontWeight: 500, fontSize: Math.max(9, size * 0.5) }}>
          {fr.masthead.article}
        </span>
        <span
          style={{
            fontWeight: 800,
            fontSize: size,
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
          marginTop: size * 0.06,
          height: Math.max(2, size * 0.09),
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
export function Masthead({ date }: { date: string }) {
  return (
    <div className="text-[var(--ink)]">
      <div aria-hidden>
        <div className="h-[3px] bg-[var(--ink)]" />
        <div className="mt-[2px] h-px bg-[var(--ink)]" />
      </div>
      <div className="flex justify-center py-[18px]">
        <Wordmark size={54} />
      </div>
      <div aria-hidden className="h-px bg-[var(--ink)]" />
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-[6px] text-[10px] tracking-[.2em] text-[var(--ink-note)] uppercase">
        <span>{fr.masthead.dateline}</span>
        <span className="font-(family-name:--font-mono) tracking-[.12em]">{date}</span>
      </div>
    </div>
  );
}
