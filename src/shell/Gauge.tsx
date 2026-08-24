/**
 * A reserve against its ceiling, **without writing the ceiling**. That is the whole point: the
 * eight ceilings were printed eighteen times across four surfaces and, without a warehouse,
 * all eight were the same number. A bar carries the ratio and says nothing.
 *
 * It reads in two places and therefore lives here rather than beside either: the banner draws
 * it on the desk, the industry window on paper. Same geometry, same threshold, two inks —
 * a second implementation would be a second threshold.
 *
 * **Saturation has to be visible from across the room.** A full gauge is not a neutral state,
 * it is production being lost every hour, and nothing on screen said so before.
 */
export const SATURATION_MARK = 0.85;

export function Gauge({
  filled,
  height = 5,
  onDark = false,
  inflow = null,
}: {
  /** Stock over ceiling, unclamped — a value above 1 is still drawn full. */
  filled: number;
  height?: number;
  onDark?: boolean;
  /**
   * What arrives every hour, and by its presence **that this bar measures a reserve**. The fill
   * then reads as a verdict on three steps — running, nearing the mark, spilling — and a light
   * sweeps it while something is actually coming in.
   *
   * `null` is a bar measuring anything else: a lot against its order keeps the plain ink,
   * because ninety percent of a lot is good news and ninety percent of a silo is not.
   */
  inflow?: number | null;
}) {
  const ratio = Math.max(0, Math.min(1, filled));
  // Only the green stretch sweeps: past the mark the inflow is the problem, and the colour
  // has already said so — a bar that celebrates what it is warning about says neither.
  const flowing = inflow !== null && inflow > 0 && ratio < SATURATION_MARK;

  return (
    <div
      className="relative w-full"
      style={{
        height,
        background: onDark ? 'rgba(228,216,189,.14)' : 'rgba(42,33,24,.07)',
        border: onDark ? 'none' : '1px solid var(--ink)',
      }}
    >
      <div
        className="absolute top-0 bottom-0 left-0 overflow-hidden"
        style={{ width: `${ratio * 100}%`, background: fillOf(ratio, onDark, inflow) }}
      >
        {flowing && <span aria-hidden className="gauge-inflow" />}
      </div>
      {/* The threshold where the figure comes back: above it, and only above it, the reserve
          writes how much room is left. Below, the bar is the whole answer. */}
      <div
        className="absolute w-px"
        style={{
          left: `${SATURATION_MARK * 100}%`,
          top: -2,
          bottom: -2,
          background: onDark ? 'rgba(228,216,189,.32)' : 'rgba(42,33,24,.55)',
        }}
      />
    </div>
  );
}

function fillOf(ratio: number, onDark: boolean, inflow: number | null): string {
  if (ratio >= 1) return 'var(--critical)';
  if (inflow === null) return onDark ? 'var(--notable)' : 'var(--ink)';
  if (ratio >= SATURATION_MARK) return onDark ? 'var(--notable)' : 'var(--notable-paper)';
  return onDark ? 'var(--valid-lit)' : 'var(--valid)';
}
