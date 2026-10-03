import { createFileRoute, redirect } from '@tanstack/react-router';
import { readSession } from '@/data/session';
import { FrontPage } from './-index/FrontPage';

/**
 * **L'adresse nue : l'accueil pour qui a un compte, la une pour les autres.** Le choix se fait
 * avant le rendu, sur le jeton gardé : la une n'a pas à clignoter sous les yeux d'un joueur
 * qu'on renvoie à ses parties. Un jeton révoqué passe ici et c'est la porte de l'accueil
 * (`__root.tsx`) qui le renvoie à la connexion.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (readSession() !== null) throw redirect({ to: '/accueil' });
  },
  component: FrontPage,
});
