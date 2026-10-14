import { useQuery } from 'convex/react';
import { Fragment, useState, type MouseEvent } from 'react';
import { api } from '../../../convex/_generated/api';
import {
  contactKm,
  DAMAGE_TABLE,
  CARRY_CAPACITY_BY_ROLE,
  GARRISON_DAMAGE_TAKEN,
  DRY_AMMUNITION_FACTOR,
  detectionRangeOf,
} from '../../../convex/constants';
import { aBuilding, fr, profileAbbreviation, profileLabel, roleLabel } from '@/i18n/fr';
import { TRANSPORT_PROFILES, type CombatProfile } from '@/domain/combat';
import {
  gunneryRows,
  movementSheetOf,
  PROFILE_UNITS,
  profilesFor,
  type Band,
  type GunneryShot,
} from '@/domain/gunnery';
import { DOMAIN_BY_ROLE, LIFT_CAPACITY, LIFT_COST, tierLabel } from '@/domain/troops';
import type { UnitTier } from '@/domain/troops';
import type { UnitRole } from '@/domain/ids';
import { asDuration } from '@/domain/duration';
import { UnitSprite } from '@/emblems/UnitSprite';
import { equipmentLabel } from '@/emblems/units/equipment';
import { ClockGlyph, EyeGlyph, HeartGlyph, IngotGlyph } from '@/shell/Glyph';
import { HoverCard } from '@/shell/HoverCard';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';
import { HelpMark } from './HelpMark';
import type { Seat } from '@/data/session';
import { rolesFormingSites } from '@/domain/blitz';
import type { Theatre } from '@/domain/theatres';
import { BLITZ } from '../../../convex/constants';

/**
 * **L'abaque de tir, et le catalogue au pli** (ADR 0018 §4, décisions du 31/08 et 60b du 01/09).
 * Soixante-quinze couples existaient, testés, et le joueur recrutait à l'aveugle ; la grille a
 * réglé « qui bat qui ». Le pli règle le reste — ce que ça coûte, ce que ça vaut, et **ce qu'il
 * faut bâtir pour l'avoir**, qui vivait dans les sections « bloqué : aucun aérodrome » de la
 * fenêtre Production morte avec l'onglet (59a).
 *
 * **`DAMAGE_TABLE` est importée, jamais recopiée.** C'est la leçon de `verif-chiffrage.mjs`, qui
 * validait le chiffrage sur une copie : deux tables finissent par diverger, et le jour où elles
 * divergent l'écran ment sur des chiffres que le jeu ne joue plus. Le catalogue suit la même
 * règle : `workshop.grid` est servi **sans condition de bâtiment**, donc la fiche se lit sans
 * rien posséder — c'est tout l'objet du déménagement.
 *
 * **Aucune action, aucun stock.** On ne forme pas depuis l'abaque : un coût nu suffit, et un
 * « 18 / 320 » y serait la réserve imprimée une fois de plus (contrat 06 P3).
 */
export function GunneryWindow({
  seat,
  theatre,
  onClose,
  ...windowProps
}: WindowProps & { seat: Seat; theatre: Theatre | null }) {
  const workshop = useQuery(api.troops.workshop, seat);
  const columns = profilesFor(workshop?.blitz === true ? 'blitz' : 'mondiale');
  const rows = gunneryRows(DAMAGE_TABLE, columns);
  const [open, setOpen] = useState<CombatProfile | null>(null);

  return (
    <FloatingWindow name="gunnery" onClose={onClose} {...windowProps} alignment="top" width={1180}>
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
        <div className="shrink-0 border-b border-(color:--ink)/35 px-4 py-[10px]">
          <p className="font-(family-name:--font-display) text-[17px] leading-[1.25] text-[var(--ink)]">
            {fr.gunnery.guarantee}
          </p>
          {/* Le bonus de défense et le contact, repliés au bout de la phrase : ils se lisent une
              fois, la table tous les jours. Le contact est le même pour tous — il se dit ici, et
              jamais sur la fiche d'un rôle, où il passerait pour une de ses qualités. */}
          <div className="mt-[5px] max-w-[74ch] text-[12px] leading-[1.45] text-[var(--ink-soft)]">
            {fr.gunnery.lead}{' '}
            <HelpMark>
              {fr.gunnery.before(GARRISON_DAMAGE_TAKEN, DRY_AMMUNITION_FACTOR)}{' '}
              {fr.gunnery.contactRange(contactKm(theatre))}
            </HelpMark>
          </div>
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
                <th
                  scope="col"
                  className="sticky top-0 z-10 w-[26px] border-b border-[var(--ink)] bg-[var(--paper)]"
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const unfolded = open === row.attacker;
                return (
                  <Fragment key={row.attacker}>
                    <tr
                      onClick={() => setOpen(unfolded ? null : row.attacker)}
                      className={`cursor-pointer border-b border-(color:--ink)/18 ${
                        unfolded ? 'bg-[rgba(255,255,255,.3)]' : ''
                      }`}
                    >
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
                          className="border-l border-(color:--ink)/14 px-[10px] py-[5px] text-[11.5px] text-[var(--ink-soft)] italic"
                        >
                          {fr.gunnery.firesNothing}
                        </td>
                      )}
                      <td className="px-[6px] py-[5px] text-center text-[12px] text-[var(--ink-soft)]">
                        {unfolded ? '▴' : '▾'}
                      </td>
                    </tr>
                    {unfolded && (
                      <tr>
                        <td
                          colSpan={columns.length + 2}
                          className="border-t border-dashed border-(color:--ink)/45 border-b-[var(--ink)] bg-[rgba(255,255,255,.22)] p-0"
                        >
                          <div className="hud-fold">
                            <GunnerySheet
                              profile={row.attacker}
                              workshop={workshop}
                              theatre={theatre}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Les transports ne sont pas des trous de la grille, ils en sont les cibles : le dire
            vaut mieux qu'une colonne muette qui a l'air d'une panne (fiche 08 §9). */}
        <p className="shrink-0 border-t border-(color:--ink)/35 px-4 py-[9px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
          {fr.gunnery.transports(
            TRANSPORT_PROFILES.map((profile) => profileLabel(profile)).join(', '),
          )}
        </p>
      </div>
    </FloatingWindow>
  );
}

type WorkshopView = NonNullable<ReturnType<typeof useQuery<typeof api.troops.workshop>>>;

/**
 * **La fiche du rôle, au pli de sa ligne** (contrat 06 P2). Elle dit le matériel, ce qu'il coûte,
 * ce qu'il vaut et — la raison d'être du déménagement — **ce qu'il faut bâtir pour l'avoir**, en
 * toutes lettres. Un bâtiment absent n'y grise rien : il y a une phrase à sa place, et la fiche
 * se lit identique qu'on possède la caserne ou non.
 *
 * Les deux marques d'un rôle se lisent **côte à côte** : la comparaison est la question qu'on
 * vient poser, et la faire payer un second pli l'aurait tuée.
 */
export function GunnerySheet({
  profile,
  workshop,
  theatre,
}: {
  profile: CombatProfile;
  workshop: WorkshopView | undefined;
  theatre: Theatre | null;
}) {
  const { role, tier, marked } = PROFILE_UNITS[profile];
  const sheet = fr.unitSheets[role];
  const entry = workshop?.grid.find((candidate) => candidate.role === role) ?? null;
  const nation = workshop?.nation ?? null;
  const blitz = workshop?.blitz === true;
  const marks: ReadonlyArray<UnitTier> = marked && !blitz ? [1, 2] : [1];
  const [rangeHover, setRangeHover] = useState<StatHover | null>(null);
  const movement = movementSheetOf([role]);

  return (
    /* La planche et la fiche côte à côte tant qu'il y a de la place ; l'une sous l'autre sous le
       seuil, où 190 px de sprite mangeaient la moitié de la largeur et laissaient la fiche se
       lire en colonne de trois mots (`md` = le seuil de `shell/viewport.ts`). */
    <div className="flex flex-col md:flex-row md:items-stretch">
      <div
        className="flex shrink-0 flex-col items-center justify-center gap-[9px] border-b border-(color:--ink)/22 px-4 py-[14px] md:w-[190px] md:border-r md:border-b-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, color-mix(in srgb, var(--ink) 5%, transparent) 0 1px, transparent 1px 6px)',
        }}
      >
        <UnitSprite nation={nation} role={role} tier={tier} height={104} width={150} />
        {equipmentLabel(nation, role, tier) && (
          <span className="text-center text-[13.5px] leading-[1.2] text-[var(--ink)] italic">
            {equipmentLabel(nation, role, tier)}
          </span>
        )}
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col gap-[11px] px-[18px] py-[14px]">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-(family-name:--font-display) text-[20px] leading-none font-extrabold text-[var(--ink)]">
            {roleLabel(role, 1)}
          </span>
          <span className="eyebrow">{fr.production.domains[DOMAIN_BY_ROLE[role]]}</span>
          <span className="ml-auto flex items-center gap-[6px] font-(family-name:--font-mono) text-[12px] text-[var(--ink)]">
            <StatGlyph stat="range" onHover={setRangeHover} />
            {fr.gunnery.detectionRange(detectionRangeOf([role], theatre))}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-[24px] gap-y-1 font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-soft)]">
          <span>{fr.gunnery.nominalLootCapacity(CARRY_CAPACITY_BY_ROLE[role])}</span>
          {LIFT_CAPACITY[role] !== undefined && (
            <span>{fr.gunnery.liftCapacity(LIFT_CAPACITY[role])}</span>
          )}
          {LIFT_COST[role] !== undefined && <span>{fr.gunnery.liftCost(LIFT_COST[role])}</span>}
          <span>{fr.gunnery.movementRule(movement)}</span>
        </div>

        {rangeHover !== null && (
          <HoverCard left={rangeHover.left} top={rangeHover.top} width={STAT_POPIN_WIDTH}>
            <span className="block text-[9.5px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
              {fr.gunnery.stats.range.name}
            </span>
            <span className="mt-[2px] block leading-[1.4] text-[var(--ink)]">
              {fr.gunnery.stats.range.note}
            </span>
          </HoverCard>
        )}

        {entry !== null && (
          <div className="flex flex-wrap gap-x-[34px] gap-y-3">
            {marks.map((mark, rank) => (
              <Mark
                key={mark}
                mark={mark}
                marked={marked}
                cost={mark === 2 && entry.unitTier2 ? entry.unitTier2 : entry.unit}
                role={role}
                roster={
                  workshop?.roster.find((row) => row.role === role && row.tier === mark)?.count ?? 0
                }
                locked={mark === 2 && !(workshop?.tier2Unlocked ?? false)}
                requiredLevel={workshop?.requiredHqLevel ?? 0}
                first={rank === 0}
                blitz={blitz}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-x-[32px] gap-y-2 border-t border-(color:--ink)/22 pt-[10px]">
          {sheet.kind === 'combat' ? (
            <>
              <span className="flex min-w-0 flex-col gap-[1px]">
                <span className="text-[9.5px] tracking-[.2em] text-[var(--interaction)] uppercase">
                  {fr.production.strongAgainst}
                </span>
                <span className="text-[13.5px] text-[var(--ink)]">
                  {sheet.strongAgainst.join(', ')}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-[1px]">
                <span className="text-[9.5px] tracking-[.2em] text-[var(--critical)] uppercase">
                  {fr.production.weakAgainst}
                </span>
                <span className="text-[13.5px] text-[var(--ink)]">
                  {sheet.weakAgainst.join(', ')}
                </span>
              </span>
            </>
          ) : (
            <span className="flex max-w-[52ch] flex-col gap-[2px]">
              <span className="text-[13.5px] text-[var(--ink)]">{sheet.contribution}</span>
              <span className="text-[12.5px] text-[var(--ink-quiet)] italic">
                {fr.production.supportNote}
              </span>
            </span>
          )}
        </div>

        {/* **La condition, en toutes lettres** (contrat 06) : c'est ce que remplaçaient les
            sections « bloqué » de la fenêtre morte, et c'est la seule marque que l'abaque porte. */}
        {entry !== null && (
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px] border-t border-(color:--ink)/22 pt-[9px]">
            <span aria-hidden className="h-[7px] w-[7px] shrink-0 bg-[var(--ink)]" />
            <span className="text-[13.5px] text-[var(--ink)]">
              {blitz
                ? fr.blitz.formsIn(rolesFormingSites(role).map(aBuilding))
                : fr.production.formsIn(aBuilding(entry.producedBy), entry.unlockedAtSiteLevel)}
            </span>
            {entry.unlockedAtHqLevel > 0 && !blitz && (
              <>
                <span aria-hidden className="h-[14px] w-px bg-(--ink)/40" />
                <span className="text-[13.5px] text-[var(--ink)]">
                  {fr.production.tier2Locked(entry.unlockedAtHqLevel)}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Une marque et ce qu'elle demande : le coût est **le** chiffre, les trois autres lignes le
 *  qualifient. Le zéro de « en service » s'imprime — une fiche sans la ligne se lirait comme un
 *  oubli plutôt que comme une absence.
 *
 *  **Les trois données servies n'ont plus de libellé** (68a) : un pictogramme muet les porte, et
 *  le nom ne revient qu'au survol de ce pictogramme. Trois mots de moins par marque, deux marques
 *  côte à côte : c'est la comparaison qu'on vient poser qui gagne la place. « En service » garde
 *  le sien — c'est un compte de la partie, pas une donnée de la pièce, et lui donner un dessin
 *  l'aurait rangé avec les trois autres. */
function Mark({
  mark,
  marked,
  cost,
  role,
  roster,
  locked,
  requiredLevel,
  first,
  blitz,
}: {
  mark: UnitTier;
  marked: boolean;
  cost: { alloy: number; minutes: number; strength: number };
  role: UnitRole;
  roster: number;
  locked: boolean;
  requiredLevel: number;
  first: boolean;
  blitz: boolean;
}) {
  const [hovered, setHovered] = useState<StatHover | null>(null);

  return (
    <div
      className={`relative flex flex-col gap-[5px] ${
        first ? '' : 'border-l border-(color:--ink)/22 pl-[22px]'
      }`}
    >
      {marked && (
        <span className="font-(family-name:--font-mono) text-[11px] tracking-[.12em] text-[var(--ink-soft)]">
          {tierLabel(mark)}
        </span>
      )}
      {/* La Blitz paie en fonds et forme en une minute (`BLITZ`) : ni lingot, ni durée du barème. */}
      {blitz ? (
        <span className="font-(family-name:--font-display) text-[27px] leading-none font-extrabold text-[var(--ink)]">
          {fr.blitz.price(BLITZ.rolePrice[role])}
        </span>
      ) : (
        <span className="flex items-center gap-[7px]">
          <StatGlyph stat="alloy" onHover={setHovered} />
          <span className="font-(family-name:--font-display) text-[27px] leading-none font-extrabold text-[var(--ink)]">
            {cost.alloy}
          </span>
        </span>
      )}
      <span className="flex items-center gap-[7px]">
        <StatGlyph stat="training" onHover={setHovered} />
        <span className="font-(family-name:--font-mono) text-[12px] text-[var(--ink)]">
          {asDuration(blitz ? BLITZ.recruitMinutes : cost.minutes)}
        </span>
      </span>
      <span className="flex items-center gap-[7px]">
        <StatGlyph stat="strength" onHover={setHovered} />
        <span className="text-[13.5px] font-semibold text-[var(--ink)]">
          {cost.strength} {fr.strengthUnits[role]}
        </span>
      </span>
      <span className="flex items-baseline gap-2 border-t border-(color:--ink)/22 pt-[5px]">
        <span className="text-[9.5px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
          {fr.production.inService}
        </span>
        <span
          className="font-(family-name:--font-mono) text-[12.5px]"
          style={{ color: roster > 0 ? 'var(--ink)' : 'var(--ink-note)' }}
        >
          {roster}
        </span>
      </span>
      {locked && (
        <span className="max-w-[24ch] text-[11.5px] leading-[1.35] text-[var(--ink-soft)]">
          {fr.production.tier2Locked(requiredLevel)}
        </span>
      )}
      {hovered !== null && (
        <HoverCard left={hovered.left} top={hovered.top} width={STAT_POPIN_WIDTH}>
          <span className="block text-[9.5px] tracking-[.2em] text-[var(--ink-soft)] uppercase">
            {fr.gunnery.stats[hovered.stat].name}
          </span>
          <span className="mt-[2px] block leading-[1.4] text-[var(--ink)]">
            {fr.gunnery.stats[hovered.stat].note}
          </span>
        </HoverCard>
      )}
    </div>
  );
}

type SheetStat = keyof typeof fr.gunnery.stats;

type StatHover = {
  readonly stat: SheetStat;
  readonly left: number;
  readonly top: number;
};

/** Une largeur, parce qu'une popin qui explique n'est pas une popin qui chiffre : celle du
 *  bandeau des ressources tient sur une ligne, celles-ci portent une phrase et doivent la
 *  replier. Trois lignes pour la plus longue des trois, sans déborder de la fiche. */
const STAT_POPIN_WIDTH = 232;

const STAT_DRAWING: Readonly<Record<SheetStat, typeof IngotGlyph>> = {
  alloy: IngotGlyph,
  training: ClockGlyph,
  strength: HeartGlyph,
  range: EyeGlyph,
};

/**
 * Le dessin **est** le libellé : il porte le nom de la donnée pour le lecteur d'écran, et
 * l'ouvre en clair pour la souris. La popin s'ancre sur lui et se ferme dès qu'on le quitte —
 * survoler le chiffre à côté n'ouvre rien, c'est la valeur, elle ne s'explique pas elle-même.
 */
function StatGlyph({
  stat,
  onHover,
}: {
  stat: SheetStat;
  onHover: (hover: StatHover | null) => void;
}) {
  const Drawing = STAT_DRAWING[stat];
  const anchor = (event: MouseEvent<HTMLElement>) => {
    const glyph = event.currentTarget;
    onHover({ stat, left: glyph.offsetLeft, top: glyph.offsetTop + glyph.offsetHeight + 4 });
  };

  return (
    <span
      onMouseEnter={anchor}
      onMouseLeave={() => onHover(null)}
      className="flex shrink-0 cursor-help text-[var(--ink)]"
    >
      <Drawing label={fr.gunnery.stats[stat].name} />
    </span>
  );
}

/**
 * **L'encre dit la bande avant que le chiffre ne soit lu.** Une densité, jamais un vert et un
 * rouge : la même case est une bonne nouvelle pour qui tire et une mauvaise pour qui encaisse,
 * et une couleur de verdict trancherait à la place du joueur.
 */
const BAND_STYLE: Readonly<Record<Band, { background: string; color: string }>> = {
  strong: { background: 'color-mix(in srgb, var(--ink) 78%, transparent)', color: 'var(--paper)' },
  even: { background: 'color-mix(in srgb, var(--ink) 22%, transparent)', color: 'var(--ink)' },
  weak: { background: 'transparent', color: 'var(--ink-quiet)' },
};

function Cell({ attacker, shot }: { attacker: CombatProfile; shot: GunneryShot }) {
  const target = profileLabel(shot.defender);
  const from = profileLabel(attacker);

  if (shot.reach === 'none') {
    return (
      <td
        title={fr.gunnery.noShot(from, target)}
        className="border-l border-(color:--ink)/14 px-[6px] py-[5px] text-center font-(family-name:--font-mono) text-[11px] text-[var(--ink-note)]"
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
      className="border-l border-(color:--ink)/14 px-[6px] py-[5px] text-center font-(family-name:--font-mono) text-[11px]"
    >
      {printed}
    </td>
  );
}

/** La clé de lecture, une fois, au-dessus de la grille — sinon les trois encres se devinent. */
function Legend() {
  const bands: ReadonlyArray<Band> = ['strong', 'even', 'weak'];
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-[14px] gap-y-1 border-b border-(color:--ink)/35 px-4 py-[7px]">
      <span className="eyebrow">{fr.gunnery.reading}</span>
      {bands.map((band) => (
        <span key={band} className="flex items-center gap-[6px]">
          <span
            aria-hidden
            className="inline-block h-[12px] w-[18px] border border-(color:--ink)/35"
            style={{ background: BAND_STYLE[band].background }}
          />
          <span className="text-[11.5px] text-[var(--ink-soft)]">{fr.gunnery.bands[band]}</span>
        </span>
      ))}
      <span className="flex items-center gap-[6px]">
        <span
          aria-hidden
          className="inline-block w-[18px] text-center font-(family-name:--font-mono) text-[11px] text-[var(--ink-note)]"
        >
          {fr.gunnery.outOfReach}
        </span>
        <span className="text-[11.5px] text-[var(--ink-soft)]">{fr.gunnery.bands.none}</span>
      </span>
      <span className="flex-1" />
      <span className="eyebrow">{fr.gunnery.foldHint}</span>
    </div>
  );
}
