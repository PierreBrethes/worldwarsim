import { createFileRoute } from '@tanstack/react-router';
import { Edition } from './-edition/Edition';

export const Route = createFileRoute('/edition/$id')({ component: Edition });
