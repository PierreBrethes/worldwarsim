import { HoverCard } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
const anchor = { position: 'relative', display: 'inline-block', padding: '4px 10px', border: '1px solid var(--ink)' } as const;
export const OneLine = () => (
  <div style={{ ...paper, height: 90 }}>
    <span style={anchor}>
      Charbon
      <HoverCard left={0}>Stock 1 240 · plafond 3 000</HoverCard>
    </span>
  </div>
);
export const Wrapped = () => (
  <div style={{ ...paper, height: 130 }}>
    <span style={anchor}>
      Alliage
      <HoverCard left={0} width={200}>
        Produit par la fonderie, à partir du minerai et du charbon de la région reliée.
      </HoverCard>
    </span>
  </div>
);
