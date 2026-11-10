import { createFileRoute } from '@tanstack/react-router';
import { Invitation } from './-rejoindre/Invitation';

export const Route = createFileRoute('/rejoindre/$code')({ component: Invitation });
