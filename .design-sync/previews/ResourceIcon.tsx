import { ResourceIcon } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
const all = ['food', 'textile', 'coal', 'oil', 'ore', 'alloy', 'ammunition', 'bandages'] as const;
export const Small = () => (
  <div style={{ ...paper, ...row }}>
    {all.map((r) => (
      <ResourceIcon key={r} resource={r} />
    ))}
  </div>
);
export const Large = () => (
  <div style={{ ...paper, ...row }}>
    {all.map((r) => (
      <ResourceIcon key={r} resource={r} size={32} />
    ))}
  </div>
);
