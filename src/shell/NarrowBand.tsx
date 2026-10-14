import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearch } from '@tanstack/react-router';
import { fr, nationLabel } from '@/i18n/fr';
import { RESOURCES, type ResourceKey } from '@/domain/ids';
import { CATEGORIES } from '@/domain/indicators';
import { seasonDayOf, type PlayerView } from '@/domain/player-view';
import { marksOf } from '@/domain/resource-band';
import { useIndicatorToggles } from '@/data/indicatorToggles';
import { Flag } from '@/emblems/Flag';
import { withWindow, type BoardSearch, type BoardWindow } from '@/routes/-plateau/board-search';
import { AbacusMark } from '@/routes/-plateau/GunneryButton';
import { LayersGlyph, SettingsGlyph } from './Glyph';
import { Pictogram } from './IndicatorGlyph';
import { LayersSheet } from './LayersSheet';
import { FundsCell, ReserveCard, ResourceCell, SlotBoxes } from './Reglette';
import { Stamp } from './Stamp';
import { useClock } from './clock';
import { useSoleSurface } from './sole-surface';

/**
 * **La réglette du téléphone** (table plein écran, 13/10, qui reprend la refonte mobile du 04/10) :
 * la bande de papier du bureau sur deux lignes, posée sur la carte — la nation et les mouvements,
 * puis les huit réserves en colonnes, icône, chiffre et jauge. L'alerte y est la même qu'au bureau
 * (`marksOf`), sans le cercle : le chiffre rouge et l'étiquette qui pend.
 *
 * **Le drapeau ouvre le dossier de la nation** (1s), où vit ce qu'on cherche à froid. **Le détail
 * d'une réserve s'ouvre au toucher**, jamais au survol (M1) : le nom, le plafond, le débit, la
 * source et le diagnostic, dans la même carte de papier qu'au bureau.
 */
export function NarrowBand({
  view,
  onShowBriefing,
  ref,
}: {
  view: PlayerView;
  /** L'aide-mémoire est un état du plateau, qui le sert aussi à la première arrivée. */
  onShowBriefing: () => void;
  ref?: Ref<HTMLElement>;
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
    <header
      ref={ref}
      className="hud paper-grain float absolute top-[calc(6px/var(--hud-scale))] right-[calc(6px/var(--hud-scale))] left-[calc(6px/var(--hud-scale))] z-[var(--z-band)] border border-[var(--ink)] text-[var(--ink)]"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <div className="flex h-[40px] items-center gap-[10px] border-b border-(color:--ink)/25 px-[12px]">
        <button
          type="button"
          aria-expanded={surface === 'dossier'}
          title={fr.dossier.open(nationLabel(me.nation))}
          onClick={() => setSurface((open) => (open === 'dossier' ? null : 'dossier'))}
          className="-ml-[6px] flex min-h-[40px] shrink-0 cursor-pointer items-center gap-[10px] px-[6px]"
        >
          <Flag nation={me.nation} width={27} onPaper />
          <span className="font-(family-name:--font-display) text-[20px] leading-none font-bold tracking-[.01em] uppercase">
            {nationLabel(me.nation)}
          </span>
          <span aria-hidden className="-ml-[4px] text-[11px] leading-none text-[var(--ink-soft)]">
            ▾
          </span>
        </button>
        {me.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
        <span className="flex-1" />
        <span
          className="flex shrink-0 items-center gap-[8px] whitespace-nowrap"
          title={fr.banner.slotsTitle(me.slots.used, me.slots.total)}
        >
          <SlotBoxes used={me.slots.used} total={me.slots.total} />
          <span className="font-(family-name:--font-mono) text-[14px] leading-none font-medium tabular-nums">
            {fr.banner.slotsCount(me.slots.used, me.slots.total)}
          </span>
        </span>
      </div>

      {me.funds !== null ? (
        <div className="flex h-[38px] items-center px-[12px]">
          <FundsCell funds={me.funds} loadedAt={view.loadedAt} now={now} stacked />
        </div>
      ) : (
        <div ref={columns} className="relative grid grid-cols-8 px-[4px] py-[4px]">
          {RESOURCES.map((resource) => (
            <ResourceCell
              key={resource}
              resource={resource}
              view={view}
              now={now}
              stacked
              onClick={(event) => {
                const left = event.currentTarget.offsetLeft;
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
                );
              }}
            />
          ))}
          {shown !== null && (
            <ReserveCard
              resource={shown.resource}
              view={view}
              now={now}
              mark={marks[shown.resource]}
              left={shown.left}
              width={DETAIL_WIDTH}
            />
          )}
        </div>
      )}

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
    </header>
  );
}

/** Assez large pour que le diagnostic passe à la ligne sans sortir de l'écran. */
const DETAIL_WIDTH = 220;

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
