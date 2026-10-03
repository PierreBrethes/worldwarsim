import { fr } from '@/i18n/fr';
import type { DepositKey } from '@/domain/ids';
import type { FoundationDebt } from '@/domain/economy';
import type { Placement, PlacementCondition } from '@/domain/construction';
import type { PlayerView } from '@/domain/player-view';
import { BuildingPlate } from '@/emblems/Plate';

/**
 * **La dette de la saison, dépliée dans la ligne qui l'annonce.** Une saison s'ouvre en devant à
 * son joueur un extracteur par ressource que son sol porte, et il ne l'apprenait nulle part : un
 * playtest a mesuré une filature *payée* lancée avant les mines *offertes*.
 *
 * C'était l'ordre de mobilisation, une carte à part en haut à gauche. Il est devenu **la première
 * ligne de « à faire maintenant »** (décision Pierre, 30/08) : une seule carte dit ce qui attend
 * le joueur, et la fondation est une attente comme les autres — la plus vieille, donc la première.
 * Ce fichier n'a plus d'en-tête ni de cadre ; il est le corps qu'on déplie.
 *
 * Le geste n'a pas bougé : **on clique une clé, le plateau allume le sol qu'elle accepte, on
 * clique la région.** Aucune règle propre — `placementOf` est le refus de pose du serveur, lu
 * deux fois — et aucun état de ce qui a été posé : le corps est dessiné depuis `me.foundation`,
 * donc il se vide à mesure que la saison s'acquitte, et sa ligne disparaît avec.
 *
 * **Une ligne par dette, et une dette est un couple** : la mine du fer et celle du charbon sont
 * deux lignes, chacune n'allumant que le sol qui l'acquitte. Le gisement suffisait à les nommer
 * tant que le socle n'était que des extracteurs ; depuis que **le quartier général ouvre la
 * liste** (décision 1b du 13/09), une dette se nomme par son couple entier — le QG n'a pas de
 * gisement, et c'est précisément ce qui le laisse se poser où le joueur veut.
 */
/** A debt of the foundation, and the ground that would pay it: one entry per owed couple. */
export type FoundationPlacement = Placement & { readonly deposit: DepositKey | null };

/** L'identité d'une ligne — le couple, pas la clé ni le gisement seuls : deux mines dues se
 *  distinguent par leur sol, et le QG par n'en avoir aucun. */
export const debtKey = (due: FoundationDebt): string => `${due.key}:${due.deposit ?? ''}`;

export function FoundationRows({
  view,
  placements,
  armed,
  error,
  onArm,
}: {
  view: PlayerView;
  /** One entry per owed couple, in the order the foundation owes them. */
  placements: ReadonlyArray<FoundationPlacement>;
  armed: string | null;
  error: string | null;
  onArm: (debt: string | null) => void;
}) {
  const chosen = placements.find((placement) => debtKey(placement) === armed) ?? null;

  return (
    <div className="border-t border-(color:--ink)/28 bg-(--ink)/5">
      <div className="py-[3px]">
        {placements.map((placement) => (
          <KeyRow
            key={debtKey(placement)}
            placement={placement}
            armed={debtKey(placement) === armed}
            onArm={() => onArm(debtKey(placement) === armed ? null : debtKey(placement))}
          />
        ))}
      </div>

      {chosen === null ? (
        <p className="border-t border-(color:--ink)/22 px-[13px] py-[8px] text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
          {fr.mobilization.pick}
        </p>
      ) : (
        <Aimed view={view} placement={chosen} onCancel={() => onArm(null)} />
      )}

      {error !== null && (
        <p className="border-t border-[var(--critical)] px-[13px] py-[7px] text-[11.5px] leading-[1.4] text-[var(--critical)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One key of the foundation. It is a button whether or not it has ground to go down on — the
 * revised rule of ADR 0015 is *rien d'affiché sans sa condition*, not *rien d'affiché* : the
 * line that cannot be placed today still says what would open it, and clicking it is how the
 * player finds out that nothing lights up.
 */
function KeyRow({
  placement,
  armed,
  onArm,
}: {
  placement: FoundationPlacement;
  armed: boolean;
  onArm: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onArm}
      className={`flex w-full cursor-pointer items-center gap-[9px] border-b border-(color:--ink)/18 px-[13px] py-[7px] text-left last:border-b-0 ${
        armed ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink)] hover:bg-(--ink)/7'
      }`}
    >
      <BuildingPlate building={placement.key} height={24} />
      <span className="text-[13.5px] leading-none font-semibold tracking-[.02em]">
        {placement.deposit === null
          ? fr.mobilization.anywhereAtHome(fr.buildings[placement.key])
          : fr.mobilization.onDeposit(fr.buildings[placement.key], fr.deposits[placement.deposit])}
      </span>
      <span className="flex-1" />
      <span
        className="max-w-[46%] text-right text-[11px] leading-[1.35]"
        style={{ color: armed ? 'var(--notable)' : 'var(--ink-soft)' }}
      >
        {armed ? offerText(placement) : wantsText(placement)}
      </span>
    </button>
  );
}

/**
 * What the region must be for this debt to go down — said before it is chosen, never after.
 * **Le gisement de la dette, pas ceux de la clé** : une mine due pour le fer ne dit pas « fer ou
 * charbon », sinon le joueur la poserait sur le charbon et la paierait plein tarif. Le quartier
 * général ne demande rien qu'un sol à soi, et le dit ainsi.
 */
const wantsText = (placement: FoundationPlacement): string =>
  placement.deposit === null
    ? fr.mobilization.wants.home
    : fr.mobilization.wants.deposit([fr.deposits[placement.deposit]]);

const offerText = (placement: FoundationPlacement): string =>
  placement.regionIds.length === 0
    ? fr.mobilization.noneEligible
    : fr.mobilization.eligible(placement.regionIds.length);

/**
 * The foot of the body once a key is armed: what the board is now waiting for, the regions it
 * lit, and the way out. **A mode one cannot leave is a trap** — the same rule the aim banner
 * follows.
 */
function Aimed({
  view,
  placement,
  onCancel,
}: {
  view: PlayerView;
  placement: FoundationPlacement;
  onCancel: () => void;
}) {
  const names = placement.regionIds.flatMap((regionId) => {
    const region = view.me.regions.find((candidate) => candidate.id === regionId);
    return region === undefined ? [] : [region.name];
  });

  return (
    <>
      <div className="border-t border-[var(--ink)] bg-[rgba(176,116,52,.16)] px-[13px] py-[9px]">
        {placement.condition === null ? (
          <>
            <p className="text-[12.5px] leading-[1.4] font-semibold">
              {fr.mobilization.chooseRegion(wantsText(placement))}
            </p>
            <p className="mt-[2px] text-[11px] leading-[1.4] text-[var(--ink-soft)]">
              {fr.mobilization.highlighted(names)}
            </p>
            <p className="mt-[2px] text-[11px] leading-[1.4] text-[var(--ink-quiet)] italic">
              {fr.mobilization.zoomIn}
            </p>
          </>
        ) : (
          <p className="text-[12.5px] leading-[1.4]">{conditionText(placement.condition)}</p>
        )}
      </div>
      <div className="border-t border-(color:--ink)/22 px-[13px] py-[7px]">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer text-[11px] text-[var(--interaction)] underline decoration-[rgba(63,90,125,.45)] underline-offset-2 hover:text-[var(--ink)]"
        >
          {fr.mobilization.cancel}
        </button>
      </div>
    </>
  );
}

/**
 * The one sentence that would open a key nothing accepts. It reads the condition the shared
 * placement rule produced, so a screen and a server refusal can never name different things.
 */
export function conditionText(condition: PlacementCondition): string {
  const said = fr.economy.condition;
  switch (condition.kind) {
    case 'locked':
      return said.locked(condition.hqLevel);
    case 'deposit':
      return said.deposit(condition.deposits.map((deposit) => fr.deposits[deposit]));
    case 'coastal':
      return said.coastal;
    case 'siteFull':
      return said.siteFull;
    case 'regionsTaken':
      return said.regionsTaken;
  }
}
