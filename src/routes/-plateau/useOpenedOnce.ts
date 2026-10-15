import { useEffect } from 'react';

/** Ouvre une seule fois par appareil : la clé retient que la page a déjà paru d'elle-même. */
export function useOpenedOnce(key: string | null, open: () => void): void {
  useEffect(() => {
    if (key === null) return;
    try {
      if (localStorage.getItem(key) !== null) return;
      localStorage.setItem(key, '1');
    } catch {
      /* sans stockage, elle s'ouvre à chaque chargement : mieux que jamais */
    }
    open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
