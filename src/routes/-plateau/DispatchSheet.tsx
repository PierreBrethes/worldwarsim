import { countryLabel, fr } from '@/i18n/fr';
import { isAlarm } from '@/domain/journal';
import type { CombatReport, JournalDispatch } from '@/domain/player-view';
import { BottomSheet } from '@/shell/BottomSheet';
import { Stamp } from '@/shell/Stamp';
import { Row } from './Panel';

/**
 * **L'arrivée sur une dépêche de combat, sous le seuil** (lot mobile-3, §6). La notification
 * d'une attaque seule ouvre le plateau centré sur le lieu, et cette feuille à l'aperçu : le
 * tampon, le titre, puis ce que le journal dit déjà, en lignes — les pertes, le terrain,
 * l'avant-poste désactivé s'il l'est.
 *
 * **L'assaillant n'y est pas nommé**, parce que le compte rendu ne le nomme pas : deux camps qui
 * se sont battus apprennent un effectif et des pertes, jamais une nation ni une composition
 * (ADR 0005). « Voir l'assaillant » n'existe donc pas ici — il ne viendrait qu'avec une position
 * relevée portée par la dépêche, et elle n'en porte aucune. Aucune règle nouvelle non plus : pas
 * de renfort suggéré, seulement la garnison du point, le journal, ou plus tard.
 */
export function DispatchSheet({
  dispatch,
  combat,
  onOpenGarrison,
  onOpenJournal,
  onClose,
}: {
  dispatch: JournalDispatch;
  combat: CombatReport;
  /** `null` quand rien de soi ne se tient plus au lieu du combat : il n'y a rien à ouvrir. */
  onOpenGarrison: (() => void) | null;
  onOpenJournal: () => void;
  onClose: () => void;
}) {
  const attacking = combat.side === 'attacker';
  const where = countryLabel(combat.hostCountry);
  const said = fr.dispatchSheet;
  return (
    <BottomSheet
      title={said.kicker(dispatch.t)}
      aside={
        <Stamp
          label={fr.stamps.dispatches[dispatch.kind]}
          tone={isAlarm(dispatch.kind) ? 'critical' : 'ink'}
          size="small"
        />
      }
      onClose={onClose}
      initial="peek"
      kicker
      hug
    >
      <div className="px-4 pt-[10px] pb-[6px] text-[var(--ink)]">
        <h3
          className="font-(family-name:--font-display) text-[22px] leading-[1.12] font-extrabold"
          style={{ color: isAlarm(dispatch.kind) ? 'var(--critical)' : 'var(--ink)' }}
        >
          {said.title(attacking, combat.cause === 'interception', where)}
        </h3>
        <div className="mt-[8px]">
          <Row
            label={said.engaged}
            value={said.engagedValue(combat.mine.troops, combat.theirs.troops)}
          />
          <Row
            label={said.losses}
            value={said.lossesValue(combat.mine.lost, combat.mine.destroyed, combat.mine.routed)}
          />
          <Row label={said.theirs} value={said.theirsValue(combat.theirs.lost)} />
          <Row label={said.ground} value={combat.won ? said.held : said.lost} />
          {combat.outpostDisabled && <Row label={said.outpost} value={said.outpostDisabled} />}
        </div>
      </div>
      {/* Collés au pied de la feuille : sur un petit écran les lignes défilent derrière, et ce
          qu'on peut faire reste sous le pouce. */}
      <div className="paper-grain sticky bottom-0 flex flex-col gap-[8px] border-t border-(color:--ink)/30 px-4 pt-[8px] pb-[10px]">
        {onOpenGarrison !== null && (
          <button
            type="button"
            onClick={onOpenGarrison}
            className="min-h-[44px] w-full cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-[10px] text-[11px] tracking-[.18em] text-[var(--paper)] uppercase"
          >
            {said.openGarrison}
          </button>
        )}
        <div className="flex gap-[8px]">
          <button
            type="button"
            onClick={onOpenJournal}
            className="min-h-[44px] flex-1 cursor-pointer border border-[var(--ink)] px-[10px] text-[11px] tracking-[.18em] text-[var(--ink)] uppercase"
          >
            {said.openJournal}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] flex-1 cursor-pointer border border-[var(--ink)] px-[10px] text-[11px] tracking-[.18em] text-[var(--ink)] uppercase"
          >
            {said.later}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
