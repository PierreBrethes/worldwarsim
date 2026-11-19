/** The volet's lines come in one after the other in a fade (#251, #580). */
export const CASCADE = {
  line: { from: 80, step: 35, duration: 195, most: 8 },
  easing: 'cubic-bezier(.2,.8,.2,1)',
} as const;

/** The first lines enter one after the other, in opacity and a 10 px rise. */
export function enter(lines: readonly Element[]) {
  const { line, easing } = CASCADE;
  lines.slice(0, line.most).forEach((one, rank) =>
    one.animate(
      [
        { opacity: 0, translate: '0 10px' },
        { opacity: 1, translate: '0 0' },
      ],
      { duration: line.duration, delay: line.from + rank * line.step, easing, fill: 'backwards' },
    ),
  );
}
