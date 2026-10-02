import { useQueries } from 'convex/react';
import { useMemo, useState } from 'react';
import { api } from '../../convex/_generated/api';
import { errorMessage } from './errors';
import type { Seat } from './session';
import type { ServerView } from './serverView';

/**
 * **The live view, and what stands in for it while the line is down.** `useQuery` throws what the
 * server refuses, and a throw here reaches the route's error screen: the map is torn down under
 * the player for a timeout that lasts a second. `useQueries` hands the error back instead, and
 * the last answer keeps the board standing, flagged as `interrupted`.
 *
 * **An error the server meant still raises** — a code the game knows (session gone, season gone,
 * no seat) is the board's answer to "this is no longer yours", and swallowing it would leave a
 * dead board on screen. So does a failure with nothing known yet: no view to keep standing, and
 * hiding it would be a blank page with no way out.
 *
 * The queries object is memoized on its arguments for the reason written in `useAccount`
 * (`routes/__root.tsx`): `useQueries` compares it by identity.
 */
export function useBoardView(seat: Seat): {
  readonly server: ServerView | undefined;
  readonly interrupted: boolean;
} {
  const { token, seasonId } = seat;
  const queries = useMemo(
    () => ({ view: { query: api.view.playerView, args: { token, seasonId } } }),
    [token, seasonId],
  );
  const answer = useQueries(queries).view as ServerView | undefined | Error;
  const [known, setKnown] = useState<ServerView | undefined>(undefined);

  if (!(answer instanceof Error)) {
    // The documented way to derive state from a render: set it, React re-renders at once.
    if (answer !== known) setKnown(answer);
    return { server: answer, interrupted: false };
  }
  if (known === undefined || errorMessage(answer) !== null) throw answer;
  return { server: known, interrupted: true };
}
