import { Gauge } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
const col = { display: 'grid', gap: 12, width: 260 } as const;
export const Reserve = () => (
  <div style={{ ...paper, ...col }}>
    <Gauge filled={0.2} inflow={4} height={8} />
    <Gauge filled={0.6} inflow={4} height={8} />
    <Gauge filled={0.9} inflow={4} height={8} />
    <Gauge filled={1.2} inflow={4} height={8} />
  </div>
);
export const Lot = () => (
  <div style={{ ...paper, ...col }}>
    <Gauge filled={0.45} height={8} />
    <Gauge filled={0.92} height={8} />
  </div>
);
export const OnDesk = () => (
  <div style={{ ...desk, ...col }}>
    <Gauge filled={0.35} inflow={2} onDark height={8} />
    <Gauge filled={0.97} inflow={2} onDark height={8} />
  </div>
);
