import { useEffect, useState } from 'react';

export function useHorloge(periodeMs = 1000): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(Date.now()), periodeMs);
    return () => clearInterval(minuteur);
  }, [periodeMs]);
  return maintenant;
}
