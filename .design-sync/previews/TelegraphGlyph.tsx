import { TelegraphGlyph } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Sizes = () => (
  <div style={{ ...paper, ...row }}>
    <TelegraphGlyph size={19} />
    <TelegraphGlyph size={32} />
    <TelegraphGlyph size={48} />
  </div>
);
