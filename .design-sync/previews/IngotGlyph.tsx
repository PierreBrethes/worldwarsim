import { IngotGlyph } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Sizes = () => (
  <div style={{ ...paper, ...row }}>
    <IngotGlyph size={15} label="Lingot d'alliage" />
    <IngotGlyph size={28} label="Lingot d'alliage" />
    <IngotGlyph size={44} label="Lingot d'alliage" />
  </div>
);
