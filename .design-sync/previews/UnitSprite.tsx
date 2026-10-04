import { UnitSprite } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
const roles = ['infantry', 'armor', 'landTransport', 'fighter', 'bomber', 'airTransport', 'escort', 'cargo', 'carrier'] as const;
export const Britain = () => (
  <div style={{ ...paper, ...row }}>
    {roles.map((r) => (
      <UnitSprite key={r} nation="uk" role={r} height={56} width={72} />
    ))}
  </div>
);
export const Tiers = () => (
  <div style={{ ...paper, ...row }}>
    <UnitSprite nation="usa" role="infantry" tier={1} height={64} width={64} />
    <UnitSprite nation="usa" role="infantry" tier={2} height={64} width={64} />
    <UnitSprite nation="usa" role="armor" tier={1} height={64} width={96} />
    <UnitSprite nation="usa" role="armor" tier={2} height={64} width={96} />
  </div>
);
export const NoPlate = () => (
  <div style={{ ...paper, ...row }}>
    <UnitSprite nation="italy" role="carrier" height={56} width={96} />
  </div>
);
