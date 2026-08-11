import { ConvexReactClient } from 'convex/react';
import { ConvexHttpClient } from 'convex/browser';

const url: string | undefined = import.meta.env.VITE_CONVEX_URL;

export const clientConvex = url ? new ConvexReactClient(url) : null;

export const clientConvexHttp = (): ConvexHttpClient | null => (url ? new ConvexHttpClient(url) : null);
