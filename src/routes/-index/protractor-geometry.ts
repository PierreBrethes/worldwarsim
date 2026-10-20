import type { CSSProperties } from 'react';

/**
 * **La géométrie du rapporteur**, que l'accueil joue encore dans sa démo (`Board.tsx`) : le jeu
 * l'a quitté pour la barre basse (#179), la démo garde l'arc et ses ronds.
 */

/** L'arc où les ronds se posent, du ras du sol (à gauche) au ras du bord (en haut). Le premier et
 *  le dernier rond restent à un demi-rond du bord, sans quoi le pouce ne les attrape qu'à moitié. */
const RADIUS = 205;
const FIRST_DEG = 11;
const STEP_DEG = 68 / 6;

/** Où le rond de rang `rank` se pose sur l'arc, et dans quel ordre il sort puis rentre. */
export function roundAt(rank: number, count: number): CSSProperties {
  const angle = ((FIRST_DEG + rank * STEP_DEG) * Math.PI) / 180;
  return {
    '--x': `${Math.round(RADIUS * Math.cos(angle))}px`,
    '--y': `${Math.round(RADIUS * Math.sin(angle))}px`,
    '--rank': rank,
    '--back': count - 1 - rank,
  } as CSSProperties;
}

export const ARC_OUTER = RADIUS + 34;
export const ARC_INNER = RADIUS - 34;

export const ARC = (radius: number): CSSProperties => ({
  right: -radius,
  bottom: -radius,
  width: radius * 2,
  height: radius * 2,
});

export const ROUND =
  'protractor-round press float flex h-[48px] w-[48px] cursor-pointer flex-col items-center justify-center gap-[2px] rounded-full border border-[var(--ink)]';

export const LABEL = 'text-[7px] leading-none font-semibold tracking-[.08em] uppercase';
