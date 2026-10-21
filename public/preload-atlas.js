/* global location, document */
// atlas.json (1,8 Mo) ne sert qu'au plateau : on le demande dès le HTML, en parallèle des
// chunks de la route, au lieu d'attendre que son loader démarre.
if (location.pathname.startsWith('/plateau')) {
  const link = document.createElement('link');
  Object.assign(link, { rel: 'preload', as: 'fetch', href: '/atlas.json', crossOrigin: 'anonymous' });
  document.head.append(link);
}
