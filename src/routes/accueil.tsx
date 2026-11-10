import { createFileRoute } from '@tanstack/react-router';
import { Home } from './-accueil/Home';

export const Route = createFileRoute('/accueil')({ component: Home });
