/* global location, document */
// world.json (1,3 Mo) ne sert qu'au plateau : on le demande dès le HTML, en parallèle des
// chunks de la route, au lieu d'attendre que son loader démarre.
if (location.pathname.startsWith('/plateau')) {
  const link = document.createElement('link');
  Object.assign(link, { rel: 'preload', as: 'fetch', href: '/world.json', crossOrigin: 'anonymous' });
  document.head.append(link);
}
