import { createFileRoute, redirect } from '@tanstack/react-router';
import { announceArrival } from '@/data/arrival';
import { readSession } from '@/data/session';
import { Landing } from './-index/Landing';

/**
 * **L'adresse nue : l'accueil pour qui a un compte, la une pour les autres.** Le choix se fait
 * avant le rendu, sur le jeton gardé : la une n'a pas à clignoter sous les yeux d'un joueur
 * qu'on renvoie à ses parties — ou droit à sa partie, s'il n'en a qu'une qui l'attend
 * (`announceArrival`). Un jeton révoqué passe ici et c'est la porte de l'accueil (`__root.tsx`)
 * qui le renvoie à la connexion.
 */
export const Route = createFileRoute('/')({
  /** La une part avec le chunk d'entrée : détachée comme les autres pages, elle attendait un
   *  aller-retour de plus pour se peindre, et c'est la seule page qu'on ouvre sans rien en cache. */
  codeSplitGroupings: [],
  beforeLoad: () => {
    if (readSession() === null) return;
    announceArrival();
    throw redirect({ to: '/accueil' });
  },
  component: Landing,
});
