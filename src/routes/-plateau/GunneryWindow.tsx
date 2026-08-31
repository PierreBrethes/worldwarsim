import { DAMAGE_TABLE, DEFENDER_BONUS, DRY_AMMUNITION_FACTOR } from '../../../convex/constants';
import { fr, profileAbbreviation, profileLabel } from '@/i18n/fr';
import { COMBAT_PROFILES, TRANSPORT_PROFILES, type CombatProfile } from '@/domain/combat';
import { gunneryRows, type Band, type GunneryShot } from '@/domain/gunnery';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';

/**
 * **L'abaque de tir : la table de chiffrage, en lecture seule** (ADR 0018 §4, décision de Pierre
 * du 31/08). Soixante-quinze couples existaient, testés, et le joueur recrutait à l'aveugle.
 *
 * **`DAMAGE_TABLE` est importée, jamais recopiée.** C'est la leçon de `verif-chiffrage.mjs`, qui
 * validait le chiffrage sur une copie : deux tables finissent par diverger, et le jour où elles
 * divergent l'écran ment sur des chiffres que le jeu ne joue plus.
 *
 * **Du détail au clic** (maquette de la couche permanente, 30/08) : rien ici n'est permanent,
 * rien n'y est actionnable, et le rail n'y gagne aucune entrée — on l'ouvre depuis le
 * recrutement et depuis la popin de troupe, aux deux endroits où la question se pose.
 */
export function GunneryWindow({ onClose, ...windowProps }: WindowProps) {
  const rows = gunneryRows(DAMAGE_TABLE);
  const columns = COMBAT_PROFILES;

  return (
    <FloatingWindow name="gunnery" onClose={onClose} {...windowProps} alignment="top" width={980}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <DragHandle className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--ink)] px-4 py-[10px] text-[10px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          <span>{fr.gunnery.header}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        {/* Ce que la table garantit, imprimé : c'est le garde-fou du projet (fiche 08 §9), et
            c'est la première chose qu'un joueur venu chercher l'arme absolue doit lire. */}
        <div className="shrink-0 border-b border-[rgba(42,33,24,.35)] px-4 py-[10px]">
          <p className="font-(family-name:--font-display) text-[17px] leading-[1.25] text-[var(--ink)]">
            {fr.gunnery.guarantee}
          </p>
          <p className="mt-[5px] max-w-[74ch] text-[12px] leading-[1.45] text-[var(--ink-soft)]">
            {fr.gunnery.lead}
          </p>
          <p className="mt-[3px] max-w-[74ch] text-[11.5px] leading-[1.45] text-[var(--ink-quiet)] italic">
            {fr.gunnery.before(DEFENDER_BONUS, DRY_AMMUNITION_FACTOR)}
          </p>
        </div>

        <Legend />

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[11.5px]">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 left-0 z-20 border-b border-[var(--ink)] bg-[var(--paper)] px-3 py-[6px] text-left text-[9px] tracking-[.18em] text-[var(--ink-soft)] uppercase"
                >
                  {fr.gunnery.piece}
                </th>
                {columns.map((defender) => (
                  <th
                    key={defender}
                    scope="col"
                    title={profileLabel(defender)}
                    className="sticky top-0 z-10 border-b border-[var(--ink)] bg-[var(--paper)] px-[6px] py-[6px] font-(family-name:--font-mono) text-[9.5px] tracking-[.06em] text-[var(--ink-soft)]"
                  >
                    {profileAbbreviation(defender)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.attacker} className="border-b border-[rgba(42,33,24,.18)]">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--paper)] px-3 py-[5px] text-left text-[12px] font-normal whitespace-nowrap text-[var(--ink)]"
                  >
                    {profileLabel(row.attacker)}
                  </th>
                  {row.fires ? (
                    row.shots.map((shot) => (
                      <Cell key={shot.defender} attacker={row.attacker} shot={shot} />
                    ))
                  ) : (
                    /* Il se recrute et ne tire sur rien : la ligne le dit, plutôt que de
                       disparaître ou de s'aligner en onze tirets — les deux se liraient comme
                       une panne au lieu d'une règle. */
                    <td
                      colSpan={columns.length}
                      className="border-l border-[rgba(42,33,24,.14)] px-[10px] py-[5px] text-[11.5px] text-[var(--ink-soft)] italic"
                    >
                      {fr.gunnery.firesNothing}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Les transports ne sont pas des trous de la grille, ils en sont les cibles : le dire
            vaut mieux qu'une colonne muette qui a l'air d'une panne (fiche 08 §9). */}
        <p className="shrink-0 border-t border-[rgba(42,33,24,.35)] px-4 py-[9px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
          {fr.gunnery.transports(
            TRANSPORT_PROFILES.map((profile) => profileLabel(profile)).join(', '),
          )}
        </p>
      </div>
    </FloatingWindow>
  );
}

/**
 * **L'encre dit la bande avant que le chiffre ne soit lu.** Une densité, jamais un vert et un
 * rouge : la même case est une bonne nouvelle pour qui tire et une mauvaise pour qui encaisse,
 * et une couleur de verdict trancherait à la place du joueur.
 */
const BAND_STYLE: Readonly<Record<Band, { background: string; color: string }>> = {
  strong: { background: 'rgba(42,33,24,.78)', color: 'var(--paper)' },
  even: { background: 'rgba(42,33,24,.22)', color: 'var(--ink)' },
  weak: { background: 'transparent', color: 'var(--ink-quiet)' },
};

function Cell({ attacker, shot }: { attacker: CombatProfile; shot: GunneryShot }) {
  const target = profileLabel(shot.defender);
  const from = profileLabel(attacker);

  if (shot.reach === 'none') {
    return (
      <td
        title={fr.gunnery.noShot(from, target)}
        className="border-l border-[rgba(42,33,24,.14)] px-[6px] py-[5px] text-center font-(family-name:--font-mono) text-[11px] text-[var(--ink-faint)]"
      >
        {fr.gunnery.outOfReach}
      </td>
    );
  }

  const printed = fr.gunnery.share(shot.share);
  return (
    <td
      title={fr.gunnery.shot(from, target, printed)}
      style={BAND_STYLE[shot.band]}
      className="border-l border-[rgba(42,33,24,.14)] px-[6px] py-[5px] text-center font-(family-name:--font-mono) text-[11px]"
    >
      {printed}
    </td>
  );
}

/** La clé de lecture, une fois, au-dessus de la grille — sinon les trois encres se devinent. */
function Legend() {
  const bands: ReadonlyArray<Band> = ['strong', 'even', 'weak'];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-[14px] gap-y-1 border-b border-[rgba(42,33,24,.35)] px-4 py-[7px]">
      <span className="eyebrow">{fr.gunnery.reading}</span>
      {bands.map((band) => (
        <span key={band} className="flex items-center gap-[6px]">
          <span
            aria-hidden
            className="inline-block h-[12px] w-[18px] border border-[rgba(42,33,24,.35)]"
            style={{ background: BAND_STYLE[band].background }}
          />
          <span className="text-[11.5px] text-[var(--ink-soft)]">{fr.gunnery.bands[band]}</span>
        </span>
      ))}
      <span className="flex items-center gap-[6px]">
        <span
          aria-hidden
          className="inline-block w-[18px] text-center font-(family-name:--font-mono) text-[11px] text-[var(--ink-faint)]"
        >
          {fr.gunnery.outOfReach}
        </span>
        <span className="text-[11.5px] text-[var(--ink-soft)]">{fr.gunnery.bands.none}</span>
      </span>
    </div>
  );
}
