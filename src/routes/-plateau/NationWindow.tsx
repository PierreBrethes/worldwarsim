import { useMemo, type ReactNode } from 'react';
import { fr, nationLabel, roleLabel, stackLabel } from '@/i18n/fr';
import { asDayAndTime, asDuration, asLocalTime } from '@/domain/duration';
import { DEPOSITS, type BuildingKey } from '@/domain/ids';
import { MAX_HQ_LEVEL } from '../../../convex/constants';
import { ADM0_BY_NATION, isNation } from '@/domain/nations';
import { DEPOSIT_POINTS } from '@/domain/world';
import type {
  FounderAbsence,
  PlayerView,
  PressEdition,
  PressOwnLine,
  TroopStation,
} from '@/domain/player-view';
import { marchingTroopIds, stationGroups, type StationGroup } from '@/domain/troops';
import { stationNames } from '@/domain/station-name';
import { Flag } from '@/emblems/Flag';
import { UnitSprite } from '@/emblems/UnitSprite';
import { FloatingWindow, type WindowProps, WindowHead } from './Window';
import { HelpMark } from './HelpMark';

/**
 * **The strategic identity sheet.** The census of the buildings left it once for the Economy
 * window, then came back when the personal board became a band at the foot of the table (#122):
 * a list of what stands is read here, not under the hand that builds.
 *
 * **It commands nothing.** The one handler it carries points the camera: the complete list of
 * troops landed here when the troops widget died (décision Pierre, 30/08) — the sheet already
 * said what the army weighs, it was missing where it stands — and a line that recentres the map
 * designates, it does not act. The file still imports no mutation, which is what holds the rule.
 * Occupation and revanchism (design sheet 11 §4.5) will land here for the same reason — they are
 * states, not verbs.
 */
export function NationWindow({
  view,
  onClose,
  onLocate,
  ...windowProps
}: WindowProps & {
  view: PlayerView;
  /** Where the camera is sent when a line is clicked — the sheet names an address, the board
   *  is what goes there. */
  onLocate: (station: TroopStation) => void;
}) {
  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const standing = useMemo(() => stationGroups(view.me, marching), [view.me, marching]);
  const names = useMemo(() => stationNames(view), [view]);

  return (
    <FloatingWindow name="nation" onClose={onClose} {...windowProps} alignment="top" width={420}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <WindowHead
          lead={<Flag nation={view.me.nation} width={26} onPaper />}
          eyebrow={fr.nationSheet.kicker}
          title={nationLabel(view.me.nation)}
          heading="h1"
          onClose={onClose}
        >
          <HelpMark>{fr.nationSheet.readOnly}</HelpMark>
        </WindowHead>

        <div className="flex min-h-0 flex-1 flex-col overflow-auto overscroll-contain">
          <Entry header={fr.nationSheet.powerHeader}>
            <p className="text-[13px] leading-[1.5] text-[var(--ink)]">{view.me.power}</p>
          </Entry>

          {view.mode !== 'blitz' && <NationalGap view={view} />}

          <FounderLine absence={view.me.founderAbsence} />

          <Registers press={view.press} />

          <Entry header={fr.nationSheet.armyHeader}>
            <div className="flex flex-col gap-[5px] text-[12.5px]">
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">{fr.nationSheet.present}</span>
                <span className="text-right text-[var(--ink)]">
                  {stackLabel(view.me.armyPresent)}
                </span>
              </span>
              <span className="flex justify-between gap-3">
                <span className="text-[var(--ink-soft)]">{fr.nationSheet.inTransit}</span>
                <span className="text-right text-[var(--ink)]">
                  {stackLabel(view.me.armyInTransit)}
                </span>
              </span>
            </div>
          </Entry>

          <Entry header={fr.nationSheet.standingHeader}>
            {standing.length === 0 ? (
              <p className="text-[12.5px] text-[var(--ink-soft)]">{fr.nationSheet.standingNone}</p>
            ) : (
              <div className="flex flex-col">
                {standing.map((group) => (
                  <StandingRow
                    key={group.key}
                    group={group}
                    nation={view.me.nation}
                    station={names.full(group.station)}
                    onLocate={() => onLocate(group.station)}
                  />
                ))}
              </div>
            )}
          </Entry>

          {view.mode !== 'blitz' && <Census view={view} />}

          {view.mode !== 'blitz' && (
            <Entry header={fr.nationSheet.restHeader}>
              <div className="flex items-center gap-2 font-(family-name:--font-mono) text-[14px] text-[var(--ink)]">
                {view.me.restWindow}
                <HelpMark>
                  {fr.nationSheet.restNote} {fr.nationSheet.restFrozen}
                </HelpMark>
              </div>
            </Entry>
          )}
        </div>
      </div>
    </FloatingWindow>
  );
}

/** One address of the army. Grouped by role, like the widget's cards were: the ceiling is 24
 *  troops and "Fantassins · 6" is what one looks for, never six identical rows. */
function StandingRow({
  group,
  nation,
  station,
  onLocate,
}: {
  group: StationGroup;
  nation: string;
  station: string;
  onLocate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onLocate}
      title={fr.nationSheet.locate(station)}
      className="flex cursor-pointer items-center gap-[9px] border-b border-(color:--ink)/18 py-[6px] text-left last:border-b-0 hover:bg-(--ink)/7"
    >
      <UnitSprite nation={nation} role={group.role} height={22} width={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold text-[var(--ink)]">
          {roleLabel(group.role, group.count)} · {group.count}
        </span>
        <span className="block truncate font-(family-name:--font-mono) text-[10.5px] text-[var(--ink-soft)]">
          {station} · {fr.troops.strength(group.strength, group.nominalStrength)}
        </span>
      </span>
      <span className="shrink-0 text-[12px] text-[var(--interaction)]">›</span>
    </button>
  );
}

/**
 * **« Nos registres » — les cinq chiffres du classement, et le seul endroit où ils existent en
 * clair** (`propositions/classement-bareme.md` §4). Les autres joueurs n'ont que le général : la
 * fiche de nation est chez soi, et c'est chez soi que le détail se lit.
 *
 * **Ce sont les chiffres du dernier relevé, pas ceux de l'instant** — la date le dit, et le delta
 * la double : sans elle, un joueur qui vient de poser une mine lirait un chiffre inchangé
 * comme un bug. Rien ici n'est recalculé, exactement comme à la page de presse.
 *
 * Absente tant qu'aucune édition n'a paru : vide, la section n'existe pas (même règle que
 * « à faire maintenant » et que la ligne du fondateur au-dessus).
 */
function Registers({ press }: { press: PressEdition | null }) {
  const own = press?.mine ?? null;
  if (press === null || own === null) return null;
  const said = fr.press.registers;
  const lines: ReadonlyArray<{ label: string; value: string; delta: string }> = [
    line(said.territory, fr.press.percent(own.territory), own, (delta) => delta.territory, 1),
    line(said.industry, fr.press.score(own.industry), own, (delta) => delta.industry),
    line(said.military, fr.press.score(own.military), own, (delta) => delta.military),
    line(said.deeds, fr.press.score(own.deeds), own, (delta) => delta.deeds),
    line(said.general, fr.press.score(own.general), own, (delta) => delta.general),
  ];
  return (
    <Entry header={said.title}>
      <p className="mb-[6px] text-[10px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
        {fr.press.capturedAt(asLocalTime(press.at))}
      </p>
      <div className="flex flex-col gap-[5px] text-[12.5px]">
        {lines.map((entry) => (
          <span key={entry.label} className="flex items-baseline justify-between gap-3">
            <span className="text-[var(--ink-soft)]">{entry.label}</span>
            <span className="flex items-baseline gap-[9px]">
              <span className="text-[var(--ink)]">{entry.value}</span>
              <span className="w-[42px] text-right font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
                {entry.delta}
              </span>
            </span>
          </span>
        ))}
      </div>
      <p className="mt-[6px] text-[11px] leading-[1.45] text-[var(--ink-soft)]">
        {own.since === null ? said.noPrevious : said.since(asLocalTime(own.since))}
      </p>
    </Entry>
  );
}

const line = (
  label: string,
  value: string,
  own: PressOwnLine,
  of: (delta: NonNullable<PressOwnLine['delta']>) => number,
  decimals = 0,
) => ({ label, value, delta: own.delta === null ? '' : fr.press.delta(of(own.delta), decimals) });

/**
 * **Le fondateur ne revient plus, et la partie reste clôturable.** Une ligne qui n'existe qu'à
 * l'approche du seuil : le reste du temps `founderAbsence` est nul et la section n'est pas
 * repliée, elle n'est pas là (même règle que « à faire maintenant » — vide, la carte n'existe
 * pas). Elle ne dit ni qui est le doyen, ni aucune heure de connexion : la règle est publique,
 * la présence des autres ne l'est pas (ADR 0005).
 */
function FounderLine({ absence }: { absence: FounderAbsence }) {
  if (absence === null) return null;
  const since = asDuration(absence.hours * 60);
  return (
    <Entry header={fr.nationSheet.founderHeader}>
      <p className="text-[12.5px] leading-[1.5] text-[var(--ink)]">
        {absence.concludeOpensAt <= Date.now()
          ? fr.nationSheet.founderAbsentOpen(since)
          : fr.nationSheet.founderAbsent(since, asDayAndTime(absence.concludeOpensAt))}
      </p>
    </Entry>
  );
}

/**
 * **Le recensement** : le QG et ce qu'il porte, puis chaque bâtiment debout — sa région, son
 * niveau et ce qu'il fait, l'écoute avec sa note, l'usine débordée quand son bac est plein. Il a
 * quitté le pied du plateau personnel quand celui-ci est devenu une bande (#122).
 */
function Census({ view }: { view: PlayerView }) {
  const hq = view.me.buildings.find((building) => building.key === 'hq') ?? null;
  const others = view.me.buildings.filter((building) => building.key !== 'hq');
  const region = (regionId: string) =>
    view.me.regions.find((candidate) => candidate.id === regionId)?.name ?? regionId;
  const chain = (key: BuildingKey) => view.me.chains.find((candidate) => candidate.by === key);
  return (
    <Entry header={fr.nationSheet.censusHeader}>
      {hq === null ? (
        <p className="text-[12.5px] leading-[1.4] text-[var(--critical)]">
          {fr.nationSheet.hqMissing}
        </p>
      ) : (
        <p className="text-[12.5px] leading-[1.4]">
          <span className="font-semibold">{fr.buildings.hq}</span>{' '}
          <span className="text-[var(--ink-soft)]">
            {fr.nationSheet.hqLine(
              view.me.hqLevel,
              MAX_HQ_LEVEL,
              view.me.slots.total,
              view.me.buildLanes,
            )}
          </span>
        </p>
      )}
      {others.map((building) => (
        <p key={building.id} className="mt-[3px] text-[12px] leading-[1.35]">
          <span className="font-semibold">{fr.buildings[building.key]}</span>{' '}
          <span className="font-(family-name:--font-mono) text-[11px]">
            {fr.common.levelShort(building.level)}
          </span>{' '}
          <span className="text-[var(--ink-soft)]">· {region(building.regionId)} · </span>
          {building.key === 'listening' ? (
            view.me.upkeep.listeningSilent ? (
              <span className="text-[var(--critical)]">{fr.economy.listeningSilent}</span>
            ) : (
              <span className="text-[var(--ink-soft)]">
                {fr.nationSheet.listeningUnfigured}{' '}
                <HelpMark>{fr.nationSheet.listeningTemporary}</HelpMark>
              </span>
            )
          ) : (
            <span className="text-[var(--ink-soft)]">{fr.buildingEffects[building.key]}</span>
          )}
          {chain(building.key)?.state === 'overflowing' && (
            <span className="text-[var(--notable-paper)]"> · {fr.nationSheet.overflowing}</span>
          )}
        </p>
      ))}
    </Entry>
  );
}

function Entry({ header, children }: { header: string; children: ReactNode }) {
  return (
    <section className="border-b border-(color:--ink)/22 px-4 py-[11px]">
      <h2 className="eyebrow mb-[3px]">{header}</h2>
      {children}
    </section>
  );
}

/**
 * The resource the nation holds no deposit of — beside the power, because it is its
 * counterpart: the ADR 0015 gap is what forces a nation out of its own ground, and the power
 * is what it goes out with. Two nations have none, and one has two: the sentence counts.
 *
 * **Derived, never tabulated.** The deposits held are the points on the national soil and the
 * ones the player's exploitations work abroad (ADR 0029); the gap is the rest of `DEPOSITS`. A hard-coded table would go on saying
 * "pétrole" the day `generate-deposits.mjs` hands France an oil field — and it would go on
 * saying it after an outpost has won one abroad, which is the same lie in the other
 * direction.
 */
function NationalGap({ view }: { view: PlayerView }) {
  const home = isNation(view.me.nation) ? ADM0_BY_NATION[view.me.nation] : null;
  const held = new Set([
    ...DEPOSIT_POINTS.filter((point) => point.country === home).map((point) => point.deposit),
    ...view.me.extraction.flatMap((site) => (site.deposit === null ? [] : [site.deposit])),
  ]);
  const missing = DEPOSITS.filter((deposit) => !held.has(deposit));

  return (
    <Entry header={fr.nationSheet.gapHeader}>
      <p
        className="text-[13px] leading-[1.5]"
        style={{ color: missing.length === 0 ? 'var(--ink-soft)' : 'var(--ink)' }}
      >
        {missing.length === 0
          ? fr.nationSheet.gapNone
          : fr.nationSheet.gap(missing.map((deposit) => fr.deposits[deposit]))}
      </p>
    </Entry>
  );
}
