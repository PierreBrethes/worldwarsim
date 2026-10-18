import type { ReactNode } from 'react';
import type { DepositKey } from '@/domain/ids';

/**
 * **The deposit marks of the board** (table d'état-major) : what a region holds, engraved the
 * way a 1940 staff map signs it — a derrick, a headframe and its spoil heap, crossed mining
 * hammers, a sheaf. Pen strokes and hatching in `currentColor`, the same hand as the
 * terrain drawn on hover; `ResourceIcon` keeps the filled silhouettes for the counters, where
 * 12 px leave no room for a hatch.
 */
const ENGRAVING: Readonly<Record<DepositKey, ReactNode>> = {
  // A sheaf tied at the waist: ears fanned above the band, stubble splayed below.
  food: (
    <>
      <path d="M12 13.2 6.2 5.4M12 13.2 9 3.8M12 13.2V3M12 13.2l3-9.4M12 13.2l5.8-7.8" />
      <path d="M12 13.2 7.6 21M12 13.2 10.3 21.3M12 13.2l1.7 8.1M12 13.2l4.4 7.8" />
      <path d="M9.2 12.1c1.8.9 3.8.9 5.6 0M9.2 14.3c1.8.9 3.8.9 5.6 0" />
      <g strokeWidth="1.1">
        <path d="M6.2 5.4 4.6 2.6M9 3.8 8.4 1.2M12 3V.6M15 3.8l.6-2.6M17.8 5.4l1.6-2.8" />
        <path d="M5.2 4.6 7 4.9M8.3 3l1.6.3M11.1 2h1.8M14.1 3.3l1.6-.3M17 4.9l1.8-.3" />
      </g>
      <path d="M5 21.6h14" strokeWidth="1" />
    </>
  ),
  // The pithead: a headframe and its wheel over the shaft, the spoil heap hatched beside it.
  coal: (
    <>
      <path d="M2.6 21.4h18.8" />
      <path d="M5 21.4 7.4 6.4M11 21.4 8.6 6.4M5.8 16.4h4.4M6.6 11.4h2.8M5.8 16.4l3.6-5M10.2 16.4l-3.6-5" />
      <circle cx="8" cy="4.6" r="2.4" />
      <path d="M8 4.6 13.6 12" strokeWidth="1" />
      <path d="M12.6 21.4c1.6-4.4 3.4-6.8 5-6.8s2.6 2.4 3.6 6.8" />
      <path d="M17.2 15.6 15 21.4M18.8 15.8l-2 5.6M20 17.4l-1.4 4" strokeWidth="1" />
    </>
  ),
  // The derrick: a braced lattice tower on its ground, the crown block on top.
  oil: (
    <>
      <path d="M4 21.4h16" />
      <path d="M7.6 21.4 10.9 4h2.2l3.3 17.4" />
      <path d="M8.5 16.6h7M9.5 11.4h5M10.3 7.2h3.4" strokeWidth="1.1" />
      <path
        d="m7.6 21.4 7.9-4.8M16.4 21.4l-7.9-4.8M8.5 16.6l6-5.2M15.5 16.6l-6-5.2M9.5 11.4l3.8-4.2M14.5 11.4l-3.8-4.2"
        strokeWidth="1"
      />
      <path d="M10.2 2.2h3.6V4h-3.6z" fill="currentColor" />
    </>
  ),
  // Schlägel und Eisen, the miners' crossed hammers: the mark every staff map gives a mine.
  iron: (
    <>
      <path d="M5.4 20.6 17 7.4M18.6 20.6 7 7.4" strokeWidth="1.8" />
      <path d="m13.8 4.6 6.2 5.6 1.8-2-6.2-5.6z" fill="currentColor" />
      <path d="m10.2 4.6-6.2 5.6-1.8-2 6.2-5.6z" />
      <path d="m8.8 4.4-4 4.4M7.4 3.6l-3.6 4" strokeWidth="0.9" />
    </>
  ),
};

/** Drawn on 24 units like `ResourceIcon`, and called the same way, so a deposit label swaps one
 *  for the other without touching its box. */
export function DepositMark({ resource, size = 18 }: { resource: DepositKey; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ENGRAVING[resource]}
    </svg>
  );
}
