import { createFileRoute } from '@tanstack/react-router';
import { Credits } from './-credits/Credits';

export const Route = createFileRoute('/credits')({ component: Credits });
