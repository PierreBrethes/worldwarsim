// Le routeTree est produit par le plugin Vite, donc absent de tout contexte sans Vite :
// `tsc --noEmit` en CI ou avant un push échouerait sur un module introuvable.
import { Generator, getConfig } from '@tanstack/router-generator';

const root = process.cwd();
await new Generator({ config: getConfig({ target: 'react' }, root), root }).run();
