import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Coque } from '@/coque/Coque';
import type { Monde } from '@/domaine/monde';
import type { VueJoueur } from '@/domaine/vue-joueur';
import { chargerPartie } from '@/donnees/chargerPartie';
import { adapterVueServeur } from '@/donnees/chargerVueJoueurConvex';
import { clientConvex } from '@/donnees/clientConvex';
import { lireJeton } from '@/donnees/jeton';
import { SurfaceNation } from './-nation/SurfaceNation';

export const Route = createFileRoute('/nation')({
  loader: chargerPartie,
  pendingComponent: Chargement,
  component: Nation,
});

function Nation() {
  const { monde, vue } = Route.useLoaderData();
  const jeton = lireJeton();
  if (clientConvex && jeton) return <NationReactive monde={monde} vueInitiale={vue} jeton={jeton} />;
  return (
    <Coque vue={vue}>
      <SurfaceNation vue={vue} jeton={null} />
    </Coque>
  );
}

function NationReactive({
  monde,
  vueInitiale,
  jeton,
}: {
  monde: Monde;
  vueInitiale: VueJoueur;
  jeton: string;
}) {
  const serveur = useQuery(api.vue.vueJoueur, { jeton });
  const vue = serveur ? adapterVueServeur(monde, serveur) : vueInitiale;
  return (
    <Coque vue={vue}>
      <SurfaceNation vue={vue} jeton={jeton} />
    </Coque>
  );
}

function Chargement() {
  return (
    <div className="flex h-full items-center justify-center bg-[var(--desk)]">
      <span className="eyebrow-sombre">Ouverture de la fiche de nation…</span>
    </div>
  );
}
