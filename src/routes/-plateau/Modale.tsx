import { useEffect, useRef, type ReactNode } from 'react';

export function Modale({
  onFermer,
  alignement = 'centre',
  children,
}: {
  onFermer: () => void;
  alignement?: 'haut' | 'centre';
  children: ReactNode;
}) {
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conteneur.current?.focus();
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape') {
        onFermer();
        return;
      }
      if (evenement.key !== 'Tab') return;
      const racine = conteneur.current;
      if (!racine) return;
      const focusables = racine.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const premier = focusables[0]!;
      const dernier = focusables[focusables.length - 1]!;
      if (evenement.shiftKey && document.activeElement === premier) {
        evenement.preventDefault();
        dernier.focus();
      } else if (!evenement.shiftKey && document.activeElement === dernier) {
        evenement.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [onFermer]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 z-40 flex justify-center overflow-auto bg-[rgba(23,18,8,.68)] ${
        alignement === 'haut' ? 'items-start px-6 py-[34px]' : 'items-center p-8'
      }`}
    >
      <div ref={conteneur} tabIndex={-1} className="hud outline-none">
        {children}
      </div>
    </div>
  );
}
