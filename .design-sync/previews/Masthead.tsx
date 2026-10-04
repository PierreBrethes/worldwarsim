import { Masthead } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Front = () => (
  <div style={{ ...paper, width: 560 }}>
    <Masthead date="Lundi 4 octobre 1943" />
  </div>
);
export const CustomDateline = () => (
  <div style={{ ...paper, width: 560 }}>
    <Masthead date="N° 214" dateline="Édition de la saison" wordmarkSize={40} />
  </div>
);
