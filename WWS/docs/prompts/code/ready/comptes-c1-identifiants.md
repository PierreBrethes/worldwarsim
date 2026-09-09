# Comptes C1 — identifiants et hachage

**État : prêt à exécuter après la validation des inscriptions et la libération du code par le chantier du pillage.**
Pierre autorise la suite le 09/09/2026. Ce lot commence les comptes déjà acceptés dans
l'[ADR 0022](../../../adr/0022-comptes-pseudo-et-mot-de-passe.md), sans activer un nouveau
parcours de connexion. La [direction V1](../../../design/propositions/direction-v1-2026-09-09.md)
confirme pseudo et mot de passe, accès sur plusieurs appareils et petits lots autonomes.

**But :** livrer les règles communes des identifiants et un hachage de mot de passe testé,
réutilisables par les futures portes d'inscription et de connexion.

**Architecture :** règles de saisie pures dans le domaine ; cryptographie côté serveur,
via Web Crypto. Aucun changement de schéma, de jeton de partie, de mutation publique ou
d'interface dans C1. Les parties actuelles restent lisibles et jouables comme avant.

**Outils :** TypeScript strict, Web Crypto, Vitest déjà installé. Pas de dépendance ajoutée.
Appliquer le skill d'exécution de plan ou de développement par sous-agent avec un seul auteur.

## Contraintes de travail

- Dossier habituel, sans worktree, commit, push ou déploiement.
- Relire les instructions actuelles, `CONVENTIONS.md` et l'ADR 0022.
- Ne pas exécuter globalement l'ancien brief `comptes.md` : son remplacement d'identité et
  sa remise à zéro appartiennent à une bascule ultérieure, pas à C1.
- Attendre la fin effective des écritures du pillage et de la finition des inscriptions.
  Conserver leurs modifications ; leurs erreurs éventuelles ne se corrigent pas dans C1.
- Lire seulement ce brief et les fichiers utiles ; inutile de reprendre l'historique vocal.
- Le code est en anglais. C1 n'introduit aucun texte affiché au joueur.

## Fichiers et interfaces

Créer uniquement :

- `src/domain/account.ts` et `src/domain/account.test.ts` : normalisation et bornes.
- `convex/passwords.ts` et `convex/passwords.test.ts` : hachage et vérification, sans fonction
  Convex publique. Ce module n'est jamais importé par le client.

Contrat de domaine :

```ts
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;
export const PASSWORD_MIN_BYTES = 8;
export const PASSWORD_MAX_BYTES = 72;

export function normalizeNickname(nickname: string): string;
export function nicknameKey(nickname: string): string;
export function nicknameRefusal(nickname: string): 'NICKNAME_INVALID' | null;
export function passwordRefusal(
  password: string,
): 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' | null;
```

Interprétations techniques retenues : retirer les espaces aux extrémités du pseudo et le
normaliser en NFC pour l'affichage ; compter ses points de code après normalisation ; refuser
les caractères de contrôle ou de format invisibles. La clé d'unicité est en minuscules, sans
marques combinantes après NFD, conformément au brief existant. Le nom affiché garde ses
accents. Ne jamais retirer des espaces, tronquer ou normaliser un mot de passe : ses bornes
se mesurent avec `TextEncoder`, en octets UTF-8.

Contrat serveur :

```ts
export const PBKDF2_ITERATIONS = 600_000;
export type PasswordDigest = Readonly<{
  passwordHash: string;
  salt: string;
  iterations: number;
}>;
export function hashPassword(password: string): Promise<PasswordDigest>;
export function verifyPassword(password: string, digest: PasswordDigest): Promise<boolean>;
```

PBKDF2-SHA-256, sel aléatoire de 16 octets et sortie de 32 octets. Sérialiser sel et résultat
en base64url sans remplissage. `hashPassword` utilise toujours les itérations courantes ;
`verifyPassword` utilise celles conservées dans le digest. Comparer les 32 octets sans sortie
anticipée sur la première différence. Une longueur ou un encodage de digest invalide rend
`false` ; une panne de Web Crypto reste une erreur technique, jamais un mot de passe incorrect.
L'application des bornes de saisie aux futures mutations appartient à C2 ; C1 teste déjà
la règle partagée et n'invente pas de nouvelle porte serveur.

## Exécution et preuves attendues

- [ ] Écrire puis lancer les tests du domaine avant l'implémentation. Vérifier notamment :

  ```ts
  expect(nicknameKey('  Pièrre  ')).toBe('pierre');
  expect(nicknameKey('Le\u0301a')).toBe(nicknameKey('Léa'));
  expect(nicknameRefusal('Pi')).toBe('NICKNAME_INVALID');
  expect(nicknameRefusal('P'.repeat(16))).toBeNull();
  expect(nicknameRefusal('P'.repeat(17))).toBe('NICKNAME_INVALID');
  expect(passwordRefusal('é'.repeat(4))).toBeNull();
  expect(passwordRefusal('é'.repeat(36))).toBeNull();
  expect(passwordRefusal('é'.repeat(36) + 'a')).toBe('PASSWORD_TOO_LONG');
  ```

- [ ] Implémenter les fonctions pures et compléter les cas pseudo vide/invisible, espaces,
      mot de passe à 7 et 8 octets, et Unicode. Lancer les tests du domaine.
- [ ] Écrire les tests cryptographiques : sel et digest aux tailles attendues ; résultat
      différent avec deux sels ; mot de passe correct accepté, autre refusé ; espaces de début
      et de fin significatifs ; digest malformé refusé. Employer une fixture PBKDF2 connue,
      produite indépendamment de la fonction testée, pour vérifier aussi la lecture du nombre
      d'itérations stocké. Ne pas simuler Web Crypto pour les cas de conformité.
- [ ] Implémenter puis lancer les tests cryptographiques. Ne pas promettre une comparaison
      physiquement en temps constant sur tout moteur JavaScript ; la propriété vérifiée du code
      est l'absence d'arrêt précoce dépendant de l'octet incorrect.
- [ ] Exécuter les contrôles ciblés :

  ```sh
  npm test -- src/domain/account.test.ts convex/passwords.test.ts
  npm run types
  npx --no-install eslint src/domain/account.ts src/domain/account.test.ts convex/passwords.ts convex/passwords.test.ts
  npx --no-install prettier --check src/domain/account.ts src/domain/account.test.ts convex/passwords.ts convex/passwords.test.ts
  ```

- [ ] Revue courte du contrat, de la sérialisation et de l'absence de secret dans les traces.
      Après deux corrections infructueuses, diagnostic ciblé avant de relancer.
- [ ] Bilan : fichiers, tests réellement passés et réserve de runtime. Ne pas annoncer des
      comptes jouables : aucune inscription utilisateur ni connexion UI n'est livrée dans C1.

## Vérification du runtime

La [documentation Convex](https://docs.convex.dev/functions/runtimes) annonce Web Crypto
dans le runtime par défaut et réserve Node.js aux actions. Le
[code Rust officiel du PBKDF2](https://github.com/get-convex/convex-backend/blob/main/crates/isolate/src/ops/subtle_crypto/pbkdf2.rs)
confirme SHA-256 et la transmission du nombre d'itérations à la primitive native ;
600 000 est accepté par ce contrat. Source relue le 09/09/2026, branche amont courante,
sans identification de la version installée sur le VPS. Les tests du dépôt utilisent
`edge-runtime` via `vite.config.ts` ; ils ne prouvent pas la version du backend sur le VPS.
Les [limites documentées](https://docs.convex.dev/production/state/limits) des mutations
imposent aussi de vérifier le coût du hachage avant de choisir les portes publiques de C2.

Conserver une distinction explicite : conformité cryptographique locale, support du runtime
amont, exécution dans le backend auto-hébergé installé. Ne pas déployer de sonde sur le VPS
dans ce lot. Si le runtime réellement ciblé ne convient pas, C2 utilisera une action Node
et une mutation interne atomique ; C1 ne change pas d'infrastructure pour le deviner.

## Lots suivants, pas inclus dans cette exécution

1. **C2 — Comptes et sessions serveur.** Tables nouvelles, inscription atomique avec contrôle
   d'unicité par index, connexion, déconnexion et récupération admin interne. Plusieurs
   sessions indépendantes. Les tables d'identité survivent à la suppression d'une saison ;
   adapter les invariants qui supposent aujourd'hui que toutes les tables sont saisonnières.
2. **C3 — Accès aux parties et interface.** Rattacher une place au compte, remplacer la
   résolution de l'identité dans les onze modules serveur concernés, puis connexion,
   accueil et réglages. Préserver le refus serveur des nouvelles inscriptions après deux
   heures, l'accès des inscrits et le brouillard propre à chaque joueur.
3. **Bascule.** Résoudre le devenir des places historiques avant activation. Le brief ancien
   prévoyait leur effacement ; aucune suppression de données n'est autorisée par C1.

Ces frontières évitent que l'ajout de deux champs de saisie entraîne d'un coup une réécriture
de tous les accès et une remise à zéro des parties.
