import { BuildingPlate } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Extraction = () => (
  <div style={{ ...paper, ...row }}>
    {['farm', 'mill', 'mine', 'oilWell'].map((b) => (
      <BuildingPlate key={b} building={b as 'farm'} height={64} />
    ))}
  </div>
);
export const Industry = () => (
  <div style={{ ...paper, ...row }}>
    {['foundry', 'arsenal', 'quartermaster', 'warehouse'].map((b) => (
      <BuildingPlate key={b} building={b as 'foundry'} height={64} />
    ))}
  </div>
);
export const Projection = () => (
  <div style={{ ...paper, ...row }}>
    {['hq', 'barracks', 'airfield', 'port', 'listening', 'billets'].map((b) => (
      <BuildingPlate key={b} building={b as 'hq'} height={64} />
    ))}
  </div>
);
