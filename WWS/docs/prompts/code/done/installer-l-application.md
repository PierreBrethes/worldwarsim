---
type: prompt
statut: livré
maj: 2026-10-03
code: [index.html, public/favicon.svg, public/manifest.webmanifest, public/icons, public/apple-touch-icon.png, public/og-image.png, deploiement/front.Dockerfile, deploiement/compose.prod.yml, deploiement/nginx.conf, src/i18n/name.test.ts]
decisions: [marque-icone-2026-10-03, marque-apercu-2026-10-03]
voir: [../../../marque/marque-et-site.md, ../../../marque/charte.md]
---

# installer-l-application — l'icône, le manifeste et l'aperçu du lien

**En bref.** Premier morceau du lot D : La Manchette s'installe sur l'écran d'accueil d'un
téléphone avec sa propre icône, et un lien d'invitation envoyé dans une messagerie s'affiche avec
une image, un titre et une phrase. Pas encore de notifications : elles viendront avec un service
worker, dans un prompt à part.

> Décisions de Pierre du 03/10/2026 : marque-icone-2026-10-03 (l'icône « la feuille » partout,
> le favicon d'onglet redessiné avec un filet épaissi) et marque-apercu-2026-10-03 (l'aperçu
> « la carte », le même pour toutes les invitations). Maquettes : « La Manchette — icônes et
> aperçu » (https://claude.ai/artifact/BGYTaPCDx6ew3UdsqNZ8jk) ; planche de contrôle :
> `Claude outputs/marque/icones/controle.png`.

Lis `CLAUDE.md`, `CONVENTIONS.md`, `index.html`, `deploiement/` (Dockerfile, compose, nginx,
README), `src/i18n/name.test.ts`. Ne commit pas, ne push pas. Un chantier, un commit.

## 1. Les fichiers, copiés tels quels

Depuis `Claude outputs/marque/icones/`, à l'octet près (ne les régénère pas, ne les compresse pas) :

| Source | Destination |
|---|---|
| `favicon.svg` | `public/favicon.svg` (remplace le pavé rouge) |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | `public/icons/` |
| `icon.svg`, `icon-maskable.svg` | `public/icons/` (les sources vectorielles, pour les refaire) |
| `apple-touch-icon.png` (180 px) | `public/apple-touch-icon.png` (iOS le cherche aussi à la racine) |
| `og-image.png` (1200 × 630) | `public/og-image.png` |

## 2. Le manifeste

`public/manifest.webmanifest` : `name` et `short_name` « La Manchette », `description` (la phrase
du §3), `lang: "fr"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`,
`background_color` et `theme_color` à `#0f0a04` (le bureau, `--desk`), et les icônes :
192 et 512 en `purpose: "any"`, la masquable 512 en `purpose: "maskable"`. Vérifie que Nginx le
sert en `application/manifest+json` (ajoute le type dans `nginx.conf` si l'image ne le connaît pas).

## 3. `index.html`

- `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="apple-touch-icon"
  href="/apple-touch-icon.png">`, `<meta name="theme-color" content="#0f0a04">`,
  `<meta name="apple-mobile-web-app-title" content="La Manchette">`.
- `<meta name="description">` et les balises d'aperçu : `og:type` website, `og:site_name` et
  `og:title` « La Manchette », `og:description`, `og:image` (+ `:width` 1200, `:height` 630,
  `:alt`), `og:locale` fr_FR, `twitter:card` summary_large_image. La phrase, partout la même :
  « Stratégie entre amis sur une carte du monde réel : 2 à 8 joueurs, une saison de sept jours. »
  `og:image:alt` : « La Manchette : une feuille de journal posée sur la carte du jeu. »
- **`og:image` doit être une adresse absolue**, et le domaine changera peut-être : une seule
  source. Utilise le remplacement de variables HTML de Vite (`%VITE_PUBLIC_ORIGIN%/og-image.png`),
  déclare `VITE_PUBLIC_ORIGIN` comme `VITE_CONVEX_URL` (argument du Dockerfile, valeur dans le
  compose de prod, `https://wws.pierrebrethes.cloud` par défaut) et garde le typage des variables
  d'environnement à jour. Une build sans la variable doit échouer ou tomber sur la valeur par
  défaut, jamais produire `%VITE_PUBLIC_ORIGIN%` en clair.
- Les messageries lisent la page sans exécuter le JavaScript : ces balises sont donc les mêmes
  pour toutes les routes, `/rejoindre/<code>` compris. C'est voulu (marque-apercu-2026-10-03).
  N'ajoute pas d'`og:url`.

## 4. Le garde-fou

Dans `src/i18n/name.test.ts`, le test qui compare `public/favicon.svg` à un fichier de
`Claude outputs/` disparaît (ce dossier n'est pas suivi par la CI et sera supprimé). À la place,
un test des actifs d'installation : le manifeste se lit en JSON, chaque icône qu'il cite existe et a
les dimensions annoncées (lis la largeur et la hauteur dans l'en-tête PNG, sans dépendance),
`index.html` cite le manifeste, l'icône Apple et `og-image.png`, et `public/favicon.svg` porte
bien les trois couleurs de la charte (`#e4d8bd`, `#2a2118`, `#9d4638`).

## Ne pas faire

Pas de service worker, pas de notification, pas d'invite d'installation dans l'interface, pas
d'aperçu différent par partie. Ne touche pas au `Wordmark` ni au reste de la charte.

## Acceptation

- `npm run verifier` vert.
- En local (`npm run build && npm run preview`) : l'onglet affiche la nouvelle icône ; l'onglet
  Application des outils de Chrome lit le manifeste sans erreur et montre les trois icônes ; le
  HTML servi contient l'`og:image` absolue.
- Dis à Pierre comment vérifier après le déploiement : ajouter le site à l'écran d'accueil d'un
  iPhone et d'un Android, et envoyer un lien `/rejoindre/…` dans une conversation (les messageries
  gardent un aperçu en cache : tester avec un lien jamais envoyé).
- `WWS/docs/marque/marque-et-site.md` (lot D) et `WWS/docs/marque/actifs.md` (icônes, aperçu) à jour.
