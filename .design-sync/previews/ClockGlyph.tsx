import { ClockGlyph } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Sizes = () => (
  <div style={{ ...paper, ...row }}>
    <ClockGlyph size={15} label="Durée" />
    <ClockGlyph size={28} label="Durée" />
    <ClockGlyph size={44} label="Durée" />
  </div>
);
