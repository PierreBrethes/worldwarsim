import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearch } from '@tanstack/react-router';
import { fr, nationLabel } from '@/i18n/fr';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import { CATEGORIES } from '@/domain/indicators';
import { currentStock, seasonDayOf, type PlayerView } from '@/domain/player-view';
import { marksOf, sourceOf, type Mark } from '@/domain/resource-band';
import { useIndicatorToggles } from '@/data/indicatorToggles';
import { Flag } from '@/emblems/Flag';
import { withWindow, type BoardSearch, type BoardWindow } from '@/routes/-plateau/board-search';
import { AbacusMark } from '@/routes/-plateau/GunneryButton';
import { LayersGlyph, SettingsGlyph } from './Glyph';
import { HoverCard } from './HoverCard';
import { Pictogram } from './IndicatorGlyph';
import { LayersSheet } from './LayersSheet';
import { Stamp } from './Stamp';
import { useClock } from './clock';
import { useSoleSurface } from './sole-surface';

/**
 * **Le bandeau du téléphone** (refonte mobile du 04/10, 1a) : la ligne de la nation et des
 * mouvements, puis huit colonnes — trois lettres, le stock, la tendance. Il remplace sous le seuil
 * la barre de la nation et le bandeau des ressources, dont le journal est descendu au pied.
 *
 * **Il ne se replie plus** : la languette qui pendait dessous se lisait comme la poignée d'une
 * feuille, et c'est le drapeau qui ouvre désormais quelque chose — le dossier de la nation, où
 * vit ce qu'on cherche à froid (1s). « Plus » a quitté la barre de pied pour lui.
 *
 * **Le détail s'ouvre au toucher**, jamais au survol (M1) : le nom, le plafond, le débit, la
 * source et le diagnostic d'un pavé, dans la même carte de papier qu'au bureau.
 */
export function NarrowBand({
  view,
  onShowBriefing,
  ref,
}: {
  view: PlayerView;
  /** L'aide-mémoire est un état du plateau, qui le sert aussi à la première arrivée. */
  onShowBriefing: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const now = useClock();
  const [shown, setShown] = useState<{ resource: ResourceKey; left: number } | null>(null);
  const [surface, setSurface] = useState<'dossier' | 'layers' | null>(null);
  const columns = useRef<HTMLDivElement>(null);
  const marks = marksOf(view, now);
  const { me } = view;

  useEffect(() => {
    if (shown === null) return;
    const elsewhere = (event: globalThis.PointerEvent) => {
      if (columns.current?.contains(event.target as Node)) return;
      setShown(null);
    };
    document.addEventListener('pointerdown', elsewhere);
    return () => document.removeEventListener('pointerdown', elsewhere);
  }, [shown]);

  return (
    <div
      ref={ref}
      className="hud relative z-[var(--z-band)] shrink-0 border-b border-[var(--ink-quiet)] bg-[var(--desk)]"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <div className="flex h-[42px] items-center gap-[10px] px-[14px]">
        <button
          type="button"
          aria-expanded={surface === 'dossier'}
          title={fr.dossier.open(nationLabel(me.nation))}
          onClick={() => setSurface((open) => (open === 'dossier' ? null : 'dossier'))}
          className="-ml-[6px] flex min-h-[42px] shrink-0 cursor-pointer items-center gap-[10px] px-[6px]"
        >
          <Flag nation={me.nation} width={27} />
          <span className="font-(family-name:--font-display) text-[20px] leading-none font-extrabold tracking-[.02em] text-[var(--paper)] uppercase">
            {nationLabel(me.nation)}
          </span>
          <span aria-hidden className="-ml-[4px] text-[11px] leading-none text-[var(--paper-dim)]">
            ▾
          </span>
        </button>
        {me.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
        <span className="flex-1" />
        {/* Le libellé passe au-dessus des cases : sur une ligne, à 375 px, il se tronquait ou
            cassait le compte en colonne. */}
        <span className="flex shrink-0 flex-col items-end gap-[4px]">
          <span className="text-[8.5px] leading-none tracking-[.16em] text-[var(--paper-dim)] uppercase">
            {fr.resourceBand.slots}
          </span>
          <span className="flex items-center gap-[8px]">
            <SlotPips used={me.slots.used} total={me.slots.total} />
            <span className="font-(family-name:--font-mono) text-[13px] leading-none font-medium whitespace-nowrap text-[var(--paper)]">
              {fr.banner.slotsCount(me.slots.used, me.slots.total)}
            </span>
          </span>
        </span>
      </div>

      <div ref={columns} className="relative grid grid-cols-8 px-[6px]">
        {RESOURCES.map((resource) => (
          <Column
            key={resource}
            resource={resource}
            view={view}
            now={now}
            mark={marks[resource]}
            onTouch={(left) =>
              setShown((open) =>
                open?.resource === resource
                  ? null
                  : {
                      resource,
                      left: Math.max(
                        0,
                        Math.min(left, (columns.current?.offsetWidth ?? 0) - DETAIL_WIDTH),
                      ),
                    },
              )
            }
          />
        ))}
        {shown !== null && (
          <NarrowDetail
            resource={shown.resource}
            left={shown.left}
            mark={marks[shown.resource]}
            view={view}
            now={now}
          />
        )}
      </div>

      {surface === 'dossier' && (
        <NationDossier
          view={view}
          onLayers={() => setSurface('layers')}
          onBriefing={() => {
            setSurface(null);
            onShowBriefing();
          }}
          onClose={() => setSurface(null)}
        />
      )}
      {surface === 'layers' && <LayersSheet onClose={() => setSurface(null)} />}
    </div>
  );
}

/** **Un slot pris prend l'ambre des arcs** : la pastille qui s'allume à l'envoi est de la couleur
 *  du fil qui vient de partir sur la carte (1d). */
function SlotPips({ used, total }: { used: number; total: number }) {
  return (
    <span aria-hidden className="flex shrink-0 gap-[3px]">
      {Array.from({ length: total }, (_, rank) => (
        <span
          key={rank}
          className={`h-[10px] w-[10px] border-[1.5px] ${
            rank < used
              ? 'border-[var(--arc-mine)] bg-[var(--arc-mine)]'
              : 'border-[var(--paper-dim)]'
          }`}
        />
      ))}
    </span>
  );
}

/** ▴ ▾ –, et le trait l'emporte au plafond : un stock plein ne monte plus, quoi que dise le
 *  débit. */
const trendOf = (perHour: number, stock: number, cap: number): string =>
  stock >= cap || perHour === 0 ? '–' : perHour > 0 ? '▴' : '▾';

/** **Le pavé seul prend l'alerte** : le chiffre garde l'encre de la ligne, comme au bureau où la
 *  marque est un carré et jamais un mot recoloré. */
function Column({
  resource,
  view,
  now,
  mark,
  onTouch,
}: {
  resource: ResourceKey;
  view: PlayerView;
  now: number;
  mark: Mark | null;
  onTouch: (left: number) => void;
}) {
  const reserve = view.me.resources[resource];
  const stock = currentStock(reserve, view.loadedAt, now);
  return (
    <button
      type="button"
      title={fr.resources[resource]}
      onClick={(event) => onTouch(event.currentTarget.offsetLeft)}
      className="flex min-h-[44px] min-w-0 cursor-pointer flex-col items-center justify-center gap-[3px]"
    >
      <span className="flex items-center gap-[3px] text-[8.5px] leading-none tracking-[.12em] text-[var(--paper-dim)] uppercase">
        <span
          className={`h-[5px] w-[5px] shrink-0 ${mark === null ? 'bg-[var(--routine)]' : 'bg-[var(--critical)]'}`}
        />
        {fr.resourceBand.abbreviations[resource]}
      </span>
      <span className="font-(family-name:--font-mono) text-[13px] leading-none font-medium text-[var(--paper)] tabular-nums">
        {stock.toLocaleString('fr-FR')}
        <span className="text-[9px] text-[var(--paper-dim)]">
          {trendOf(reserve.ratePerHour, stock, reserve.cap)}
        </span>
      </span>
    </button>
  );
}

/** La carte du bureau, en une seule : la réserve, puis le diagnostic s'il y a un pavé. */
const DETAIL_WIDTH = 220;

function NarrowDetail({
  resource,
  left,
  mark,
  view,
  now,
}: {
  resource: ResourceKey;
  left: number;
  mark: Mark | null;
  view: PlayerView;
  now: number;
}) {
  const reserve = view.me.resources[resource];
  const source = sourceOf(view, resource);
  return (
    <HoverCard left={left} width={DETAIL_WIDTH}>
      {fr.resourceBand.tooltip(
        fr.resources[resource],
        currentStock(reserve, view.loadedAt, now),
        reserve.cap,
        reserve.ratePerHour,
      )}
      {source !== null && ` · ${fr.resourceBand.source(fr.buildings[source.by], source.level)}`}
      {mark !== null && (
        <span className="mt-[3px] block text-[var(--critical)]">{mark.diagnosis}</span>
      )}
    </HoverCard>
  );
}

/**
 * **Le dossier de la nation** (1s) : posé sous le bandeau, la carte voilée jusqu'à la barre de
 * pied. Une ligne de 56 px par porte — la fiche, l'abaque, les calques, les réglages,
 * l'aide-mémoire — et la phrase sous chacune dit ce qu'on y trouve, plutôt qu'un mot qu'il
 * faudrait avoir appris.
 *
 * **Il est une surface comme les autres** : il réclame la place en montant (`useSoleSurface`), et
 * une fenêtre ouverte d'ici la lui reprend.
 */
function NationDossier({
  view,
  onLayers,
  onBriefing,
  onClose,
}: {
  view: PlayerView;
  onLayers: () => void;
  onBriefing: () => void;
  onClose: () => void;
}) {
  useSoleSurface(onClose);
  const search = useSearch({ strict: false }) as BoardSearch;
  const toggles = useIndicatorToggles();
  const { me, press } = view;
  const { day } = seasonDayOf(view.season);
  const identity = [
    press?.mine?.nickname,
    fr.dossier.seasonDay(view.season.number, day),
    press?.mine == null ? null : fr.dossier.rank(fr.press.ordinal(press.mine.rank)),
  ].filter((part): part is string => part != null);

  const toWindow = (name: BoardWindow, icon: ReactNode, title: string, note: string) => (
    <Link to="/plateau" search={withWindow(search, name)} onClick={onClose} className={ROW}>
      <DossierLine icon={icon} title={title} note={note} />
    </Link>
  );

  return createPortal(
    <>
      <button
        type="button"
        aria-label={fr.common.close}
        onClick={onClose}
        className="hud board-veil z-[var(--z-band)] cursor-default bg-[rgba(15,10,4,.5)]"
      />
      <section
        role="dialog"
        aria-label={nationLabel(me.nation)}
        className="hud board-dossier paper-grain z-[var(--z-band)] border-b-2 border-[var(--ink)] text-[var(--ink)]"
      >
        <div className="flex items-center gap-3 border-b border-[var(--ink)] px-4 pt-[14px] pb-3">
          <Flag nation={me.nation} width={36} onPaper />
          <div className="min-w-0 flex-1">
            <div className="font-(family-name:--font-display) text-[22px] leading-none font-extrabold">
              {nationLabel(me.nation)}
            </div>
            <div className="mt-1 text-[12.5px] text-[var(--ink-soft)]">{identity.join(' · ')}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 cursor-pointer border border-[var(--ink)] px-3 text-[10px] font-semibold tracking-[.18em] uppercase"
          >
            {fr.common.close}
          </button>
        </div>
        {toWindow(
          'nation',
          <Pictogram pictogram="nation" weight={40} size={24} />,
          fr.dossier.nation,
          fr.dossier.nationNote(me.troops.length),
        )}
        {toWindow('gunnery', <AbacusMark size={22} />, fr.dossier.gunnery, fr.dossier.gunneryNote)}
        <button type="button" onClick={onLayers} className={ROW}>
          <DossierLine
            icon={<LayersGlyph size={24} />}
            title={fr.dossier.layers}
            note={fr.dossier.layersNote(
              CATEGORIES.filter((category) => toggles[category]).length,
              CATEGORIES.length,
            )}
          />
        </button>
        {toWindow(
          'settings',
          <SettingsGlyph size={24} />,
          fr.dossier.settings,
          fr.dossier.settingsNote,
        )}
        <button type="button" onClick={onBriefing} className={`${ROW} border-b-0`}>
          <DossierLine
            icon={<Pictogram pictogram="journal" weight={40} size={24} />}
            title={fr.settingsWindow.briefingLabel}
            note={fr.dossier.briefingNote}
          />
        </button>
      </section>
    </>,
    document.body,
  );
}

const ROW =
  'flex min-h-[56px] w-full cursor-pointer items-center gap-3 border-b border-(color:--ink)/18 px-4 text-left';

function DossierLine({ icon, title, note }: { icon: ReactNode; title: string; note: string }) {
  return (
    <>
      <span aria-hidden className="flex w-[24px] shrink-0 justify-center">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-[12px] text-[var(--ink-soft)]">{note}</span>
      </span>
      <span aria-hidden className="text-[18px] text-[var(--ink-soft)]">
        ›
      </span>
    </>
  );
}
