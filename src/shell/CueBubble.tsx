/**
 * **La bulle** : où faire le geste du pas allumé, posée sur ce qu'elle désigne — une étagère du
 * plateau personnel, une pièce de la carte, la languette du plateau. Elle ne prend pas la main : le
 * geste se fait à travers elle. `place` la pose, au-dessus et au milieu par défaut.
 */
export function CueBubble({
  text,
  place = 'absolute bottom-[calc(100%+9px)] left-1/2 -translate-x-1/2',
}: {
  text: string;
  place?: string;
}) {
  return (
    <span
      role="note"
      className={`first-step-cue pointer-events-none z-10 w-max max-w-[220px] border border-[var(--ink)] bg-[var(--paper)] px-[8px] py-[4px] text-center font-(family-name:--font-body) text-[11.5px] leading-[1.25] font-semibold tracking-normal text-[var(--ink)] normal-case shadow-[0_2px_0_var(--arc-mine)] ${place}`}
    >
      {text}
    </span>
  );
}
