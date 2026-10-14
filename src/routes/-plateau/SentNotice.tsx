import { fr } from '@/i18n/fr';
import { asClockTime } from '@/domain/duration';
import { Stamp } from '@/shell/Stamp';

/**
 * **L'ordre transmis, la boucle refermée** (refonte mobile, 1d). La feuille d'ordre s'est
 * refermée seule ; ce cartouche dit ce qui est parti, où et quand il arrive, et combien de slots
 * restent engagés — puis s'efface. « Suivre » amène la carte sur la colonne. Il ne porte aucun
 * « annuler » : rien ne rappelle un mouvement parti (décision 13a).
 */
export function SentNotice({
  order,
  destination,
  arrivesAt,
  slots,
  onFollow,
}: {
  order: string;
  destination: string;
  arrivesAt: number;
  /** `null` en Blitz : pas de slots (B5). */
  slots: { readonly used: number; readonly total: number } | null;
  onFollow: () => void;
}) {
  return (
    <div
      role="status"
      className="hud paper-grain flex items-center gap-3 border border-[var(--ink)] px-3 py-[10px] text-[var(--ink)] float"
    >
      <Stamp label={fr.sent.stamp} size="small" />
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="text-[14px] leading-[1.15] font-bold first-letter:uppercase">
          {fr.sent.title(order, destination)}
        </span>
        <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-quiet)]">
          {slots === null
            ? fr.sent.arrival(asClockTime(arrivesAt))
            : fr.sent.line(asClockTime(arrivesAt), slots.used, slots.total)}
        </span>
      </span>
      <button
        type="button"
        onClick={onFollow}
        className="min-h-[44px] shrink-0 cursor-pointer text-[10.5px] font-semibold tracking-[.16em] uppercase underline underline-offset-[3px]"
      >
        {fr.sent.follow}
      </button>
    </div>
  );
}
