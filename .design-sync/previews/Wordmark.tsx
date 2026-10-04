import { Wordmark } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Sizes = () => (
  <div style={{ ...paper, display: 'grid', gap: 16, justifyItems: 'start' }}>
    <Wordmark size={24} />
    <Wordmark size={48} />
  </div>
);
export const OnDesk = () => (
  <div style={{ ...desk }}>
    <Wordmark size={40} />
  </div>
);
