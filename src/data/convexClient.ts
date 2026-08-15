import { ConvexReactClient } from 'convex/react';

const url: string | undefined = import.meta.env.VITE_CONVEX_URL;

/**
 * The only client. Everything the board reads is a live query, so there is nothing left for
 * a one-shot HTTP client to do — and keeping one meant two ways in, with two chances for a
 * screen to read a value the other had already replaced.
 *
 * `null` when no backend is configured: the home screen says so rather than failing.
 */
export const convexClient = url ? new ConvexReactClient(url) : null;
