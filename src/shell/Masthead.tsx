import { fr } from '@/i18n/fr';

/**
 * **La manchette du site, en CSS et jamais en image.** Un logo au trait vit à toutes les tailles,
 * prend l'encre de son support et se corrige en une ligne ; un PNG se re-exporte, se floute au
 * zoom et arrive après le reste de la page. Le pavé rouge et l'inclinaison sont **le geste du
 * tampon** (`shell/Stamp.tsx`) : le titre du journal est lui aussi une chose qu'on a pressée sur
 * du papier, et les deux doivent se reconnaître.
 *
 * **Aucune fonte ajoutée** : « WW » prend la condensée déjà chargée (Archivo Narrow, celle du
 * corps de texte), « SIM » la didone du display (Bodoni Moda). Charger un Oswald pour deux
 * lettres coûterait une requête bloquante à l'ouverture, pour une graisse que la condensée du
 * projet donne déjà.
 */
export function Wordmark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center whitespace-nowrap"
      style={{ gap: Math.round(size * 0.16) }}
      aria-label={fr.masthead.title}
      role="img"
    >
      <span
        aria-hidden
        style={{
          /** Le pavé rouge : les lettres sont en papier **sur** l'encre critique, jamais l'inverse
           *  — c'est le seul aplat de la charte, et il doit tenir sur le papier comme sur le
           *  bureau sombre. Coins droits, comme un bloc de plomb. */
          background: 'var(--critical)',
          color: 'var(--paper)',
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
          fontSize: size,
          lineHeight: 0.98,
          letterSpacing: '-.01em',
          padding: `${Math.round(size * 0.14)}px ${Math.round(size * 0.16)}px ${Math.round(size * 0.1)}px`,
          transform: 'rotate(-2deg)',
        }}
      >
        {fr.masthead.block}
      </span>
      <span
        aria-hidden
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: size,
          lineHeight: 0.98,
          letterSpacing: '.01em',
        }}
      >
        {fr.masthead.tail}
      </span>
    </span>
  );
}

/**
 * La manchette complète, telle qu'un quotidien la porte : filet double au-dessus, le titre, filet
 * simple, puis la ligne de date. Elle prend l'encre du support — sur le papier de l'accueil, le
 * pavé rouge est la seule couleur de la page, et c'est ce qui en fait un repère.
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
