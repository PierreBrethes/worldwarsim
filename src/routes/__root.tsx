import { Outlet, createRootRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { fr } from '@/i18n/fr';
import { ErrorScreen } from '@/shell/ErrorScreen';
import { errorMessage } from '@/data/errors';
import { Notifications, notify } from '@/shell/notifications';

export const Route = createRootRoute({
  component: Root,
  errorComponent: ({ error, reset }) => <ErrorScreen error={error} reset={reset} />,
});

function Root() {
  // The last-row net: an orphan promise (mutation without `.catch`, timer…) becomes a
  // dismissible dispatch instead of silence. Render errors, in turn, climb to the routes'
  // `errorComponent`.
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      console.error(event.reason);
      notify(errorMessage(event.reason) ?? fr.unexpectedError);
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  return (
    <>
      <Outlet />
      <Notifications />
      <div className="grain" aria-hidden />
    </>
  );
}
