import { Stamp } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Tones = () => (
  <div style={{ ...paper, ...row }}>
    <Stamp label="Désactivé" />
    <Stamp label="Hors réseau" tone="critical" />
    <Stamp label="Capitulé" size="small" />
    <Stamp label="Attaque subie" tone="critical" size="small" />
  </div>
);
export const OnDesk = () => (
  <div style={{ ...desk, ...row, ['--stamp-ink' as string]: 'var(--paper)' }}>
    <Stamp label="En chantier" />
    <Stamp label="À sec" tone="critical" />
  </div>
);
