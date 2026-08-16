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
}: {
  /** Stock over ceiling, unclamped — a value above 1 is still drawn full. */
  filled: number;
  height?: number;
  onDark?: boolean;
}) {
  const ratio = Math.max(0, Math.min(1, filled));
  const saturated = ratio >= 1;

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
        className="absolute top-0 bottom-0 left-0"
        style={{
          width: `${ratio * 100}%`,
          background: saturated ? 'var(--critical)' : onDark ? 'var(--notable)' : 'var(--ink)',
        }}
      />
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
