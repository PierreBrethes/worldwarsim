import type { ReactNode } from 'react';

export function Glyphe({ children, taille = 19 }: { children: ReactNode; taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconeJournal({ taille }: { taille?: number }) {
  return (
    <Glyphe {...(taille === undefined ? {} : { taille })}>
      <rect x="3" y="3.5" width="14" height="13" />
      <path d="M5 7h10M5 9.5h4.5M5 12h4.5M5 14.5h4.5M11.5 9.5H15v5h-3.5z" />
    </Glyphe>
  );
}
