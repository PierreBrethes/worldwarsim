import { ResourcePlate } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
const all = ['food', 'textile', 'coal', 'oil', 'ore', 'alloy', 'ammunition', 'bandages'] as const;
export const OnPaper = () => (
  <div style={{ ...paper, ...row }}>
    {all.map((r) => (
      <ResourcePlate key={r} resource={r} height={36} />
    ))}
  </div>
);
export const OnDark = () => (
  <div style={{ ...desk, ...row }}>
    {all.map((r) => (
      <ResourcePlate key={r} resource={r} height={36} onDark />
    ))}
  </div>
);
export const Unboxed = () => (
  <div style={{ ...paper, ...row }}>
    {all.map((r) => (
      <ResourcePlate key={r} resource={r} height={24} boxed={false} />
    ))}
  </div>
);
