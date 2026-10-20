import { halifaxNoteOf } from '@/domain/movement-orders';
import { fr } from '@/i18n/fr';
import type { PlayerView } from '@/domain/player-view';

/** **Halifax sur le compteur de slots** : ce que le compte n'a pas retenu, dit à côté de lui. */
export function HalifaxMark({ slots }: { slots: PlayerView['me']['slots'] }) {
  if (halifaxNoteOf(slots)?.sparing !== true) return null;
  return (
    <span className="text-[10px] leading-none font-semibold tracking-[.08em] text-[var(--ink-soft)] uppercase">
      {fr.banner.halifaxSpared}
    </span>
  );
}
