import { useCallback, useRef, useState } from 'react';

/**
 * Runs one task at a time and drops the calls that arrive meanwhile — a second press on a
 * button whose answer has not come back is the same wish, not a new one. The ref decides, the
 * state only tells the screen (to grey the button).
 */
export function useSingleFlight() {
  const flying = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(async <T>(task: () => Promise<T>): Promise<T | undefined> => {
    if (flying.current) return undefined;
    flying.current = true;
    setPending(true);
    try {
      return await task();
    } finally {
      flying.current = false;
      setPending(false);
    }
  }, []);

  return { run, pending };
}
