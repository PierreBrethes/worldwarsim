import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import type { StepChip, TodoChip } from '@/domain/todo-chips';
import { ColumnChipsContext, MAT_LIFT_HUD, useBoardInsets } from '@/shell/viewport';

/** Air kept between the row and the map's buttons at its right, in screen pixels. */
const RIGHT_GAP_PX = 8;

/** What a chip says of the first steps, and where its click leads. */
export type StepChipProps = StepChip & { readonly go: string; readonly onPick: () => void };

/**
 * **« À faire » en pastilles, au-dessus de la bande du bas** (#713, bureau seulement) : une par
 * ligne de la liste, le chiffre, le libellé court et, quand la ligne a plusieurs cibles, le rang du
 * prochain clic. Un clic fait ce que fait la ligne. La rangée ne passe jamais à la ligne : quand la
 * place manque, les pastilles de droite ne gardent que leur chiffre — le libellé reste au `title` et
 * au nom accessible — et les premières gardent leur texte.
 *
 * Elle se déclare à la coque (`ColumnChipsContext`) pour que ses bords aillent aux insets du plateau.
 */
export function TodoChips({
  step,
  chips,
  rankOf,
  onPick,
}: {
  step: StepChipProps | null;
  chips: ReadonlyArray<TodoChip>;
  /** Le rang (de 0) de la cible que le prochain clic mène. */
  rankOf: (id: string) => number;
  onPick: (id: string) => void;
}) {
  const claim = useContext(ColumnChipsContext);
  const row = useRef<HTMLDivElement>(null);
  const right = useBoardInsets().right;
  const [screen, setScreen] = useState(() => window.innerWidth);
  useEffect(() => {
    const follow = () => setScreen(window.innerWidth);
    window.addEventListener('resize', follow);
    return () => window.removeEventListener('resize', follow);
  }, []);
  useLayoutEffect(() => {
    claim(row.current);
    return () => claim(null);
  }, [claim]);

  const room = screen - right - RIGHT_GAP_PX;
  /** Ce qui change la largeur de la rangée : on remesure de zéro à chaque changement. */
  const key = [
    room,
    step === null ? '' : `${step.progress}${step.word}${step.go}`,
    ...chips.map((chip) => `${chip.id}${chip.count}${chip.word}${rankOf(chip.id)}`),
  ].join('|');
  const [fit, setFit] = useState({ key, compact: 0 });
  const compact = fit.key === key ? fit.compact : 0;
  useLayoutEffect(() => {
    const box = row.current?.getBoundingClientRect();
    if (box !== undefined && box.right > room && compact < chips.length)
      setFit({ key, compact: compact + 1 });
  }, [key, room, compact, chips.length]);

  return (
    <div
      ref={row}
      role="group"
      aria-label={fr.nextActions.header}
      className="absolute left-full ml-[calc(var(--table-gap)/var(--hud-scale))] flex w-max flex-nowrap items-stretch gap-[6px] text-[var(--ink)]"
      style={{ bottom: MAT_LIFT_HUD }}
    >
      {step !== null && (
        <button
          type="button"
          title={step.title}
          onClick={step.onPick}
          className={`${CHIP} border-[var(--arc-mine)] bg-(--arc-mine)/10`}
        >
          <span className="text-[11px] font-semibold tracking-[.12em] text-[var(--arc-mine)] uppercase">
            {fr.firstSteps.header} {step.progress}
          </span>
          <span>{step.word}</span>
          <span className={GO}>{step.go} ›</span>
        </button>
      )}
      {chips.map((chip, at) => {
        const said = `${chip.count} ${chip.word}`;
        const short = at >= chips.length - compact;
        const rank = chip.targets > 1 ? `${rankOf(chip.id) + 1} / ${chip.targets} ›` : null;
        return (
          <button
            key={chip.id}
            type="button"
            title={rank === null ? said : `${said} — ${rank}`}
            aria-label={rank === null ? said : `${said}, ${rank.replace(' ›', '')}`}
            onClick={() => onPick(chip.id)}
            className={`${CHIP} border-[var(--ink)]`}
          >
            <span
              className={`font-(family-name:--font-mono) font-medium ${
                chip.alert ? 'text-[var(--critical)]' : ''
              }`}
            >
              {chip.count}
            </span>
            {!short && <span>{chip.word}</span>}
            {!short && rank !== null && <span className={GO}>{rank}</span>}
          </button>
        );
      })}
    </div>
  );
}

const CHIP =
  'press float paper-grain paper-hover flex h-[26px] shrink-0 cursor-pointer items-center gap-[6px] border px-[9px] text-[12px] leading-none font-semibold whitespace-nowrap';

const GO = 'text-[11px] tracking-[.1em] text-[var(--ink-soft)] uppercase';
