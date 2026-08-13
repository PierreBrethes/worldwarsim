import type { CategorieIndicateur } from '@/domaine/indicateurs';
import { Glyphe } from './Glyphe';

/**
 * Un picto par catégorie, et le même partout : celui que le rail allume est celui qui se pose
 * au bord de l'écran. Deux dessins pour une même catégorie feraient de la bascule une devinette.
 */
export function GlypheIndicateur({
  categorie,
  taille,
}: {
  categorie: CategorieIndicateur;
  taille?: number;
}) {
  return <Glyphe {...(taille === undefined ? {} : { taille })}>{TRACE[categorie]}</Glyphe>;
}

const TRACE: Readonly<Record<CategorieIndicateur, React.ReactNode>> = {
  'avant-postes': (
    <>
      <path d="M3.5 16.5h13" />
      <path d="M6 16.5V8l4-3 4 3v8.5" />
    </>
  ),
  chantiers: (
    <>
      <path d="M3.5 16.5h13" />
      <path d="M6.5 16.5V5.5h7" />
      <path d="M13.5 5.5v3.5" />
      <path d="M6.5 9 13.5 5.5" />
    </>
  ),
  forces: (
    <>
      <path d="M4 11.5 10 7l6 4.5" />
      <path d="M4 15.5 10 11l6 4.5" />
    </>
  ),
  'mes-mouvements': (
    <>
      <path d="M3.5 10h11" />
      <path d="M11 6.2 14.8 10 11 13.8" />
    </>
  ),
  'cap-sur-moi': (
    <>
      <path d="M16.5 10h-8" />
      <path d="M12.2 6.2 8.5 10l3.7 3.8" />
      <circle cx="4.6" cy="10" r="1.7" />
    </>
  ),
  renseignement: (
    <>
      <circle cx="8.8" cy="8.8" r="4.6" />
      <path d="m12.4 12.4 4 4" />
    </>
  ),
};
