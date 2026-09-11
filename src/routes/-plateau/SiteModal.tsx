import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { aBuilding, fr, roleLabel } from '@/i18n/fr';
import { useClock } from '@/shell/clock';
import { Stamp } from '@/shell/Stamp';
import { handleError } from '@/data/errors';
import { ResourceIcon, resourceColor, type ResourceKey } from '@/emblems/ResourceIcon';
import { BuildingPlate } from '@/emblems/Plate';
import { UnitSprite } from '@/emblems/UnitSprite';
import { equipmentLabel } from '@/emblems/units/equipment';
import type { UnitTier } from '@/domain/troops';
import {
  DOMAIN_BY_ROLE,
  marchingTroopIds,
  stationKeyOf,
  tierLabel,
  troopsAt,
} from '@/domain/troops';
import type { PlayerView, TroopStation, UnitRole } from '@/domain/player-view';
import { currentMinutes } from '@/domain/player-view';
import { asDuration } from '@/domain/duration';
import { produces } from '@/domain/economy';
import { UpgradeControl } from './UpgradeControl';
import { DragHandle } from './Draggable';
import { GunneryButton } from './GunneryButton';
import { GarrisonStack } from './GarrisonStack';
import { FloatingWindow, useWindowSized, type WindowProps } from './Window';
import type { Seat } from '@/data/session';

/**
 * **La modale d'un site de production : ce bâtiment-là, et rien des autres** (décisions 59a,
 * 60b, 61a du 01/09). La fenêtre Production générale empilait trois domaines, un sélecteur de
 * site et deux bandeaux « bloqué : aucun … » pour un joueur qui voulait former une infanterie
 * dans sa caserne de Normandie. Elle est morte, et son onglet de rail avec elle.
 *
 * **Aucune section de domaine sans bâtiment.** Le catalogue de ce qu'on ne peut pas encore
 * former a déménagé dans l'abaque (60b, contrat 06) : cette surface n'existe pas sans le
 * bâtiment, donc elle n'a rien à griser. La découverte se lit ailleurs, et sans rien posséder.
 *
 * **Elle absorbe la garnison** (61a) : le mât n'a plus qu'une destination, et composer une pile
 * se fait où l'on voit ce que le site tient debout.
 */
export function SiteModal({
  view,
  seat,
  buildingId,
  onOpenGunnery,
  onPrepare,
  onClose,
  ...windowProps
}: WindowProps & {
  view: PlayerView;
  seat: Seat;
  buildingId: string;
  /** L'abaque de tir, ouvert d'ici : c'est au moment où l'on choisit quoi former que « qui bat
   *  qui » est une question (ADR 0018 §4). Muet — le libellé est l'infobulle. */
  onOpenGunnery: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
}) {
  const building = view.me.buildings.find((candidate) => candidate.id === buildingId) ?? null;
  /** Un lien mort — le bâtiment est tombé, l'URL le nomme encore — n'ouvre pas un cadre vide :
   *  il n'ouvre rien, et la carte reste ce qu'elle est. */
  if (building === null) return null;

  return (
    <FloatingWindow name="site" onClose={onClose} {...windowProps} alignment="top" width={1180}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <Site
          key={building.id}
          view={view}
          seat={seat}
          building={building}
          onOpenGunnery={onOpenGunnery}
          onPrepare={onPrepare}
          onClose={onClose}
        />
      </div>
    </FloatingWindow>
  );
}

type Building = PlayerView['me']['buildings'][number];

function Site({
  view,
  seat,
  building,
  onOpenGunnery,
  onPrepare,
  onClose,
}: {
  view: PlayerView;
  seat: Seat;
  building: Building;
  onOpenGunnery: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
  onClose: () => void;
}) {
  const now = useClock();
  const sized = useWindowSized();
  const nation = view.me.nation;
  const workshop = useQuery(api.troops.workshop, seat);
  const recruit = useMutation(api.troops.recruit);
  const cancel = useMutation(api.troops.cancel);
  const [error, setError] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Partial<Record<UnitRole, UnitTier>>>({});

  const station = useMemo<TroopStation>(
    () => ({ kind: 'building', buildingId: building.id }),
    [building.id],
  );
  const marching = useMemo(() => marchingTroopIds(view.arcs), [view.arcs]);
  const held = useMemo(
    () => troopsAt(view.me, stationKeyOf(station), marching),
    [view.me, station, marching],
  );
  const region = view.me.regions.find((candidate) => candidate.id === building.regionId);

  const observing = view.me.defeated;
  const onFailure = (failure: unknown) => handleError(failure, setError);

  /** La query sert toute la nation ; la modale n'en lit **que** son site. Le filtre est client
   *  parce que `workshop` n'a pas changé (contrat 03 : aucun changement serveur). */
  const facility = workshop?.facilities.find((candidate) => candidate.id === building.id) ?? null;

  return (
    <>
      <DragHandle className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--ink)] px-4 py-[10px]">
        <BuildingPlate building={building.key} height={30} />
        <span className="font-(family-name:--font-display) text-[19px] leading-none font-extrabold text-[var(--ink)]">
          {fr.buildings[building.key]}
        </span>
        <span className="text-[12.5px] text-[var(--ink-soft)]">
          {fr.economy.inRegion(region?.name ?? building.regionId)}
        </span>
        <span className="border border-[rgba(42,33,24,.45)] px-[7px] py-[2px] text-[10px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
          {fr.production.siteLevel(building.level)}
        </span>
        {/* **Un état, jamais une action** (ADR 0020 §6). Rien ne se répare ici : le bâtiment est
            debout, entier, et c'est sa région qui a changé de couleur. Le tampon le constate, et
            il n'ouvre aucun bouton — ce qui se reprend se reprend sur la carte. */}
        {region !== undefined && !region.linked && produces(building.key) && (
          <Stamp label={fr.stamps.unlinked} tone="critical" size="small" />
        )}
        <span className="h-px flex-1 bg-[rgba(42,33,24,.2)]" />
        <UpgradeControl building={building} view={view} seat={seat} now={now} />
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          {fr.common.close}
        </button>
      </DragHandle>

      {error && (
        <p className="shrink-0 border-b border-[var(--critical)] px-4 py-[9px] text-[12.5px] text-[var(--critical)]">
          {error}
        </p>
      )}

      {workshop === undefined || facility === null ? (
        <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">{fr.production.opening}</p>
      ) : (
        <>
          {/* Le plafond est **global** et il est répété dans chaque modale : c'est le seul nombre
              qui borne tout choix de formation, et l'omettre ici forcerait à rouvrir une autre
              surface pour savoir s'il reste de la place. */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-[18px] gap-y-2 border-b border-[rgba(42,33,24,.35)] px-4 py-[9px]">
            <span className="flex items-baseline gap-[9px]">
              <span className="font-(family-name:--font-mono) text-[19px] text-[var(--ink)]">
                {workshop.troopsInService}
              </span>
              <span className="eyebrow">{fr.production.inService}</span>
              <span className="ml-[8px] font-(family-name:--font-mono) text-[19px] text-[var(--ink)]">
                {workshop.troopsQueued}
              </span>
              <span className="eyebrow">{fr.production.inQueue}</span>
            </span>
            <CapPips
              inService={workshop.troopsInService}
              queued={workshop.troopsQueued}
              cap={workshop.troopCap}
            />
            <span className="h-px flex-1 bg-[rgba(42,33,24,.2)]" />
            <span className="max-w-[40ch] text-right text-[11.5px] leading-[1.4] text-[var(--ink-soft)] italic">
              {fr.production.troopCapNote}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col @4xl:flex-row @4xl:items-stretch">
            <div
              className={`flex min-w-0 flex-1 flex-col ${
                sized ? 'min-h-0 overflow-auto' : 'max-h-[620px] overflow-auto'
              }`}
            >
              <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3">
                {workshop.grid
                  .filter((entry) => DOMAIN_BY_ROLE[entry.role] === facility.domain)
                  .map((entry) => (
                    <RoleCard
                      key={entry.role}
                      entry={entry}
                      nation={nation}
                      tier={tiers[entry.role] ?? 1}
                      onTier={(picked) =>
                        setTiers((previous) => ({ ...previous, [entry.role]: picked }))
                      }
                      owned={workshop.roster.filter((row) => row.role === entry.role)}
                      tier2Unlocked={workshop.tier2Unlocked}
                      requiredLevel={workshop.requiredHqLevel}
                      hqLevel={workshop.hqLevel}
                      siteLevel={facility.level}
                      siteName={facility.regionName}
                      /** **Nul, l'ordre n'existe pas** — c'est ainsi que l'observateur lit la
                       *  fiche sans qu'elle lui promette une compagnie : un bouton grisé se lit
                       *  comme « pas encore », et ce n'est pas « pas encore ». */
                      onEnqueue={
                        observing
                          ? null
                          : () => {
                              setError(null);
                              void recruit({
                                ...seat,
                                buildingId: building.id as Id<'buildings'>,
                                role: entry.role,
                                tier: tiers[entry.role] ?? 1,
                              }).catch(onFailure);
                            }
                      }
                    />
                  ))}
              </div>

              {/* **La garnison sous ce qui la remplit** (61a) : on lit ce que le site forme, puis
                  ce qu'il tient debout, et on compose la colonne sans changer de fenêtre. */}
              <section className="border-t border-[rgba(42,33,24,.35)]">
                <div className="flex items-center gap-3 border-b border-[rgba(42,33,24,.35)] px-4 py-[9px]">
                  <span className="eyebrow">{fr.garrison.kicker}</span>
                  <span className="h-px flex-1 bg-[rgba(42,33,24,.2)]" />
                  <span className="eyebrow">{fr.garrison.troopCount(held.length)}</span>
                </div>
                <div className="px-4 py-3">
                  <GarrisonStack
                    view={view}
                    station={station}
                    held={held}
                    preselect={[]}
                    canPrepare
                    observing={observing}
                    onPrepare={onPrepare}
                  />
                </div>
              </section>
            </div>

            <aside className="flex min-h-0 w-full min-w-0 flex-col border-t border-[rgba(42,33,24,.35)] @4xl:w-[300px] @4xl:shrink-0 @4xl:border-t-0 @4xl:border-l">
              <div className="shrink-0 border-b border-[rgba(42,33,24,.35)] px-4 py-[10px]">
                <span className="eyebrow">{fr.production.queueHeader}</span>
              </div>
              <div
                className={`flex flex-1 flex-col ${
                  sized ? 'min-h-0 overflow-auto' : 'max-h-[520px] overflow-auto'
                }`}
              >
                {facility.queue.length === 0 ? (
                  <p className="px-4 py-5 text-[12.5px] text-[var(--ink-soft)]">
                    {fr.production.queueEmpty}
                  </p>
                ) : (
                  <>
                    <div className="border-b border-[rgba(42,33,24,.35)] bg-[rgba(42,33,24,.05)] px-4 py-[5px]">
                      <span className="eyebrow">
                        {fr.production.queueOf(
                          facility.regionName,
                          facility.queue.length,
                          workshop.maxQueue,
                        )}
                      </span>
                    </div>
                    {facility.queue.map((batch) => (
                      <QueueRow
                        key={batch.id}
                        batch={batch}
                        nation={nation}
                        loadedAt={workshop.loadedAt}
                        now={now}
                        onCancel={
                          observing
                            ? null
                            : () => {
                                setError(null);
                                void cancel({ ...seat, recruitmentId: batch.id }).catch(onFailure);
                              }
                        }
                      />
                    ))}
                  </>
                )}
                <div className="mt-auto border-t border-[rgba(42,33,24,.35)] px-4 pt-3 pb-5">
                  <span className="eyebrow">{fr.production.atWaking}</span>
                  <p className="mt-1 text-[11.5px] leading-[1.5] text-[var(--ink-soft)]">
                    {fr.production.wakingNote}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </>
      )}

      <div className="flex shrink-0 items-center gap-[10px] border-t border-[var(--ink)] px-4 py-[9px]">
        <GunneryButton onOpen={onOpenGunnery} />
        <span className="h-px flex-1 bg-[rgba(42,33,24,.2)]" />
      </div>
    </>
  );
}

type WorkshopView = NonNullable<ReturnType<typeof useQuery<typeof api.troops.workshop>>>;
type Facility = WorkshopView['facilities'][number];
type GridEntry = WorkshopView['grid'][number];

/**
 * **The ceiling, drawn.** The same three numbers as the figures beside it — standing, queued,
 * free — but as one strip of cells, so "combien me reste-t-il" is answered by counting empties
 * rather than by subtracting. The queued cells are half-inked on purpose: a troop in the chain
 * already holds its place, which is the whole point the note next to it spells out.
 */
function CapPips({ inService, queued, cap }: { inService: number; queued: number; cap: number }) {
  return (
    <span className="flex items-center gap-[3px]">
      {Array.from({ length: cap }, (_, index) => (
        <span
          key={index}
          className="h-[20px] w-[10px] border border-[var(--ink)]"
          style={{
            background:
              index < inService
                ? 'var(--ink)'
                : index < inService + queued
                  ? 'rgba(42,33,24,.35)'
                  : 'transparent',
          }}
        />
      ))}
      <span className="eyebrow ml-[8px]">{fr.production.capOf(cap)}</span>
    </span>
  );
}

/**
 * **One role, one card, the vignette in the lead.** The stacked rows priced a troop in a line
 * of figures and showed the sprite as a thumbnail; here the subject is what the eye lands on
 * and the numbers are read under it.
 *
 * The card keeps the row's rule that a refusal is *said*, never merely greyed: a locked role
 * carries its sentence in the body, and the dead button below repeats nothing.
 */
function RoleCard({
  entry,
  nation,
  tier,
  onTier,
  owned,
  tier2Unlocked,
  requiredLevel,
  hqLevel,
  siteLevel,
  siteName,
  onEnqueue,
}: {
  entry: GridEntry;
  nation: string;
  tier: UnitTier;
  onTier: (chosen: UnitTier) => void;
  owned: ReadonlyArray<{ tier: number; count: number }>;
  tier2Unlocked: boolean;
  requiredLevel: number;
  hqLevel: number;
  siteLevel: number;
  siteName: string;
  onEnqueue: (() => void) | null;
}) {
  const { role, tiers } = entry;
  // The role's own threshold, above the building that forms it: the tank arrives with mark 2.
  const roleLocked = hqLevel < (entry.unlockedAtHqLevel ?? 0);
  /**
   * **La carte reste, la condition se dit, le bouton s'en va** (67b) : le porte-avions se lit
   * sur un port de niveau 1 — rien de caché ne se débloque (60b) — et un bouton grisé se lirait
   * « pas encore » là où il faut lire « montez le port ».
   */
  const siteLocked = siteLevel < entry.unlockedAtSiteLevel;
  const cost = tier === 2 && entry.unitTier2 ? entry.unitTier2 : entry.unit;
  const sheet = fr.unitSheets[role];
  const equipment = equipmentLabel(nation, role, tier);
  const total = owned.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex flex-col border-r border-b border-[rgba(42,33,24,.16)]">
      <div className="relative flex h-[150px] items-center justify-center border-b border-[rgba(42,33,24,.16)] bg-[rgba(42,33,24,.05)]">
        <UnitSprite nation={nation} role={role} tier={tier} height={132} width={230} />
        {tiers === 2 && (
          <div className="absolute top-[8px] left-[8px] flex gap-[2px]">
            {([1, 2] as const).map((level) => {
              const locked = level === 2 && !tier2Unlocked;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={locked}
                  title={
                    locked
                      ? fr.production.tier2Locked(requiredLevel)
                      : fr.production.tierLabel(level)
                  }
                  onClick={() => onTier(level)}
                  className={`cursor-pointer border border-[var(--ink)] px-[5px] py-[3px] font-(family-name:--font-mono) text-[9.5px] leading-none disabled:cursor-not-allowed disabled:opacity-35 ${
                    tier === level
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'bg-[var(--paper)] text-[var(--ink)]'
                  }`}
                >
                  {tierLabel(level)}
                </button>
              );
            })}
          </div>
        )}
        <span className="absolute top-[8px] right-[8px] flex items-baseline gap-[5px]">
          <span className="text-[9.5px] tracking-[.16em] text-[var(--ink-soft)] uppercase">
            {fr.production.inService}
          </span>
          <span className="font-(family-name:--font-mono) text-[14px] text-[var(--ink)]">
            {total}
          </span>
        </span>
      </div>

      <div className="px-4 pt-[10px] pb-[8px]">
        <div className="font-(family-name:--font-display) text-[19px] leading-[1.1] font-extrabold text-[var(--ink)]">
          {roleLabel(role, 1)}
        </div>
        {equipment && (
          <div className="mt-[2px] text-[12.5px] text-[var(--ink-soft)]">{equipment}</div>
        )}
        {roleLocked && (
          <div className="mt-[3px] text-[11.5px] text-[var(--critical)]">
            {fr.production.roleLocked(entry.unlockedAtHqLevel)}
          </div>
        )}
        {siteLocked && (
          <div className="mt-[3px] text-[11.5px] text-[var(--critical)]">
            {fr.production.formsIn(aBuilding(entry.producedBy), entry.unlockedAtSiteLevel)}
          </div>
        )}
      </div>

      {/* The bill and the wait, side by side and ruled apart — the two questions a recruitment
          answers, and the only figures on the card that decide anything. */}
      <div className="mx-4 flex items-stretch border-y border-[rgba(42,33,24,.16)]">
        <div className="flex-1 py-[7px]">
          <div className="text-[9px] tracking-[.16em] text-[var(--ink-quiet)] uppercase">
            {fr.production.costLabel}
          </div>
          <div className="mt-[3px] flex gap-[11px]">
            <Expense resource="alloy" value={cost.alloy} />
          </div>
        </div>
        <div className="w-px self-stretch bg-[rgba(42,33,24,.16)]" />
        <div className="flex-1 py-[7px] pl-3">
          <div className="text-[9px] tracking-[.16em] text-[var(--ink-quiet)] uppercase">
            {fr.production.trainingLabel}
          </div>
          <div className="mt-[3px] flex items-baseline gap-[9px]">
            <span className="font-(family-name:--font-mono) text-[13.5px] text-[var(--ink)]">
              {asDuration(cost.minutes)}
            </span>
            <span className="font-(family-name:--font-mono) text-[13.5px] text-[var(--ink)]">
              {cost.strength}
            </span>
            <span className="text-[10.5px] text-[var(--ink-soft)]">{fr.strengthUnits[role]}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 pt-[9px]">
        {sheet.kind === 'combat' ? (
          <div className="text-[12.5px] leading-[1.5]">
            <div>
              <span className="text-[var(--ink-soft)]">{fr.production.strongAgainst} </span>
              <span className="text-[var(--ink)]">{sheet.strongAgainst.join(', ')}</span>
            </div>
            <div>
              <span className="text-[var(--ink-soft)]">{fr.production.weakAgainst} </span>
              <span className="text-[var(--ink)]">{sheet.weakAgainst.join(', ')}</span>
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] leading-[1.5] text-[var(--ink-soft)] italic">
            {sheet.contribution} {fr.production.supportNote}
          </p>
        )}
      </div>

      {onEnqueue !== null && !siteLocked && (
        <div className="px-4 pt-3 pb-[14px]">
          <button
            type="button"
            disabled={roleLocked}
            onClick={onEnqueue}
            title={
              roleLocked
                ? fr.production.roleLocked(entry.unlockedAtHqLevel)
                : fr.production.enqueueTitle(roleLabel(role, 1), tierLabel(tier), siteName)
            }
            className="w-full cursor-pointer border border-[var(--ink)] py-[8px] text-[10.5px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:border-[rgba(42,33,24,.35)] disabled:text-[rgba(42,33,24,.35)] disabled:hover:bg-transparent"
          >
            {fr.production.enqueue}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * **Un lot commencé ne porte plus de bouton, il porte la phrase.** Il était grisé, et un bouton
 * grisé se lit « pas encore » : celui-là ne reviendra jamais — la matière est prise et le temps
 * a commencé de courir. Dire la règle à sa place est la seule lecture honnête (ADR 0015).
 */
function QueueRow({
  batch,
  nation,
  loadedAt,
  now,
  onCancel,
}: {
  batch: Facility['queue'][number];
  nation: string;
  loadedAt: number;
  now: number;
  onCancel: (() => void) | null;
}) {
  return (
    <div className="flex items-center gap-[10px] border-b border-[rgba(42,33,24,.16)] px-4 py-[8px]">
      <UnitSprite
        nation={nation}
        role={batch.role}
        tier={batch.tier === 2 ? 2 : 1}
        height={26}
        width={38}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-[var(--ink)]">
          {roleLabel(batch.role, 1)}{' '}
          <span className="font-(family-name:--font-mono) text-[11px] text-[var(--ink-soft)]">
            {tierLabel(batch.tier === 2 ? 2 : 1)} — {batch.strength} {fr.strengthUnits[batch.role]}
          </span>
        </div>
        <div className="text-[10px] tracking-[.14em] text-[var(--ink-soft)] uppercase">
          {batch.started ? fr.production.inChain : fr.production.pending}
        </div>
        {batch.started && (
          <div className="text-[11px] leading-[1.4] text-[var(--ink-quiet)] italic">
            {fr.production.cancelStarted}
          </div>
        )}
      </div>
      <span className="shrink-0 font-(family-name:--font-mono) text-[12.5px] text-[var(--ink)]">
        {asDuration(currentMinutes(batch.minutesLeft, loadedAt, now))}
      </span>
      {onCancel !== null && !batch.started && (
        <button
          type="button"
          onClick={onCancel}
          title={fr.production.cancelRefund}
          className="shrink-0 cursor-pointer border border-[var(--ink)] px-[7px] py-[3px] text-[9px] tracking-[.14em] text-[var(--ink)] uppercase hover:bg-[var(--critical)] hover:text-[var(--paper)]"
        >
          {fr.production.cancel}
        </button>
      )}
    </div>
  );
}

function Expense({ resource, value }: { resource: ResourceKey; value: number }) {
  return (
    <span className="flex items-center gap-[4px]" title={fr.resources[resource]}>
      <span className="flex" style={{ color: resourceColor(resource, true) }}>
        <ResourceIcon resource={resource} size={12} />
      </span>
      <span className="font-(family-name:--font-mono) text-[13.5px] text-[var(--ink)]">
        {value}
      </span>
    </span>
  );
}
