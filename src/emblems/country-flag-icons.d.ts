/**
 * `country-flag-icons` expose bien `string/3x2/XX` dans son champ `exports`,
 * mais sans déclaration de types par drapeau. Chaque module est un SVG en chaîne.
 */
declare module 'country-flag-icons/string/3x2/*' {
  const svg: string;
  export default svg;
}
