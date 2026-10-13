import type { SheetLine } from '@/domain/pile-pieces';
import type { CargoView } from '@/domain/player-view';
import { RESOURCES } from '@/domain/ids';
import { resourceColor } from '@/emblems/ResourceIcon';
import { fr, roleLabel } from '@/i18n/fr';
import { ResourceAmounts } from './CargoReadout';

const INK = { ink: 'var(--ink)', ochre: 'var(--notable)', red: 'var(--critical)' } as const;

/** The body of a posted pile's poster (`MapPoster`): health in ten notches, then its load. */
export function PileSheet({
  lines,
  cargo,
}: {
  lines: ReadonlyArray<SheetLine>;
  cargo: ReadonlyArray<CargoView>;
}) {
  const loot = Object.fromEntries(
    RESOURCES.map((r) => [r, cargo.reduce((sum, c) => sum + (c.loot[r] ?? 0), 0)]),
  ) as CargoView['loot'];
  const carried = RESOURCES.reduce((sum, r) => sum + loot[r], 0);
  const capacity = cargo.reduce((sum, c) => sum + c.capacity, 0);
  return (
    <>
      {lines.map((line) => (
        <div key={line.role} className="map-poster-line" data-testid="sheet-line">
          <span>
            {roleLabel(line.role, line.troops)}
            {line.troops > 1 && (
              <b className="map-poster-num"> {fr.troops.sheetCount(line.troops)}</b>
            )}
          </span>
          <b className="map-poster-num">{fr.troops.sheetHealth(line.health)}</b>
          <div className="map-poster-hp">
            {Array.from({ length: 10 }, (_, i) => (
              <i
                key={i}
                data-inked={i < line.notches}
                style={i < line.notches ? { background: INK[line.ink] } : undefined}
              />
            ))}
          </div>
        </div>
      ))}
      {carried > 0 && (
        <div className="map-poster-load">
          <div className="map-poster-load-bar">
            {RESOURCES.filter((r) => loot[r] > 0).map((r) => (
              <b
                key={r}
                style={{
                  width: `${(100 * loot[r]) / Math.max(capacity, carried)}%`,
                  background: resourceColor(r, true),
                }}
              />
            ))}
          </div>
          <ResourceAmounts amounts={loot} />
        </div>
      )}
    </>
  );
}
