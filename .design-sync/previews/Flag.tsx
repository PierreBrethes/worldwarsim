import { Flag } from 'worldwarsim';
const paper = { background: "var(--paper)", color: "var(--ink)", padding: 16 } as const;
const desk = { background: "var(--map-desk)", color: "var(--paper)", padding: 16 } as const;
const row = { display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" } as const;
export const Nations = () => (
  <div style={{ ...paper, ...row }}>
    {['france', 'uk', 'usa', 'ussr', 'germany', 'japan', 'italy', 'china'].map((n) => (
      <Flag key={n} nation={n} onPaper />
    ))}
  </div>
);
export const OnDesk = () => (
  <div style={{ ...desk, ...row }}>
    <Flag nation="uk" width={27} />
    <Flag nation="france" width={48} />
  </div>
);
export const Unknown = () => (
  <div style={paper}>
    <Flag nation={null} onPaper width={48} />
  </div>
);
