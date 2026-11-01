import { useState, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearch } from '@tanstack/react-router';
import { fr, nationLabel } from '@/i18n/fr';
import { CATEGORIES } from '@/domain/indicators';
import { slotCardsOf } from '@/domain/research';
import { halifaxNoteOf } from '@/domain/movement-orders';
import { seasonDayOf, type PlayerView } from '@/domain/player-view';
import { useIndicatorToggles } from '@/data/indicatorToggles';
import { Flag } from '@/emblems/Flag';
import { withWindow, type BoardSearch, type BoardWindow } from '@/routes/-plateau/board-search';
import { AbacusMark } from '@/routes/-plateau/GunneryButton';
import { LayersGlyph, SettingsGlyph } from './Glyph';
import { Pictogram } from './IndicatorGlyph';
import { LayersSheet } from './LayersSheet';
import { BlitzClock, EditionMark, SlotBoxes } from './Reglette';
import { Stamp } from './Stamp';
import { UnreadDot } from './UnreadDot';
import { useUnreadPatchnotes } from '@/data/patchnotes';
import { useClock } from './clock';
import { useSoleSurface } from './sole-surface';

/**
 * **L'en-tête du téléphone** (#179, qui reprend la table plein écran du 13/10) : une seule ligne
 * de papier posée sur la carte — la nation, les mouvements en vol, la prochaine édition. Les
 * réserves en sont descendues : elles vivent dans la barre basse (`ReserveCell`). En Blitz, qui n'a
 * ni slots ni édition, la ligne porte l'horloge, et les fonds sont dans la barre.
 *
 * **Le drapeau ouvre le dossier de la nation** (1s), où vit ce qu'on cherche à froid.
 */
export function NarrowBand({
  view,
  onShowBriefing,
  onResumeSteps = null,
  ref,
}: {
  view: PlayerView;
  /** L'aide-mémoire est un état du plateau, qui le sert aussi à la première arrivée. */
  onShowBriefing: () => void;
  /** Les premiers pas repliés ou passés : le dossier les reprend. */
  onResumeSteps?: (() => void) | null;
  ref?: Ref<HTMLElement>;
}) {
  const now = useClock();
  const search = useSearch({ strict: false }) as BoardSearch;
  const [surface, setSurface] = useState<'dossier' | 'layers' | null>(null);
  const { me } = view;
  const unread = useUnreadPatchnotes();

  return (
    <header
      ref={ref}
      className="hud paper-grain float absolute top-[calc(6px/var(--hud-scale))] right-[calc(6px/var(--hud-scale))] left-[calc(6px/var(--hud-scale))] z-[var(--z-band)] border border-[var(--ink)] text-[var(--ink)]"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      <div className="flex h-[40px] items-center gap-[10px] overflow-hidden px-[12px]">
        <button
          type="button"
          aria-expanded={surface === 'dossier'}
          title={fr.dossier.open(nationLabel(me.nation))}
          onClick={() => setSurface((open) => (open === 'dossier' ? null : 'dossier'))}
          className="relative -ml-[6px] flex min-h-[40px] min-w-0 cursor-pointer items-center gap-[10px] px-[6px]"
        >
          <Flag nation={me.nation} width={27} onPaper />
          {surface !== 'dossier' && unread.size > 0 && (
            <UnreadDot className="top-[2px] left-[28px]" />
          )}
          <span className="min-w-0 truncate font-(family-name:--font-display) text-[20px] leading-none font-bold tracking-[.01em] uppercase">
            {nationLabel(me.nation)}
          </span>
          <span
            aria-hidden
            className="-ml-[4px] shrink-0 text-[11px] leading-none text-[var(--ink-soft)]"
          >
            ▾
          </span>
        </button>
        {me.defeated && <Stamp label={fr.stamps.defeated} size="small" />}
        <span className="min-w-0 flex-1" />
        {view.mode === 'blitz' ? (
          <BlitzClock view={view} now={now} openEnding={search} />
        ) : (
          <span
            className="flex shrink-0 items-center gap-[8px] whitespace-nowrap"
            title={fr.banner.slotsTitle(
              me.slots.used,
              me.slots.total,
              slotCardsOf(me.research.researched),
              halifaxNoteOf(me.slots),
            )}
          >
            {/* Under 420 px the count alone: the edition keeps the room (Halifax's sentence stays in the title). */}
            <span className="flex max-[420px]:hidden">
              <SlotBoxes used={me.slots.used} total={me.slots.total} />
            </span>
            <span className="font-(family-name:--font-mono) text-[14px] leading-none font-medium tabular-nums">
              {fr.banner.slotsCount(me.slots.used, me.slots.total)}
            </span>
          </span>
        )}
        <EditionMark view={view} />
      </div>

      {surface === 'dossier' && (
        <NationDossier
          view={view}
          onLayers={() => setSurface('layers')}
          onBriefing={() => {
            setSurface(null);
            onShowBriefing();
          }}
          onResumeSteps={
            onResumeSteps === null
              ? null
              : () => {
                  setSurface(null);
                  onResumeSteps();
                }
          }
          onClose={() => setSurface(null)}
        />
      )}
      {surface === 'layers' && <LayersSheet onClose={() => setSurface(null)} />}
    </header>
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
  onResumeSteps,
  onClose,
}: {
  view: PlayerView;
  onLayers: () => void;
  onBriefing: () => void;
  onResumeSteps: (() => void) | null;
  onClose: () => void;
}) {
  useSoleSurface(onClose);
  const unread = useUnreadPatchnotes();
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
        {view.mode !== 'blitz' && (
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
        )}
        {toWindow(
          'settings',
          <span className="relative">
            <SettingsGlyph size={24} />
            {unread.size > 0 && <UnreadDot />}
          </span>,
          fr.dossier.settings,
          fr.dossier.settingsNote,
        )}
        {onResumeSteps !== null && (
          <button type="button" onClick={onResumeSteps} className={ROW}>
            <DossierLine
              icon={<Pictogram pictogram="journal" weight={40} size={24} />}
              title={fr.firstSteps.resume}
              note={fr.firstSteps.resumeNote}
            />
          </button>
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
