import { Navigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { forgetSeat } from '@/data/session';

/**
 * Une place que le serveur ne reconnaît plus — une saison détruite, une entrée locale
 * périmée. Ce n'est pas une panne : la place est oubliée et le joueur revient à l'accueil, où
 * « reprendre » cesse simplement d'être proposé. **La session, elle, ne bouge pas** : le compte
 * est bon, c'est la partie qui n'est plus là.
 *
 * L'oubli se fait dans un effet et non au rendu : `forgetSeat` prévient ses abonnés, et écrire
 * dans un store pendant le rendu d'un autre composant est exactement ce qui fait râler React.
 */
export function StaleSeat({ to }: { to: '/accueil' | '/salon' }) {
  useEffect(forgetSeat, []);
  return <Navigate to={to} replace />;
}
