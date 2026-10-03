---
type: prompt
statut: validé
maj: 2026-10-03
code: [convex/pushSend.ts, deploiement/README.md]
decisions: [notif-1a-2026-10-03]
voir: [../code/done/notifications-serveur.md, ../code/done/notifications-appareil.md]
---

# cles-vapid — poser les clés des notifications sur le Convex du VPS

**En bref.** Prompt pour le Claude du VPS, à lancer après le déploiement du lot serveur des
notifications. Il génère la paire de clés VAPID et la pose dans l'environnement du Convex
auto-hébergé, sans qu'aucune clé privée ne passe dans la conversation ni dans le dépôt.

## Le prompt (à coller tel quel)

Tu es sur le VPS de La Manchette (nom de code worldwarsim), dépôt dans `/opt/worldwarsim`,
redéployé par la CI : n'y modifie aucun fichier suivi par git. Ne commit pas, ne push pas.

But : poser trois variables d'environnement sur le backend Convex auto-hébergé
(`https://convex.pierrebrethes.cloud`) pour les notifications Web Push, comme le décrit
`deploiement/README.md` § 5 bis.

1. Génère une paire de clés VAPID avec `web-push generate-vapid-keys --json`, depuis un conteneur
   `node:24-alpine` jetable si Node n'est pas installé sur l'hôte.
2. Range la paire dans `/root/la-manchette-vapid.json`, droits 600, hors du dépôt : c'est la
   sauvegarde (changer de paire désabonne tous les appareils).
3. Obtiens une clé d'administration du backend (`./generate_admin_key.sh` dans le conteneur
   `backend` du compose), sans l'écrire dans un fichier.
4. Avec la CLI Convex (`convex env set`, variables `CONVEX_SELF_HOSTED_URL` et
   `CONVEX_SELF_HOSTED_ADMIN_KEY`, depuis `/opt/worldwarsim` ou un conteneur Node qui le monte en
   lecture seule), pose `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, et `VAPID_SUBJECT` à
   `https://wws.pierrebrethes.cloud`.
5. Vérifie avec `convex env list` que les trois noms existent.

**N'affiche jamais la clé privée ni la clé d'administration** : ni dans tes réponses, ni dans une
commande que tu me montres en clair. Rapporte en trois lignes : les trois noms posés, où est la
sauvegarde, et la clé publique (elle n'est pas secrète).
