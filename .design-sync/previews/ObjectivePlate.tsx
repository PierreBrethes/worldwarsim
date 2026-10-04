import { ObjectivePlate } from 'worldwarsim';
const paper = { background: 'var(--paper)', color: 'var(--ink)', padding: 16 } as const;
const row = { display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' } as const;
export const Archetypes = () => (
  <div style={{ ...paper, ...row }}>
    <ObjectivePlate objective="abandonedStores" label="Magasins abandonnés" height={72} />
    <ObjectivePlate objective="stalledConvoy" label="Convoi en panne" height={72} />
    <ObjectivePlate objective="fuelDump" label="Dépôt de carburant" height={72} />
    <ObjectivePlate objective="irregularArsenal" label="Arsenal irrégulier" height={72} />
  </div>
);
export const NoPlate = () => (
  <div style={{ ...paper, ...row }}>
    <ObjectivePlate objective="unknown" label="Réserve sans planche" height={72} />
  </div>
);
