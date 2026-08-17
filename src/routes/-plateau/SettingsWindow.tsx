import { useState } from 'react';
import { fr } from '@/i18n/fr';
import {
  DEFAULT_HUD_SCALE,
  MAX_HUD_SCALE,
  MIN_HUD_SCALE,
  keepHudScale,
  readHudScale,
} from '@/data/settings';
import { DragHandle } from './Draggable';
import { FloatingWindow, type WindowProps } from './Window';

export function SettingsWindow({ onClose, ...windowProps }: WindowProps) {
  const [scale, setScale] = useState(readHudScale);

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
            <span className="font-[var(--font-mono)] text-[15px] text-[var(--ink)]">{scale} %</span>
          </div>
          <div className="mt-3 flex items-center gap-[10px]">
            <Step sign="–" onClick={() => set(scale - 10)} disabled={scale <= MIN_HUD_SCALE} />
            <div className="relative h-[6px] flex-1 bg-[rgba(42,33,24,.14)]">
              <div
                className="h-[6px] bg-[var(--interaction)]"
                style={{ width: `${((scale - MIN_HUD_SCALE) / (MAX_HUD_SCALE - MIN_HUD_SCALE)) * 100}%` }}
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
        </div>
      </div>
    </FloatingWindow>
  );
}

function Step({ sign, onClick, disabled }: { sign: string; onClick: () => void; disabled: boolean }) {
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
