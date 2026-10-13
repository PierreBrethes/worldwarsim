import { useEffect } from 'react';
import { ARRIVAL_RADIUS_KM, DETECTION_RANGE_KM, outpostReachKm } from '../../../convex/constants';
import { fr } from '@/i18n/fr';
import { useMouseMapping } from '@/data/mouseMapping';
import { useCoarsePointer, useNarrowScreen } from '@/shell/viewport';

/**
 * **Un mode d'emploi, pas un tutoriel.** Une feuille posée sur le plateau à la première entrée
 * d'un joueur, refermée par un tampon et jamais rouverte d'office. Elle ne fléche rien, ne
 * surligne rien et n'attend aucune étape : la doctrine « sans tutoriel » tient, et un joueur qui
 * ferme au premier regard n'a rien perdu — tout ce qu'elle dit se relit depuis les Réglages.
 *
 * Elle ne lit **aucune** donnée de partie. Ce qu'elle décrit est vrai avant le premier clic
 * comme au dernier jour de la saison ; l'y brancher inventerait un état. Les trois rayons sont
 * l'exception qui confirme la règle : ce sont des **constantes d'équilibrage**, pas l'état d'une
 * partie, et les lire ici est ce qui empêche la notice de mentir le jour où elles bougent.
 */
export function BriefingSheet({ onDismiss }: { onDismiss: () => void }) {
  // Le mappage de la souris est la seconde exception, et de la même famille que les rayons :
  // un réglage du joueur, pas l'état d'une partie — et la notice mentirait sans le lire.
  const mapping = useMouseMapping();
  /** La main et l'écran, lus comme partout : le doigt par le pointeur principal, les bureaux par
   *  le seuil (`shell/viewport.ts`). */
  const finger = useCoarsePointer();
  const phone = useNarrowScreen();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onDismiss();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={fr.briefing.header}
      className="fixed inset-0 z-[var(--z-veil)] flex items-center justify-center bg-[rgba(15,10,4,.72)] p-6"
    >
      <div className="hud max-h-full max-w-full overflow-auto">
        <article className="paper-grain w-[880px] max-w-full border border-[var(--ink)] text-[var(--ink)] float">
          <div className="flex items-baseline justify-between gap-5 px-[26px] pt-[11px] pb-[7px]">
            <span className="eyebrow">{fr.briefing.kicker}</span>
            <span className="font-(family-name:--font-mono) text-[10px] tracking-[.14em] text-[var(--ink-note)]">
              {fr.briefing.subtitle}
            </span>
          </div>

          <div className="h-[3px] border-y border-[var(--ink)] bg-[var(--ink)]" />

          <h1 className="px-[26px] pt-[18px] pb-[14px] text-center font-(family-name:--font-display) text-[38px] leading-[.95] font-extrabold tracking-[.03em] uppercase">
            {fr.briefing.header}
          </h1>

          <div className="grid grid-cols-1 border-t border-[var(--ink)] sm:grid-cols-3">
            {/* Le rayon d'un point neuf : la feuille se lit avant d'en avoir fondé un, et c'est
                celui du premier qu'on plantera (`outpostReachKm`, il monte avec le niveau). */}
            {fr.briefing
              .columns(DETECTION_RANGE_KM.infantry, ARRIVAL_RADIUS_KM, outpostReachKm(1), {
                finger,
                phone,
                mapping,
              })
              .map((column) => (
                <Column key={column.title} title={column.title} lines={column.lines} />
              ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[var(--ink)] px-[26px] py-[14px]">
            <p className="text-[11.5px] text-[var(--ink-soft)] italic">{fr.briefing.foot}</p>
            <button
              type="button"
              autoFocus
              title={fr.briefing.dismissTitle}
              onClick={onDismiss}
              className="-rotate-[6deg] cursor-pointer border-2 border-[rgba(157,70,56,.62)] px-[18px] pt-[7px] pb-[6px] font-(family-name:--font-display) text-[15px] tracking-[.24em] text-[rgba(157,70,56,.72)] uppercase hover:border-[var(--critical)] hover:text-[var(--critical)]"
            >
              {fr.briefing.dismiss}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}

/** Une colonne de la notice : un titre de rubrique, puis des lignes qu'on lit en diagonale. */
function Column({ title, lines }: { title: string; lines: ReadonlyArray<string> }) {
  return (
    <section className="border-b border-(color:--ink)/22 px-[22px] py-[16px] last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0">
      <h2 className="border-b border-[var(--ink)] pb-[6px] font-(family-name:--font-display) text-[15px] leading-none font-extrabold tracking-[.05em] uppercase">
        {title}
      </h2>
      <ul className="mt-[11px] flex flex-col gap-[9px]">
        {lines.map((line) => (
          <li
            key={line}
            className="border-l-2 border-(color:--ink)/28 pl-[9px] text-[12.5px] leading-[1.45] text-[var(--ink)]"
          >
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
