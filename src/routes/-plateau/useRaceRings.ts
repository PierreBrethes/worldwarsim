import { useEffect, useMemo, useRef, useState } from 'react';
import type { RaceCountdown, StrategicPointView } from '@/domain/player-view';
import { fadingRingsOf, raceRingsOf, type RaceRings } from '@/domain/race-rings';

/** @a-mesurer : `compte-anneaux.html`, les anneaux du compte rompu s'effacent en 0,9 s. */
const FADE_MS = 900;

/**
 * **Les anneaux du compte, sur les mâts du meneur** (#442), et ceux qui s'effacent quand le compte
 * tombe en cours de partie — d'après les vues successives : une ouverture ne voit rien tomber.
 */
export function useRaceRings(
  race: RaceCountdown | null,
  points: ReadonlyArray<StrategicPointView>,
  concluded: boolean,
): RaceRings | null {
  const rings = useMemo(() => raceRingsOf(race, points), [race, points]);
  const before = useRef(rings);
  const [fading, setFading] = useState<RaceRings | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const was = before.current;
    before.current = rings;
    if (rings !== null || was === null || concluded) return;
    setFading(fadingRingsOf(was, points));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFading(null), FADE_MS);
  }, [rings, points, concluded]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return rings ?? (concluded ? null : fading);
}
