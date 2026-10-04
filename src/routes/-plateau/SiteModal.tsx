import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState, type ReactNode } from 'react';
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
import { useNarrowScreen } from '@/shell/viewport';
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
  const narrow = useNarrowScreen();
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

  /** **Nul, l'ordre n'existe pas** — c'est ainsi que l'observateur lit la fiche sans qu'elle lui
   *  promette une compagnie : un bouton grisé se lit comme « pas encore », et ce n'est pas « pas
   *  encore ». */
  const enqueueOf = (role: UnitRole): (() => void) | null =>
    observing
      ? null
      : () => {
          setError(null);
          void recruit({
            ...seat,
            buildingId: building.id as Id<'buildings'>,
            role,
            tier: tiers[role] ?? 1,
          }).catch(onFailure);
        };
  const cancelOf = (batch: Batch): (() => void) | null =>
    observing
      ? null
      : () => {
          setError(null);
          void cancel({ ...seat, recruitmentId: batch.id }).catch(onFailure);
        };
  const roles =
    facility === null
      ? []
      : (workshop?.grid ?? []).filter((entry) => DOMAIN_BY_ROLE[entry.role] === facility.domain);
  const unlinked = region !== undefined && !region.linked && produces(building.key);

  if (narrow)
    return (
      <NarrowSite
        view={view}
        seat={seat}
        building={building}
        regionName={region?.name ?? building.regionId}
        unlinked={unlinked}
        now={now}
        error={error}
        workshop={workshop}
        facility={facility}
        roles={roles}
        tiers={tiers}
        onTier={(role, picked) => setTiers((previous) => ({ ...previous, [role]: picked }))}
        enqueueOf={enqueueOf}
        cancelOf={cancelOf}
        station={station}
        held={held}
        onOpenGunnery={onOpenGunnery}
        onPrepare={onPrepare}
        onClose={onClose}
      />
    );

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
        <span className="border border-(color:--ink)/45 px-[7px] py-[2px] text-[10px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
          {fr.production.siteLevel(building.level)}
        </span>
        {/* **Un état, jamais une action** (ADR 0020 §6). Rien ne se répare ici : le bâtiment est
            debout, entier, et c'est sa région qui a changé de couleur. Le tampon le constate, et
            il n'ouvre aucun bouton — ce qui se reprend se reprend sur la carte. */}
        {unlinked && <Stamp label={fr.stamps.unlinked} tone="critical" size="small" />}
        <span className="h-px flex-1 bg-(--ink)/20" />
        {/* L'élévation passe **après** la fermeture sous le seuil : pleine ligne, elle repoussait
            « fermer » à une troisième ligne et l'en-tête mangeait un tiers du téléphone. */}
        <span className="order-last w-full min-w-0 md:order-none md:w-auto">
          <UpgradeControl building={building} view={view} seat={seat} now={now} />
        </span>
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
          <div className="flex shrink-0 flex-wrap items-center gap-x-[18px] gap-y-2 border-b border-(color:--ink)/35 px-4 py-[9px]">
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
            <span className="h-px flex-1 bg-(--ink)/20" />
            <span className="max-w-[40ch] text-right text-[11.5px] leading-[1.4] text-[var(--ink-soft)] italic">
              {fr.production.troopCapNote}
            </span>
          </div>

          {/* **Deux colonnes larges, une seule feuille étroite.** Sous `@4xl` — un écran de
              téléphone, jamais le bureau — les cartes et la file s'empilent et **un seul
              défileur** les porte : deux boîtes qui se disputaient une hauteur fixe laissaient
              les cartes à zéro pixel, et l'on ne pouvait plus former une compagnie. */}
          <div className="flex min-h-0 flex-1 flex-col overflow-auto @4xl:flex-row @4xl:items-stretch @4xl:overflow-visible">
            <div
              className={`flex min-w-0 flex-col @4xl:flex-1 ${
                sized ? '@4xl:min-h-0 @4xl:overflow-auto' : '@4xl:max-h-[620px] @4xl:overflow-auto'
              }`}
            >
              <div className="grid grid-cols-1 @xl:grid-cols-2 @4xl:grid-cols-3">
                {roles.map((entry) => (
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
                    onEnqueue={enqueueOf(entry.role)}
                  />
                ))}
              </div>

              {/* **La garnison sous ce qui la remplit** (61a) : on lit ce que le site forme, puis
                  ce qu'il tient debout, et on compose la colonne sans changer de fenêtre. */}
              <section className="border-t border-(color:--ink)/35">
                <div className="flex items-center gap-3 border-b border-(color:--ink)/35 px-4 py-[9px]">
                  <span className="eyebrow">{fr.garrison.kicker}</span>
                  <span className="h-px flex-1 bg-(--ink)/20" />
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

            <aside className="flex w-full min-w-0 flex-col border-t border-(color:--ink)/35 @4xl:min-h-0 @4xl:w-[300px] @4xl:shrink-0 @4xl:border-t-0 @4xl:border-l">
              <div className="shrink-0 border-b border-(color:--ink)/35 px-4 py-[10px]">
                <span className="eyebrow">{fr.production.queueHeader}</span>
              </div>
              <div
                className={`flex flex-col @4xl:flex-1 ${
                  sized
                    ? '@4xl:min-h-0 @4xl:overflow-auto'
                    : '@4xl:max-h-[520px] @4xl:overflow-auto'
                }`}
              >
                {facility.queue.length === 0 ? (
                  <p className="px-4 py-5 text-[12.5px] text-[var(--ink-soft)]">
                    {fr.production.queueEmpty}
                  </p>
                ) : (
                  <>
                    <div className="border-b border-(color:--ink)/35 bg-(--ink)/5 px-4 py-[5px]">
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
                        onCancel={cancelOf(batch)}
                      />
                    ))}
                  </>
                )}
                <div className="mt-auto border-t border-(color:--ink)/35 px-4 pt-3 pb-5">
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
        <span className="h-px flex-1 bg-(--ink)/20" />
      </div>
    </>
  );
}

type WorkshopView = NonNullable<ReturnType<typeof useQuery<typeof api.troops.workshop>>>;
type Facility = WorkshopView['facilities'][number];
type GridEntry = WorkshopView['grid'][number];
type Batch = Facility['queue'][number];

/** Ce qu'un rôle coûte au palier choisi, et ce qui le retient : la carte du bureau et la ligne
 *  du téléphone lisent la même règle. */
function roleTermsOf(entry: GridEntry, tier: UnitTier, hqLevel: number, siteLevel: number) {
  return {
    // The role's own threshold, above the building that forms it: the tank arrives with mark 2.
    roleLocked: hqLevel < (entry.unlockedAtHqLevel ?? 0),
    /**
     * **La carte reste, la condition se dit, le bouton s'en va** (67b) : le porte-avions se lit
     * sur un port de niveau 1 — rien de caché ne se débloque (60b) — et un bouton grisé se lirait
     * « pas encore » là où il faut lire « montez le port ».
     */
    siteLocked: siteLevel < entry.unlockedAtSiteLevel,
    cost: tier === 2 && entry.unitTier2 ? entry.unitTier2 : entry.unit,
  };
}

/**
 * **La modale d'un site, sur un téléphone** (retour de Pierre, 04/10). La fenêtre du bureau y
 * tenait un en-tête, une bande de plafond et un pied fixes, et laissait aux cartes une boîte de
 * quelques pixels. Ici tout défile d'un seul tenant, comme le journal et la presse : l'en-tête
 * reste collé, et les sections suivent l'ordre où l'on décide — monter le site, former, suivre la
 * file, composer la garnison.
 */
function NarrowSite({
  view,
  seat,
  building,
  regionName,
  unlinked,
  now,
  error,
  workshop,
  facility,
  roles,
  tiers,
  onTier,
  enqueueOf,
  cancelOf,
  station,
  held,
  onOpenGunnery,
  onPrepare,
  onClose,
}: {
  view: PlayerView;
  seat: Seat;
  building: Building;
  regionName: string;
  unlinked: boolean;
  now: number;
  error: string | null;
  workshop: WorkshopView | undefined;
  facility: Facility | null;
  roles: ReadonlyArray<GridEntry>;
  tiers: Partial<Record<UnitRole, UnitTier>>;
  onTier: (role: UnitRole, tier: UnitTier) => void;
  enqueueOf: (role: UnitRole) => (() => void) | null;
  cancelOf: (batch: Batch) => (() => void) | null;
  station: TroopStation;
  held: ReturnType<typeof troopsAt>;
  onOpenGunnery: () => void;
  onPrepare: (station: TroopStation, troopIds: ReadonlyArray<string>) => void;
  onClose: () => void;
}) {
  return (
    <article className="paper-grain min-h-0 w-full flex-1 overflow-y-auto overscroll-contain text-[var(--ink)]">
      <div className="paper-grain sticky top-0 z-[2] border-b border-[var(--ink)]">
        <div className="flex min-h-[58px] items-center gap-[10px] py-[6px] pr-3 pl-4">
          <BuildingPlate building={building.key} height={32} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-(family-name:--font-display) text-[20px] leading-[1.1] font-extrabold">
              {fr.buildings[building.key]}
            </div>
            <div className="truncate text-[12px] text-[var(--ink-soft)]">
              {fr.production.siteLevel(building.level)} · {fr.economy.inRegion(regionName)}
            </div>
          </div>
          <GunneryButton onOpen={onOpenGunnery} />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer border border-[var(--ink)] px-3 text-[10px] font-semibold tracking-[.18em] uppercase"
          >
            {fr.common.close}
          </button>
        </div>
        {/* Un état, jamais une action (ADR 0020 §6) : ce qui se reprend se reprend sur la carte. */}
        {unlinked && (
          <div className="px-4 pb-2">
            <Stamp label={fr.stamps.unlinked} tone="critical" size="small" />
          </div>
        )}
      </div>

      {error && (
        <p className="border-b border-[var(--critical)] px-4 py-[9px] text-[12.5px] text-[var(--critical)]">
          {error}
        </p>
      )}

      {!view.me.defeated && (
        <NarrowSection title={fr.production.narrowSections.raise}>
          <div className="px-4 py-3">
            <UpgradeControl building={building} view={view} seat={seat} now={now} />
          </div>
        </NarrowSection>
      )}

      {workshop === undefined || facility === null ? (
        <p className="px-4 py-6 text-[13px] text-[var(--ink-soft)]">{fr.production.opening}</p>
      ) : (
        <>
          <NarrowSection title={fr.production.narrowSections.form}>
            {/* Le plafond est global et répété ici : c'est le seul nombre qui borne le choix. */}
            <div className="border-b border-(color:--ink)/18 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-[9px]">
                <span className="font-(family-name:--font-mono) text-[17px]">
                  {workshop.troopsInService}
                </span>
                <span className="eyebrow">{fr.production.inService}</span>
                <span className="ml-[6px] font-(family-name:--font-mono) text-[17px]">
                  {workshop.troopsQueued}
                </span>
                <span className="eyebrow">{fr.production.inQueue}</span>
              </div>
              <div className="mt-[8px]">
                <CapPips
                  inService={workshop.troopsInService}
                  queued={workshop.troopsQueued}
                  cap={workshop.troopCap}
                />
              </div>
              <p className="mt-[8px] text-[11.5px] leading-[1.45] text-[var(--ink-soft)] italic">
                {fr.production.troopCapNote}
              </p>
            </div>
            {roles.map((entry) => (
              <RoleLine
                key={entry.role}
                entry={entry}
                nation={view.me.nation}
                tier={tiers[entry.role] ?? 1}
                onTier={(picked) => onTier(entry.role, picked)}
                owned={workshop.roster.filter((row) => row.role === entry.role)}
                tier2Unlocked={workshop.tier2Unlocked}
                requiredLevel={workshop.requiredHqLevel}
                hqLevel={workshop.hqLevel}
                siteLevel={facility.level}
                siteName={facility.regionName}
                onEnqueue={enqueueOf(entry.role)}
              />
            ))}
          </NarrowSection>

          <NarrowSection
            title={fr.production.narrowSections.queue}
            count={`${facility.queue.length} / ${workshop.maxQueue}`}
          >
            {facility.queue.length === 0 ? (
              <p className="px-4 py-4 text-[12.5px] text-[var(--ink-soft)]">
                {fr.production.queueEmpty}
              </p>
            ) : (
              facility.queue.map((batch) => (
                <QueueRow
                  key={batch.id}
                  batch={batch}
                  nation={view.me.nation}
                  loadedAt={workshop.loadedAt}
                  now={now}
                  onCancel={cancelOf(batch)}
                />
              ))
            )}
          </NarrowSection>
        </>
      )}

      <NarrowSection title={fr.garrison.kicker} count={fr.garrison.troopCount(held.length)}>
        <div className="px-3 pt-3 pb-4">
          <GarrisonStack
            view={view}
            station={station}
            held={held}
            preselect={[]}
            canPrepare
            observing={view.me.defeated}
            onPrepare={onPrepare}
          />
        </div>
      </NarrowSection>
    </article>
  );
}

/** Le titre d'une section, à la manière des familles des Chantiers. */
function NarrowSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex justify-between border-b border-[var(--ink)] bg-[color-mix(in_srgb,var(--paper),var(--ink)_6%)] px-4 pt-2 pb-[6px] text-[10px] font-bold tracking-[.18em] uppercase">
        <span>{title}</span>
        {count !== undefined && (
          <span className="font-(family-name:--font-mono) font-normal tracking-normal text-[var(--ink-soft)]">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * **Un rôle sur un téléphone : une ligne, pas une affiche.** La carte du bureau donne cent
 * cinquante pixels à la vignette ; ici la vignette tient à gauche, le prix et l'attente sous le
 * nom, et le bouton prend toute la largeur sous le pouce. La règle est celle de la carte
 * (`roleTermsOf`) : une condition se dit, le bouton s'en va.
 */
function RoleLine({
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
  const { roleLocked, siteLocked, cost } = roleTermsOf(entry, tier, hqLevel, siteLevel);
  const sheet = fr.unitSheets[role];
  const equipment = equipmentLabel(nation, role, tier);
  const total = owned.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="border-b border-(color:--ink)/18 px-4 py-3">
      <div className="flex gap-3">
        <div className="flex h-[78px] w-[100px] shrink-0 items-center justify-center bg-(--ink)/5">
          <UnitSprite nation={nation} role={role} tier={tier} height={70} width={96} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-(family-name:--font-display) text-[18px] leading-[1.1] font-extrabold">
            {roleLabel(role, 1)}
          </div>
          <div className="truncate text-[12.5px] text-[var(--ink-soft)]">
            {equipment && `${equipment} · `}
            <span className="font-(family-name:--font-mono) text-[11px]">
              {total} {fr.production.inService}
            </span>
          </div>
          <div className="mt-[6px] flex flex-wrap items-center gap-x-3 gap-y-1">
            <Expense resource="alloy" value={cost.alloy} />
            <span className="font-(family-name:--font-mono) text-[12.5px]">
              {asDuration(cost.minutes)}
            </span>
            <span className="font-(family-name:--font-mono) text-[12.5px]">
              {cost.strength}{' '}
              <span className="font-(family-name:--font-body) text-[11px] text-[var(--ink-soft)]">
                {fr.strengthUnits[role]}
              </span>
            </span>
          </div>
        </div>
      </div>
      {roleLocked && (
        <p className="mt-[6px] text-[11.5px] text-[var(--critical)]">
          {fr.production.roleLocked(entry.unlockedAtHqLevel)}
        </p>
      )}
      {siteLocked && (
        <p className="mt-[6px] text-[11.5px] text-[var(--critical)]">
          {fr.production.formsIn(aBuilding(entry.producedBy), entry.unlockedAtSiteLevel)}
        </p>
      )}
      <div className="mt-[7px] text-[12px] leading-[1.45]">
        {sheet.kind === 'combat' ? (
          <>
            <div>
              <span className="text-[var(--ink-soft)]">{fr.production.strongAgainst} </span>
              {sheet.strongAgainst.join(', ')}
            </div>
            <div>
              <span className="text-[var(--ink-soft)]">{fr.production.weakAgainst} </span>
              {sheet.weakAgainst.join(', ')}
            </div>
          </>
        ) : (
          <p className="text-[var(--ink-soft)] italic">
            {sheet.contribution} {fr.production.supportNote}
          </p>
        )}
      </div>
      {onEnqueue !== null && !siteLocked && (
        <div className="mt-[9px] flex gap-[6px]">
          {tiers === 2 &&
            ([1, 2] as const).map((level) => {
              const locked = level === 2 && !tier2Unlocked;
              return (
                <button
                  key={level}
                  type="button"
                  disabled={locked}
                  aria-pressed={tier === level}
                  title={
                    locked
                      ? fr.production.tier2Locked(requiredLevel)
                      : fr.production.tierLabel(level)
                  }
                  onClick={() => onTier(level)}
                  className={`min-h-[44px] w-[52px] shrink-0 cursor-pointer border border-[var(--ink)] font-(family-name:--font-mono) text-[12px] disabled:cursor-not-allowed disabled:opacity-35 ${
                    tier === level ? 'bg-[var(--ink)] text-[var(--paper)]' : ''
                  }`}
                >
                  {tierLabel(level)}
                </button>
              );
            })}
          <button
            type="button"
            disabled={roleLocked}
            onClick={onEnqueue}
            title={fr.production.enqueueTitle(roleLabel(role, 1), tierLabel(tier), siteName)}
            className="min-h-[44px] flex-1 cursor-pointer bg-[var(--ink)] text-[11px] font-semibold tracking-[.16em] text-[var(--paper)] uppercase disabled:cursor-not-allowed disabled:opacity-35"
          >
            {fr.production.enqueue}
          </button>
        </div>
      )}
    </div>
  );
}

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
                  ? 'color-mix(in srgb, var(--ink) 35%, transparent)'
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
  const { roleLocked, siteLocked, cost } = roleTermsOf(entry, tier, hqLevel, siteLevel);
  const sheet = fr.unitSheets[role];
  const equipment = equipmentLabel(nation, role, tier);
  const total = owned.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="flex flex-col border-r border-b border-(color:--ink)/16">
      <div className="relative flex h-[150px] items-center justify-center border-b border-(color:--ink)/16 bg-(--ink)/5">
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
      <div className="mx-4 flex items-stretch border-y border-(color:--ink)/16">
        <div className="flex-1 py-[7px]">
          <div className="text-[9px] tracking-[.16em] text-[var(--ink-quiet)] uppercase">
            {fr.production.costLabel}
          </div>
          <div className="mt-[3px] flex gap-[11px]">
            <Expense resource="alloy" value={cost.alloy} />
          </div>
        </div>
        <div className="w-px self-stretch bg-(--ink)/16" />
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
            className="w-full cursor-pointer border border-[var(--ink)] py-[8px] text-[10.5px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:border-(color:--ink)/35 disabled:text-(color:--ink)/35 disabled:hover:bg-transparent"
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
  batch: Batch;
  nation: string;
  loadedAt: number;
  now: number;
  onCancel: (() => void) | null;
}) {
  return (
    /* Une ligne de file est une cible sous le doigt, annulation comprise : 44 px au moins sous
       le seuil (lot mobile-3, §4), la même mesure que le reste de la fenêtre. */
    <div className="flex items-center gap-[10px] border-b border-(color:--ink)/16 px-4 py-[8px] max-md:min-h-[44px]">
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
