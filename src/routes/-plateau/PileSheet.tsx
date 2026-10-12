import type { SheetLine } from '@/domain/pile-pieces';
import type { CargoView } from '@/domain/player-view';
import { RESOURCES } from '@/domain/ids';
import { resourceColor } from '@/emblems/ResourceIcon';
import { fr, roleLabel } from '@/i18n/fr';
import { ResourceAmounts } from './CargoReadout';

const INK = { ink: 'var(--ink)', ochre: 'var(--notable)', red: 'var(--critical)' } as const;

/** Read-only hover sheet of a posted pile: no button, so the pointer never needs to enter it. */
export function PileSheet({
  lines,
  cargo,
  at,
}: {
  lines: ReadonlyArray<SheetLine>;
  cargo: ReadonlyArray<CargoView>;
  at: { x: number; y: number };
}) {
  const loot = Object.fromEntries(
    RESOURCES.map((r) => [r, cargo.reduce((sum, c) => sum + (c.loot[r] ?? 0), 0)]),
  ) as CargoView['loot'];
  const carried = RESOURCES.reduce((sum, r) => sum + loot[r], 0);
  const capacity = cargo.reduce((sum, c) => sum + c.capacity, 0);
  return (
    <section
      className="hud paper-grain pointer-events-none absolute z-[var(--z-popin)] w-[200px] border border-[var(--ink)] bg-[var(--paper)] px-[10px] py-[8px]"
      style={{ left: at.x + 18, top: at.y + 18 }}
    >
      <span className="text-[9px] tracking-[.18em] text-[var(--ink-soft)] uppercase">
        {fr.troops.sheetKicker}
      </span>
      {lines.map((line) => (
        <div key={line.role} className="mt-[7px]" data-testid="sheet-line">
          <div className="flex items-baseline gap-[6px] text-[12px] font-bold text-[var(--ink)]">
            <span className="min-w-0 flex-1 truncate">{roleLabel(line.role, line.troops)}</span>
            {line.troops > 1 && (
              <span className="font-(family-name:--font-mono) text-[11px]">
                {fr.troops.sheetCount(line.troops)}
              </span>
            )}
            <span className="font-(family-name:--font-mono) text-[10.5px] font-normal">
              {fr.troops.sheetHealth(line.health)}
            </span>
          </div>
          <div className="mt-[3px] flex gap-[2px]">
            {Array.from({ length: 10 }, (_, i) => (
              <span
                key={i}
                data-inked={i < line.notches}
                className="h-[5px] flex-1 bg-(--ink)/16"
                style={i < line.notches ? { background: INK[line.ink] } : undefined}
              />
            ))}
          </div>
        </div>
      ))}
      {carried > 0 && (
        <div className="mt-[9px] border-t border-(color:--ink)/32 pt-[8px]">
          <div className="flex h-[6px] w-full bg-(--ink)/16">
            {RESOURCES.filter((r) => loot[r] > 0).map((r) => (
              <span
                key={r}
                className="h-full"
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
    </section>
  );
}
