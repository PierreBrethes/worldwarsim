import { useEffect, useState } from 'react';
import { fr } from '@/i18n/fr';

/**
 * The launch is irreversible: it is watched, not clicked. The sequence engraves this passage
 * — seal, magnesium flash, title — then hands over to the board. It decides nothing: the
 * season is already launched server-side when it starts.
 */

const CUES = [
  { phase: 1, at: 0 },
  { phase: 2, at: 900 },
  { phase: 3, at: 1550 },
  { phase: 4, at: 3400 },
] as const;

const END = 4;

export function LaunchSequence({
  region,
  pace,
  players,
  onEnd,
}: {
  region: string;
  pace: string;
  players: number;
  onEnd: () => void;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = CUES.map(({ phase: cue, at }) => setTimeout(() => setPhase(cue), at));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (phase >= END) onEnd();
  }, [phase, onEnd]);

  return (
    <div className="fixed inset-0 z-[var(--z-veil)]">
      <div
        className="absolute inset-0 bg-[var(--desk)] transition-opacity duration-700"
        style={{ opacity: phase >= 2 ? 1 : 0 }}
      />

      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
        style={{ opacity: phase === 1 ? 1 : 0 }}
      >
        <div
          className="border-[3px] border-[var(--critical)] p-1 shadow-[0_0_60px_rgba(157,70,56,.25)]"
          style={{
            transition: 'transform .34s cubic-bezier(.16,1.5,.3,1)',
            transform: phase >= 1 ? 'rotate(-4deg) scale(1)' : 'rotate(-14deg) scale(2.5)',
          }}
        >
          <div className="border border-[var(--critical)] bg-[rgba(157,70,56,.06)] px-[30px] pt-4 pb-[14px] text-center text-[var(--critical)]">
            <div className="font-(family-name:--font-display) text-[38px] font-extrabold tracking-[.06em]">
              {fr.launchSequence.order}
            </div>
            <div className="mt-[6px] font-(family-name:--font-mono) text-[11px] tracking-[.3em] uppercase">
              {fr.launchSequence.sealed}
            </div>
          </div>
        </div>
      </div>

      {phase === 2 && (
        <div
          className="absolute inset-0 bg-[var(--paper)]"
          style={{ animation: 'magnesium-flash .5s ease-out forwards' }}
        />
      )}

      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-[10px] transition-opacity duration-500"
        style={{ opacity: phase === 3 ? 1 : 0 }}
      >
        <div className="font-(family-name:--font-mono) text-[11px] tracking-[.34em] text-[var(--notable)] uppercase">
          {fr.launchSequence.seed}
        </div>
        <div
          className="h-px bg-[var(--ink-quiet)]"
          style={{ transition: 'width .9s cubic-bezier(.2,.7,.2,1)', width: phase >= 3 ? 460 : 0 }}
        />
        <div className="font-(family-name:--font-display) text-[52px] font-extrabold tracking-[.06em] text-[var(--paper)]">
          {fr.launchSequence.season}
        </div>
        <div className="font-(family-name:--font-mono) text-[11px] tracking-[.28em] text-[var(--paper-dim)] uppercase">
          {fr.launchSequence.summary(region, pace, players)}
        </div>
      </div>

      <div aria-hidden className="absolute inset-0 shadow-[inset_0_0_200px_rgba(23,18,8,.55)]" />

      {phase < END && (
        <button
          type="button"
          onClick={() => setPhase(END)}
          className="absolute right-[22px] bottom-[18px] cursor-pointer border border-[var(--ink-quiet)] px-[14px] py-[7px] text-[10px] tracking-[.2em] text-[var(--paper-dim-2)] uppercase hover:border-[var(--paper)] hover:text-[var(--paper)]"
        >
          {fr.launchSequence.skip}
        </button>
      )}
    </div>
  );
}
