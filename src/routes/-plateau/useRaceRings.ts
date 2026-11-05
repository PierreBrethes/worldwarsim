import { useEffect, useMemo, useRef, useState } from 'react';
import type { RaceCountdown, StrategicPointView } from '@/domain/player-view';
import { fadingRingsOf, raceRingsOf, type RaceRings } from '@/domain/race-rings';

/** @a-mesurer : `compte-anneaux.html`, les anneaux du compte rompu s'effacent en 0,9 s. */
const FADE_MS = 900;
/** Le tracé des anneaux (`race-trace`, `labels.css`) : 1,8 s d'attente, 1,4 s de plume. */
const TRACE_MS = 3200;

/**
 * **Les anneaux du compte, sur les mâts du meneur** (#442), et ceux qui s'effacent quand le compte
 * tombe en cours de partie — d'après les vues successives : une ouverture ne voit rien tomber, ni
 * partir. Un compte parti entre deux vues est `fresh` le temps de son tracé, pas au-delà : un
 * anneau remonté plus tard ne se retrace pas.
 */
export function useRaceRings(
  race: RaceCountdown | null,
  points: ReadonlyArray<StrategicPointView>,
  concluded: boolean,
): RaceRings | null {
  const [opening] = useState(race?.endsAt ?? null);
  const [traced, setTraced] = useState<number | null>(null);
  const endsAt = race?.endsAt ?? null;
  const fresh = endsAt !== null && endsAt !== opening && endsAt !== traced;
  useEffect(() => {
    if (!fresh) return;
    const done = setTimeout(() => setTraced(endsAt), TRACE_MS);
    return () => clearTimeout(done);
  }, [fresh, endsAt]);
  const rings = useMemo(() => {
    const now = raceRingsOf(race, points);
    return now !== null && fresh ? { ...now, fresh } : now;
  }, [race, points, fresh]);
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
