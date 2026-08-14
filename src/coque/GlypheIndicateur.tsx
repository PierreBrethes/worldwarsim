import type { CSSProperties, ReactNode } from 'react';
import type { CategorieIndicateur } from '@/domaine/indicateurs';
import { Glyphe } from './Glyphe';

/**
 * Les pictogrammes du jeu. Port, aérodrome et caserne ne marquent encore rien : les bâtiments
 * de projection de l'ADR 0013 ne sont pas implémentés. Ils sont déclarés ici pour que le jour
 * venu il n'y ait qu'un câblage à écrire, jamais un dessin à retrouver.
 */
export type NomPicto =
  | 'avant-poste'
  | 'port'
  | 'aerodrome'
  | 'caserne'
  | 'chantier'
  | 'forces'
  | 'troupes'
  | 'production'
  | 'nation'
  | 'rejeu'
  | 'doctrine'
  | 'renseignement'
  | 'journal'
  | 'ravitaillement'
  | 'acier'
  | 'effectifs';

/** Deux corps par picto : dépouillé pour 20 px, détaillé pour 40 px. */
export type CorpsPicto = 20 | 40;

/**
 * Un picto est un masque, jamais un `<img>` : le PNG découpe, la `background-color` porte
 * l'encre. Tous les états restent donc pilotés par le `color` déjà en place — éteint/allumé du
 * rail, encres de catégorie, accent critique — au lieu de décliner un fichier par état.
 */
export function Picto({
  picto,
  corps,
  taille,
}: {
  picto: NomPicto;
  corps: CorpsPicto;
  taille: number;
}) {
  const decoupe = `url('/pictos/${picto}-${corps}.png')`;
  const masque: CSSProperties = {
    width: taille,
    height: taille,
    maskImage: decoupe,
    WebkitMaskImage: decoupe,
  };
  return <span className="picto" style={masque} aria-hidden />;
}

/**
 * Une marque par catégorie, et la même partout : celle que le rail allume est celle qui se
 * pose au bord de l'écran. Deux dessins pour une même catégorie feraient de la bascule une
 * devinette.
 *
 * Les catégories de choses portent leur pictogramme ; restent tracés les deux jalons de
 * mouvement, dont le trait fléché dit une direction là où un picto ne dirait qu'une nature.
 */
export function GlypheIndicateur({
  categorie,
  taille = 19,
}: {
  categorie: CategorieIndicateur;
  taille?: number;
}) {
  const marque = MARQUE[categorie];
  return 'picto' in marque ? (
    <Picto picto={marque.picto} corps={20} taille={taille} />
  ) : (
    <Glyphe taille={taille}>{marque.trace}</Glyphe>
  );
}

type Marque = { readonly picto: NomPicto } | { readonly trace: ReactNode };

const MARQUE: Readonly<Record<CategorieIndicateur, Marque>> = {
  'avant-postes': { picto: 'avant-poste' },
  chantiers: { picto: 'chantier' },
  forces: { picto: 'forces' },
  'mes-mouvements': {
    trace: (
      <>
        <path d="M3.5 10h11" />
        <path d="M11 6.2 14.8 10 11 13.8" />
      </>
    ),
  },
  'cap-sur-moi': {
    trace: (
      <>
        <path d="M16.5 10h-8" />
        <path d="M12.2 6.2 8.5 10l3.7 3.8" />
        <circle cx="4.6" cy="10" r="1.7" />
      </>
    ),
  },
  renseignement: { picto: 'renseignement' },
};
