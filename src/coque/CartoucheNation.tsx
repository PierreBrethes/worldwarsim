import { FiligraneDrapeau } from '@/emblemes/Drapeau';

/**
 * Le drapeau touche le bord de la surface et le texte démarre là où le filigrane s'éteint.
 * Sa boîte reste au ratio 3:2 — on ne déforme jamais un drapeau — donc sa largeur se déduit
 * de la hauteur, et le retrait du texte avec elle : rien à réaccorder à la main.
 * **Fond sombre seulement**, comme tout emploi du filigrane.
 */
export function CartoucheNation({
  nation,
  doctrine,
  hauteur,
}: {
  nation: string | null;
  doctrine?: string | undefined;
  hauteur: number;
}) {
  return (
    <div
      className="relative flex shrink-0 items-center overflow-hidden pr-5 whitespace-nowrap"
      style={{ height: hauteur }}
    >
      <FiligraneDrapeau nation={nation} />
      <div
        className="relative flex flex-col justify-center gap-[2px]"
        style={{ paddingLeft: Math.round(hauteur * 1.5 * 0.8), textShadow: '0 1px 3px rgba(23,18,8,.9)' }}
      >
        <span className="font-[var(--font-display)] text-[19px] leading-none font-extrabold tracking-[.02em] text-[var(--paper)] uppercase">
          {nation ?? 'sans nation'}
        </span>
        {doctrine && <span className="eyebrow-sombre leading-none">doctrine {doctrine}</span>}
      </div>
    </div>
  );
}
