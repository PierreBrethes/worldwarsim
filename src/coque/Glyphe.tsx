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
