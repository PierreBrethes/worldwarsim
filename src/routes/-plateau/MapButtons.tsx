import { Link, useSearch } from '@tanstack/react-router';
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { fr } from '@/i18n/fr';
import { isTyping } from '@/map/typing';
import { Glyph, LayersGlyph, SettingsGlyph } from '@/shell/Glyph';
import { SQUARE } from '@/shell/SurfaceColumn';
import { UnreadDot } from '@/shell/UnreadDot';
import { useUnreadPatchnotes } from '@/data/patchnotes';
import { toggleWindow, windowOpen, type BoardSearch } from './board-search';

export type Corner = 'layers' | 'controls';

/**
 * **Les boutons du coin de la carte** (refonte mobile, 1a ; bureau aligné le 12/10) : revenir chez
 * soi, les calques, et au bureau l'aide-mémoire — du même papier, 44 px sous le pouce, 36 à la
 * souris. Sous le seuil, les calques gardent aussi leur ligne au dossier de la nation et les gestes
 * vivent dans son aide-mémoire. `H` recentre et `?` ouvre les gestes, jamais pendant une saisie.
 */
export function MapButtons({
  narrow,
  layers,
  onRecenter,
  onCorner,
}: {
  narrow: boolean;
  /** A Blitz has no deposits: nothing for the layers to switch. */
  layers: boolean;
  onRecenter: () => void;
  onCorner: Dispatch<SetStateAction<Corner | null>>;
}) {
  const unread = useUnreadPatchnotes();
  const toggle = (card: Corner) => onCorner((open) => (open === card ? null : card));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onCorner(null);
      if (isTyping() || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === '?' && !narrow) {
        event.preventDefault();
        onCorner((open) => (open === 'controls' ? null : 'controls'));
      } else if (event.key === 'h' || event.key === 'H') {
        event.preventDefault();
        onRecenter();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [narrow, onRecenter, onCorner]);

  const size = narrow ? 'h-[44px] w-[44px]' : 'h-[46px] w-[46px]';
  const glyph = narrow ? 22 : 20;
  const search = useSearch({ strict: false }) as BoardSearch;
  return (
    <div className="hud flex flex-col gap-[calc(var(--table-gap)/var(--hud-scale))]">
      <button
        type="button"
        title={fr.mapUi.recenterTitle}
        aria-label={fr.mapUi.recenter}
        aria-keyshortcuts="H"
        onClick={onRecenter}
        className={`${MAP_BUTTON} ${size}`}
      >
        <Glyph size={glyph}>
          <circle cx="10" cy="10" r="5.2" />
          <path d="M10 1.5v4.2M10 14.3v4.2M1.5 10h4.2M14.3 10h4.2" />
        </Glyph>
      </button>
      {layers && (
        <button
          type="button"
          title={fr.foot.layersTitle}
          aria-label={fr.foot.layersTitle}
          onClick={() => toggle('layers')}
          className={`${MAP_BUTTON} ${size}`}
        >
          <LayersGlyph size={glyph} />
        </button>
      )}
      {!narrow && (
        <button
          type="button"
          title={fr.mapUi.controlsLabel}
          aria-label={fr.mapUi.controlsLabel}
          aria-keyshortcuts="?"
          onClick={() => toggle('controls')}
          className={`${MAP_BUTTON} ${size} font-(family-name:--font-body) text-[16px] leading-none`}
        >
          ?
        </button>
      )}
      {/* **Les réglages au pied de la pile** (table plein écran, 13/10) : ils ont quitté la colonne
          des surfaces, qu'on ouvre souvent, pour le coin, qu'on touche rarement. Sous le seuil ils
          gardent leur ligne au dossier de la nation. */}
      {!narrow && (
        <Link
          to="/plateau"
          search={toggleWindow(search, 'settings')}
          title={fr.rail.settings}
          aria-label={fr.rail.settings}
          aria-current={windowOpen(search, 'settings') ? 'true' : undefined}
          className={`${SQUARE} relative`}
        >
          <SettingsGlyph size={18} />
          {unread.size > 0 && <UnreadDot />}
          <span className="text-[7.5px] leading-none font-semibold tracking-[.1em] uppercase">
            {fr.rail.settingsShort}
          </span>
        </Link>
      )}
    </div>
  );
}

const MAP_BUTTON =
  'press paper-grain paper-hover flex cursor-pointer items-center justify-center border border-[var(--ink)] text-[var(--ink)] float';
