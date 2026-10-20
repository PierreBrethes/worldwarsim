import { useQuery } from 'convex/react';
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import {
  contactKm,
  DAMAGE_TABLE,
  GARRISON_DAMAGE_TAKEN,
  UPKEEP_STEPS,
  UPKEEP_UNSUPPLIED_MULTIPLIER,
} from '../../../convex/constants';
import {
  aBuilding,
  fr,
  profileAbbreviation,
  profileLabel,
  researchRequired,
  roleLabel,
} from '@/i18n/fr';
import {
  COMBAT_PROFILES,
  profileOf,
  TRANSPORT_PROFILES,
  type CombatProfile,
} from '@/domain/combat';
import { gunneryRows, PROFILE_UNITS, type Band, type GunneryShot } from '@/domain/gunnery';
import {
  columnsOf,
  pieceRows,
  rankedBy,
  shareOfReading,
  troopStats,
  type PieceRow,
  type TroopStatKey,
} from '@/domain/stat-sheet';
import { DOMAIN_BY_ROLE, tierLabel } from '@/domain/troops';
import { pieceAt } from '@/domain/research';
import { UnitSprite } from '@/emblems/UnitSprite';
import { equipmentLabel } from '@/emblems/units/equipment';
import { StatGlyph, StatLines, statValue } from '@/shell/StatLines';
import { durationToken, easeOutToken, motionNow } from '@/shell/paper-motion';
import { useNarrowScreen } from '@/shell/viewport';
import { FloatingWindow, type WindowProps, WindowHead } from './Window';
import { HelpMark } from './HelpMark';
import type { Seat } from '@/data/session';
import { rolesFormingSites } from '@/domain/blitz';
import type { Theatre } from '@/domain/theatres';

/**
 * **L'abaque : le classement de toutes les pièces, puis « qui bat qui »** (ADR 0018 §4, #191).
 * Le classement range chaque statistique en mini-barres sur l'échelle du jeu — un titre de colonne
 * le trie, le meilleur en haut — et la grille de tir, inchangée, répond à la question qui reste.
 * Une ligne se plie pour la fiche de la pièce et ce qu'il faut bâtir pour l'avoir (contrat 06).
 *
 * **`DAMAGE_TABLE` est importée, jamais recopiée.** C'est la leçon de `verif-chiffrage.mjs`, qui
 * validait le chiffrage sur une copie : deux tables finissent par diverger, et le jour où elles
 * divergent l'écran ment sur des chiffres que le jeu ne joue plus. Les statistiques suivent la même
 * règle (`stat-sheet.ts`) : le catalogue se lit sans rien posséder.
 *
 * **Aucune action, aucun stock.** On ne forme pas depuis l'abaque.
 */
export function GunneryWindow({
  seat,
  theatre,
  onClose,
  ...windowProps
}: WindowProps & { seat: Seat; theatre: Theatre | null }) {
  const workshop = useQuery(api.troops.workshop, seat);
  const rows = gunneryRows(DAMAGE_TABLE);
  const pieces = useMemo(() => pieceRows(theatre), [theatre]);
  const columns = columnsOf(pieces);
  const [sort, setSort] = useState<TroopStatKey>('pace');
  const ranked = rankedBy(pieces, sort);
  const [open, setOpen] = useState<CombatProfile | null>(null);
  const { scroller, unfold } = useUnfoldInPlace(open, setOpen);
  const narrow = useNarrowScreen();
  const fold = (profile: CombatProfile) => unfold(open === profile ? null : profile, profile);

  /* Ce que la table garantit, imprimé : c'est le garde-fou du projet (fiche 08 §9), et c'est la
     première chose qu'un joueur venu chercher l'arme absolue doit lire. Au téléphone il défile avec
     la liste : fixe, il laissait cinq lignes à l'écran. */
  const guarantee = (
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
          {fr.gunnery.before(GARRISON_DAMAGE_TAKEN, workshop?.blitz === true)}{' '}
          {fr.gunnery.contactRange(contactKm(theatre))}
        </HelpMark>
      </div>
    </div>
  );
  const transports = (
    <p className="border-t border-(color:--ink)/35 px-4 py-[9px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
      {fr.gunnery.transports(TRANSPORT_PROFILES.map((profile) => profileLabel(profile)).join(', '))}
    </p>
  );

  return (
    <FloatingWindow name="gunnery" onClose={onClose} {...windowProps} alignment="top" width={1180}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <WindowHead title={fr.gunnery.header} onClose={onClose} />

        {!narrow && guarantee}

        <div ref={scroller} className="min-h-0 flex-1 overflow-auto overscroll-contain">
          {narrow && guarantee}
          <h3 className="px-4 pt-3 pb-1 font-(family-name:--font-display) text-[19px] leading-none font-bold">
            {fr.gunnery.pieces}
          </h3>
          <p className="px-4 pb-2 text-[12px] leading-[1.4] text-[var(--ink-soft)]">
            {narrow ? fr.gunnery.rankingLeadPhone : fr.gunnery.rankingLead}
          </p>

          {narrow ? (
            <RankingList
              columns={columns}
              sort={sort}
              onSort={setSort}
              ranked={ranked}
              open={open}
              onFold={fold}
              workshop={workshop}
              theatre={theatre}
            />
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 left-0 z-20 border-b border-[var(--ink)] bg-[var(--paper)] px-2 py-[6px] text-left text-[9px] tracking-[.14em] text-[var(--ink-soft)] uppercase"
                  >
                    {fr.gunnery.piece}
                  </th>
                  {columns.map((key) => (
                    <th
                      key={key}
                      scope="col"
                      aria-sort={sort === key ? 'descending' : 'none'}
                      className={`sticky top-0 z-10 border-b border-[var(--ink)] p-0 text-left ${
                        key === 'training' ? NARROW_HIDDEN : ''
                      } ${sort === key ? 'bg-[var(--paper-pile)]' : 'bg-[var(--paper)]'}`}
                    >
                      <button
                        type="button"
                        onClick={() => setSort(key)}
                        className={`flex w-full cursor-pointer items-center gap-[3px] px-[4px] py-[6px] text-[9px] tracking-[.14em] whitespace-nowrap uppercase ${
                          sort === key
                            ? 'font-bold text-[var(--ink)] shadow-[inset_0_-3px_0_var(--ink)]'
                            : 'font-semibold text-[var(--ink-soft)]'
                        }`}
                      >
                        <StatGlyph stat={key} size={13} />
                        {fr.stats.names[key]}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((piece) => {
                  const profile = profileOf(piece.role, piece.tier);
                  const unfolded = open === profile;
                  return (
                    <Fragment key={profile}>
                      <tr
                        data-row={profile}
                        onClick={() => fold(profile)}
                        className={`cursor-pointer border-b border-(color:--ink)/18 ${
                          unfolded ? 'bg-[rgba(255,255,255,.3)]' : ''
                        }`}
                      >
                        <th
                          scope="row"
                          className="sticky left-0 z-[1] bg-[var(--paper)] px-2 py-[5px] text-left text-[13px] font-normal whitespace-nowrap text-[var(--ink)]"
                        >
                          {profileLabel(profile)}
                          <span className="ml-[4px] text-[9px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
                            {fr.production.domains[DOMAIN_BY_ROLE[piece.role]]}
                          </span>
                        </th>
                        {columns.map((key) => (
                          <RankCell key={key} stat={key} piece={piece} sorted={sort === key} />
                        ))}
                      </tr>
                      {unfolded && (
                        <tr>
                          <td
                            colSpan={columns.length + 1}
                            className="border-t border-dashed border-(color:--ink)/45 border-b-[var(--ink)] bg-[rgba(255,255,255,.22)] p-0"
                          >
                            <div className="hud-fold paper-unfold flush">
                              <GunnerySheet
                                profile={profile}
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
          )}
          {theatre === null && (
            <p className="px-4 py-[8px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)]">
              {fr.gunnery.upkeepNote(
                UPKEEP_STEPS.map(({ rate, upTo }) => ({
                  rate,
                  upTo: Number.isFinite(upTo) ? upTo : null,
                })),
                UPKEEP_UNSUPPLIED_MULTIPLIER,
              )}
            </p>
          )}

          <h3 className="px-4 pt-4 pb-1 font-(family-name:--font-display) text-[19px] leading-none font-bold">
            {fr.gunnery.whoBeatsWho}
            <small className="ml-2 font-(family-name:--font-text) text-[13px] font-medium text-[var(--ink-soft)] italic">
              {fr.gunnery.whoBeatsWhoNote}
            </small>
          </h3>
          <Legend />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 left-0 z-20 border-b border-[var(--ink)] bg-[var(--paper)] px-3 py-[6px] text-left text-[9px] tracking-[.18em] text-[var(--ink-soft)] uppercase"
                  >
                    {fr.gunnery.piece}
                  </th>
                  {COMBAT_PROFILES.map((defender) => (
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
                  <tr key={row.attacker} className="border-b border-(color:--ink)/18">
                    <th
                      scope="row"
                      className="sticky left-0 z-[1] bg-[var(--paper)] px-3 py-[5px] text-left text-[12px] font-normal whitespace-nowrap text-[var(--ink)]"
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
                        colSpan={COMBAT_PROFILES.length}
                        className="border-l border-(color:--ink)/14 px-[10px] py-[5px] text-[11.5px] text-[var(--ink-soft)] italic"
                      >
                        {fr.gunnery.firesNothing}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {narrow && transports}
        </div>

        {!narrow && <div className="shrink-0">{transports}</div>}
      </div>
    </FloatingWindow>
  );
}

/** Sous 1440 px la table ne tient plus dans la fenêtre : la formation, qui se lit aussi sur la
 *  fiche dépliée, cède sa colonne. */
const NARROW_HIDDEN = 'max-[1439px]:hidden';

/** Une case du classement : la valeur, et sous elle une barre sur l'échelle du jeu. Un mot (« au
 *  contact », « ne tire pas ») n'a pas d'échelle, donc pas de barre. */
function RankCell({
  stat,
  piece,
  sorted,
}: {
  stat: TroopStatKey;
  piece: PieceRow;
  sorted: boolean;
}) {
  const reading = piece.readings[stat];
  const share = shareOfReading(reading);
  return (
    <td
      data-stat={stat}
      className={`${stat === 'training' ? NARROW_HIDDEN : ''} min-w-[54px] px-[4px] py-[4px] align-bottom ${sorted ? 'bg-(--ink)/6' : ''}`}
    >
      {reading === undefined ? (
        <span className="block font-(family-name:--font-mono) text-[11.5px] text-[var(--ink-note)]">
          {fr.gunnery.outOfReach}
        </span>
      ) : (
        <>
          <span
            className={`mb-[3px] block font-(family-name:--font-mono) text-[11.5px] leading-none whitespace-nowrap ${
              sorted ? 'font-semibold' : ''
            } ${share === null ? 'text-[var(--ink-note)]' : ''}`}
          >
            {statValue(stat, reading, true)}
          </span>
          <span className="block h-[5px] bg-(--ink)/10">
            {share !== null && (
              <i
                className={`block h-full ${sorted ? 'bg-[var(--ink)]' : 'bg-(--ink)/70'}`}
                style={{ width: `${Math.max(4, share * 100)}%` }}
              />
            )}
          </span>
        </>
      )}
    </td>
  );
}

/**
 * **Au téléphone, une statistique à la fois** : un menu choisit laquelle, et les pièces s'alignent
 * en barres classées, la meilleure en haut. Treize colonnes ne tiennent pas dans 390 px ; une seule
 * statistique, lue sur toutes les pièces, est la lecture que le doigt vient chercher.
 */
function RankingList({
  columns,
  sort,
  onSort,
  ranked,
  open,
  onFold,
  workshop,
  theatre,
}: {
  columns: ReadonlyArray<TroopStatKey>;
  sort: TroopStatKey;
  onSort: (key: TroopStatKey) => void;
  ranked: ReadonlyArray<PieceRow>;
  open: CombatProfile | null;
  onFold: (profile: CombatProfile) => void;
  workshop: WorkshopView | undefined;
  theatre: Theatre | null;
}) {
  return (
    <div className="grid gap-[4px] px-3 pb-3">
      <select
        value={sort}
        onChange={(event) => onSort(event.target.value as TroopStatKey)}
        aria-label={fr.gunnery.sortMenu}
        className="mb-[6px] min-h-[44px] border border-[var(--ink)] bg-[var(--paper-pile)] px-2 text-[13px] font-semibold text-[var(--ink)]"
      >
        {columns.map((key) => (
          <option key={key} value={key}>
            {fr.gunnery.sortBy(fr.stats.names[key])}
          </option>
        ))}
      </select>
      {ranked.map((piece) => {
        const profile = profileOf(piece.role, piece.tier);
        const reading = piece.readings[sort];
        const share = shareOfReading(reading);
        return (
          <Fragment key={profile}>
            <button
              type="button"
              data-row={profile}
              onClick={() => onFold(profile)}
              aria-expanded={open === profile}
              className="grid min-h-[36px] cursor-pointer grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-[6px] text-left text-[12.5px]"
            >
              <span>{profileLabel(profile)}</span>
              <span className="block h-[12px] bg-(--ink)/10">
                {share !== null && (
                  <i
                    className="block h-full bg-[var(--ink)]"
                    style={{ width: `${Math.max(3, share * 100)}%` }}
                  />
                )}
              </span>
              <span
                className={`font-(family-name:--font-mono) text-[12px] whitespace-nowrap ${
                  share === null ? 'text-[var(--ink-note)]' : 'font-semibold'
                }`}
              >
                {reading === undefined ? fr.gunnery.outOfReach : statValue(sort, reading, true)}
              </span>
            </button>
            {open === profile && (
              <div className="border-y border-(color:--ink)/35 bg-[rgba(255,255,255,.22)]">
                <GunnerySheet profile={profile} workshop={workshop} theatre={theatre} />
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * **La fiche se déplie depuis sa ligne, et la grille suit sans sauter** (#161). La ligne touchée
 * reste sous le doigt : le défileur compense ce que la fiche d'avant rendait en hauteur au-dessus
 * d'elle, quel que soit le réglage. Les lignes que le pli déplace partent ensuite de leur ancienne
 * place (FLIP, `transform` seul, au pas et à la courbe du déroulé de la fiche, `.paper-unfold`) ;
 * réduites ou coupées, elles sont tout de suite à la nouvelle.
 */
function useUnfoldInPlace(
  open: CombatProfile | null,
  setOpen: (next: CombatProfile | null) => void,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const before = useRef<{ touched: string; tops: Map<string, number> } | null>(null);

  const unfold = (next: CombatProfile | null, touched: CombatProfile) => {
    if (scroller.current) before.current = { touched, tops: seen(scroller.current) };
    setOpen(next);
  };

  useLayoutEffect(() => {
    const box = scroller.current;
    const last = before.current;
    before.current = null;
    if (!box || !last) return;
    const drift = seen(box).get(last.touched)! - last.tops.get(last.touched)!;
    box.scrollTop += drift;
    if (motionNow() !== 'full') return;
    const timing = { duration: durationToken('--dur-base'), easing: easeOutToken() };
    const now = seen(box);
    // La fiche neuve n'a pas d'ancienne place : elle part avec la ligne qui la porte.
    let carried = 0;
    for (const row of box.querySelectorAll<HTMLElement>('tbody > tr')) {
      const key = row.dataset.row;
      if (key !== undefined) carried = last.tops.get(key)! - now.get(key)!;
      if (carried !== 0)
        row.animate([{ transform: `translateY(${carried}px)` }, { transform: 'none' }], timing);
    }
  }, [open]);

  return { scroller, unfold };
}

/** Où chaque ligne se lit dans le défileur, à l'écran et non dans le tableau. */
const seen = (box: HTMLElement) =>
  new Map(
    [...box.querySelectorAll<HTMLElement>('[data-row]')].map((row) => [
      row.dataset.row!,
      row.offsetTop - box.scrollTop,
    ]),
  );

type WorkshopView = NonNullable<ReturnType<typeof useQuery<typeof api.troops.workshop>>>;

/**
 * **La fiche du rôle, au pli de sa ligne** (contrat 06 P2, #191). Le bloc de statistiques dit tout
 * ce que la pièce vaut, et la fiche garde ce que le bloc ne dit pas — **ce qu'il faut bâtir pour
 * l'avoir**, en toutes lettres : un bâtiment absent n'y grise rien, la fiche se lit identique
 * qu'on possède la caserne ou non. Les deux marques d'un rôle sont deux lignes du classement.
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
  const roster = workshop?.roster.find((row) => row.role === role && row.tier === tier)?.count ?? 0;
  const lockedBy = entry === null ? null : pieceAt(entry, tier).lockedBy;

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
            {marked && !blitz ? ` ${tierLabel(tier)}` : ''}
          </span>
          <span className="eyebrow">{fr.production.domains[DOMAIN_BY_ROLE[role]]}</span>
        </div>

        <div className="max-w-[460px]">
          <StatLines rows={troopStats(role, tier, theatre)} />
        </div>

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
            sections « bloqué » de la fenêtre morte, et c'est la seule marque que l'abaque porte.
            Le zéro de « en service » s'imprime : une fiche sans la ligne se lirait comme un oubli. */}
        {entry !== null && (
          <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px] border-t border-(color:--ink)/22 pt-[9px]">
            <span aria-hidden className="h-[7px] w-[7px] shrink-0 bg-[var(--ink)]" />
            <span className="text-[13.5px] text-[var(--ink)]">
              {blitz
                ? fr.blitz.formsIn(rolesFormingSites(role).map(aBuilding))
                : fr.production.formsIn(aBuilding(entry.producedBy))}
            </span>
            {lockedBy !== null && !blitz && (
              <>
                <span aria-hidden className="h-[14px] w-px bg-(--ink)/40" />
                <span className="text-[13.5px] text-[var(--ink)]">
                  {researchRequired(lockedBy)}
                </span>
              </>
            )}
            <span className="ml-auto flex items-baseline gap-2">
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
          </div>
        )}
      </div>
    </div>
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
    </div>
  );
}
