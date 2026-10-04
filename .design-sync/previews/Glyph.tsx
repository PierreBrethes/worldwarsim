import { Glyph } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Custom = () => (
  <div style={{ ...paper, ...row }}>
    <Glyph size={32}>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 5v5l3 2" />
    </Glyph>
    <Glyph size={32}>
      <path d="M3 17L10 3l7 14z" />
    </Glyph>
  </div>
);
