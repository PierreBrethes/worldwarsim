import { FlagBanner } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Pick = () => (
  <div style={{ ...paper, width: 240 }}>
    <FlagBanner nation="france" />
  </div>
);
export const Pair = () => (
  <div style={{ ...paper, display: 'flex', gap: 12, width: 420 }}>
    <FlagBanner nation="germany" />
    <FlagBanner nation={null} />
  </div>
);
