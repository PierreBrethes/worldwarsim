import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { fr } from '@/i18n/fr';
import { DestroyButton } from '@/shell/DestroyButton';
import {
  DEFAULT_HUD_SCALE,
  MAX_HUD_SCALE,
  MIN_HUD_SCALE,
  keepHudScale,
  keepTelegraphSound,
  readHudScale,
  telegraphSoundOn,
} from '@/data/settings';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';

export function SettingsWindow({
  token,
  mayConclude,
  defeated,
  onClose,
  onShowBriefing,
  ...windowProps
}: WindowProps & {
  token: string;
  mayConclude: boolean;
  defeated: boolean;
  onShowBriefing: () => void;
}) {
  const [scale, setScale] = useState(readHudScale);
  const [sound, setSound] = useState(telegraphSoundOn);
  const conclude = useMutation(api.seasons.conclude);
  const surrender = useMutation(api.players.surrender);

  const set = (value: number) => {
    const clamped = Math.max(MIN_HUD_SCALE, Math.min(MAX_HUD_SCALE, value));
    setScale(clamped);
    keepHudScale(clamped);
  };

  return (
    <FloatingWindow name="settings" onClose={onClose} {...windowProps} width={420}>
      <div className="paper-grain flex min-h-0 w-full flex-1 flex-col border border-[var(--ink)]">
        <DragHandle className="flex shrink-0 items-center justify-between border-b border-[var(--ink)] px-4 py-[9px]">
          <span className="eyebrow">{fr.settingsWindow.header}</span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer border border-[var(--ink)] px-[9px] py-1 text-[9px] tracking-[.18em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
          >
            {fr.common.close}
          </button>
        </DragHandle>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-[14px]">
          <div className="flex items-baseline justify-between">
            <span className="text-[13.5px] text-[var(--ink)]">{fr.settingsWindow.scaleLabel}</span>
            <span className="font-(family-name:--font-mono) text-[15px] text-[var(--ink)]">
              {scale} %
            </span>
          </div>
          <div className="mt-3 flex items-center gap-[10px]">
            <Step sign="–" onClick={() => set(scale - 10)} disabled={scale <= MIN_HUD_SCALE} />
            <div className="relative h-[6px] flex-1 bg-[rgba(42,33,24,.14)]">
              <div
                className="h-[6px] bg-[var(--interaction)]"
                style={{
                  width: `${((scale - MIN_HUD_SCALE) / (MAX_HUD_SCALE - MIN_HUD_SCALE)) * 100}%`,
                }}
              />
            </div>
            <Step sign="+" onClick={() => set(scale + 10)} disabled={scale >= MAX_HUD_SCALE} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-[180px] flex-1 text-[11.5px] text-[var(--ink-soft)]">
              {fr.settingsWindow.scaleNote(MIN_HUD_SCALE, MAX_HUD_SCALE)}
            </span>
            <button
              type="button"
              onClick={() => set(DEFAULT_HUD_SCALE)}
              className="shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.settingsWindow.reset}
            </button>
          </div>

          {/* **Le son est un réglage à part.** `prefers-reduced-motion` parle d'animation, pas
              d'audio : s'en servir pour taire le télégraphe muterait un joueur qui n'a jamais
              demandé le silence. */}
          <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-2 border-t border-[rgba(42,33,24,.22)] pt-[14px]">
            <div className="min-w-[180px] flex-1">
              <div className="text-[13.5px] text-[var(--ink)]">{fr.settingsWindow.soundLabel}</div>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.soundNote}
              </p>
            </div>
            <button
              type="button"
              aria-pressed={sound}
              onClick={() => {
                setSound(!sound);
                keepTelegraphSound(!sound);
              }}
              className={
                sound
                  ? 'shrink-0 cursor-pointer border border-[var(--ink)] bg-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--paper)] uppercase'
                  : 'shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]'
              }
            >
              {fr.settingsWindow.soundState(sound)}
            </button>
          </div>

          {/* La feuille d'entrée en campagne ne se rouvre d'office jamais : c'est ici, et
              nulle part ailleurs, qu'un joueur la retrouve. */}
          <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-2 border-t border-[rgba(42,33,24,.22)] pt-[14px]">
            <div className="min-w-[180px] flex-1">
              <div className="text-[13.5px] text-[var(--ink)]">
                {fr.settingsWindow.briefingLabel}
              </div>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.briefingNote}
              </p>
            </div>
            <button
              type="button"
              onClick={onShowBriefing}
              className="shrink-0 cursor-pointer border border-[var(--ink)] px-2 py-1 text-[9px] tracking-[.16em] text-[var(--ink)] uppercase hover:bg-[var(--ink)] hover:text-[var(--paper)]"
            >
              {fr.settingsWindow.briefingReopen}
            </button>
          </div>

          {/* **Le seul pouvoir de fondateur du plateau**, et il est rangé ici parce qu'une saison
              sans horloge n'a pas d'autre fin. Deux clics, comme la suppression d'une partie :
              c'est la même famille de geste, sauf que rien n'est effacé. */}
          {mayConclude && (
            <div className="mt-[18px] border-t border-[rgba(42,33,24,.22)] pt-[14px]">
              <div className="text-[13.5px] text-[var(--ink)]">
                {fr.settingsWindow.concludeLabel}
              </div>
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.concludeNote}
              </p>
              <DestroyButton
                label={fr.settingsWindow.conclude}
                confirm={fr.settingsWindow.concludeConfirm}
                note={fr.settingsWindow.concludeWarning}
                onDestroy={() => void conclude({ token }).catch(() => undefined)}
              />
            </div>
          )}

          {/* **Capituler vit à côté de clore**, et pour la même raison : ce sont les deux seules
              sorties d'une saison qu'un joueur décide, et elles prennent le même double clic.
              Une fois le geste fait il n'y a plus de bouton — la capitulation est irréversible,
              et un bouton qui ne rendrait rien serait un bouton qui ment. */}
          <div className="mt-[18px] border-t border-[rgba(42,33,24,.22)] pt-[14px]">
            <div className="text-[13.5px] text-[var(--ink)]">
              {fr.settingsWindow.surrenderLabel}
            </div>
            {defeated ? (
              <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                {fr.settingsWindow.surrendered}
              </p>
            ) : (
              <>
                <p className="mt-[3px] text-[11.5px] text-[var(--ink-soft)]">
                  {fr.settingsWindow.surrenderNote}
                </p>
                <DestroyButton
                  label={fr.settingsWindow.surrender}
                  confirm={fr.settingsWindow.surrenderConfirm}
                  note={fr.settingsWindow.surrenderWarning}
                  onDestroy={() => void surrender({ token }).catch(() => undefined)}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </FloatingWindow>
  );
}

function Step({
  sign,
  onClick,
  disabled,
}: {
  sign: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-6 w-6 shrink-0 cursor-pointer border border-[var(--ink)] text-[14px] leading-none text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {sign}
    </button>
  );
}
