import { useState, type ReactNode } from 'react';

/** `static`: the panel lets a parent container stack it instead of anchoring itself. */
type Position = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'static';

const ANCHORING: Record<Position, string> = {
  topLeft: 'absolute top-4 left-4',
  topRight: 'absolute top-4 right-4',
  bottomLeft: 'absolute bottom-[26px] left-4',
  bottomRight: 'absolute bottom-[26px] right-4',
  static: 'relative',
};

export function Panel({
  title,
  marker,
  position,
  width = 260,
  children,
}: {
  title: string;
  marker?: string;
  position: Position;
  width?: number;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section
      className={`hud paper-grain z-10 border border-[var(--ink)] ${ANCHORING[position]}`}
      style={{ width }}
    >
      <header className="flex items-center gap-2 border-b border-[var(--ink)] px-3 py-2">
        <span className="eyebrow flex-1">{title}</span>
        {marker && <span className="font-[var(--font-mono)] text-[9px] text-[var(--ink-soft)]">{marker}</span>}
        <button
          type="button"
          aria-expanded={!collapsed}
          title={collapsed ? 'déplier' : 'réduire'}
          onClick={() => setCollapsed((previous) => !previous)}
          className="h-[15px] w-[15px] shrink-0 cursor-pointer border border-[var(--ink)] text-[11px] leading-[13px] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]"
        >
          {collapsed ? '+' : '–'}
        </button>
      </header>
      {!collapsed && <div className="px-3 py-[10px]">{children}</div>}
    </section>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[rgba(42,33,24,.14)] py-[5px] last:border-0">
      <span className="text-[12.5px] text-[var(--ink-soft)]">{label}</span>
      <span className="font-[var(--font-mono)] text-[12.5px] text-[var(--ink)]">{value}</span>
    </div>
  );
}
