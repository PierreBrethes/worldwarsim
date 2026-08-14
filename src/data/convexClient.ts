import { ConvexReactClient } from 'convex/react';
import { ConvexHttpClient } from 'convex/browser';

const url: string | undefined = import.meta.env.VITE_CONVEX_URL;

export const convexClient = url ? new ConvexReactClient(url) : null;

export const convexHttpClient = (): ConvexHttpClient | null => (url ? new ConvexHttpClient(url) : null);
