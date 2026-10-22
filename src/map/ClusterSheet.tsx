import type { ClusterSheet as Sheet } from '@/domain/pins';
import { fr } from '@/i18n/fr';

/**
 * **La fiche d'une grappe ouverte** (#234, maquette « épingles ») : ce qu'elle compte, la phrase
 * qui dit qu'on ne la lève pas, et « approcher ». Elle pend au-dessus de la grappe, comme une
 * affiche au survol ; au doigt, le toucher l'ouvre.
 */
export function ClusterSheet({
  sheet,
  x,
  y,
  onApproach,
  onClose,
}: {
  sheet: Sheet;
  /** The cluster's middle, in the map's own pixels. */
  x: number;
  y: number;
  onApproach: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="map-poster-anchor"
      style={{ transform: `translate3d(${x}px, ${y - 12}px, 0)`, pointerEvents: 'auto' }}
    >
      <div className="map-poster" role="dialog" aria-label={sheet.kicker}>
        <span className="map-poster-eyebrow">{sheet.kicker}</span>
        {sheet.lines.map((line) => (
          <span key={line} className="map-poster-line">
            {line}
          </span>
        ))}
        <span className="map-poster-line text-[var(--ink-soft)]">{sheet.note}</span>
        <span className="mt-[4px] flex items-center justify-between gap-[8px]">
          <button
            type="button"
            onClick={onApproach}
            className="min-h-[32px] cursor-pointer bg-[var(--ink)] px-[12px] text-[10px] tracking-[.18em] text-[var(--paper)] uppercase"
          >
            {fr.cluster.approach}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[32px] cursor-pointer px-[4px] text-[11px] underline"
          >
            {fr.common.close}
          </button>
        </span>
      </div>
    </div>
  );
}
