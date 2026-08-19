# Prompt Claude Code — le second manque déclaré (Japon)

Lis `WWS/docs/adr/0015-economie-v2-ressources-localisees.md`, en particulier la révision
du 15/08 et la section « Les exceptions se déclarent, elles ne se contournent pas ».
Ne commit pas, ne push pas.

Petite passe sur `scripts/generate-deposits.mjs` uniquement.

## Contexte

Tu as eu raison de refuser « vise 0 en minerais pour le Japon » : le prompt violait l'ADR.
La contradiction venait d'ailleurs — la révision de l'ADR disait la règle « remplacée » alors
que le script l'applique toujours. L'ADR est corrigée : **la règle du manque unique reste**,
parce qu'elle protège la promesse anti-élimination, **et elle devient exceptionnable sur
déclaration**, exactement comme le `noGap` américain que tu as déjà implémenté.

## Travail

1. **`secondGap` dans le profil**, symétrique de `noGap` : une nation peut déclarer une
   seconde ressource manquante, avec sa justification. Le champ porte la ressource et le
   *pourquoi* — pas un booléen muet.

2. **Le Japon est le seul cas** : `secondGap: 'ore'`. Retire Kamaishi. La justification à
   inscrire : le Japon de 1940 n'a ni pétrole ni fer, et son porte-avions n'existe dans ce
   jeu que pour aller les chercher — l'atout répond précisément au manque. C'est la
   condition d'une exception recevable ; une nation dont l'atout ne répond pas à son second
   manque n'y a pas droit.

3. **L'audit imprime les exceptions**, chacune sur sa ligne, avec sa raison. `noGap` et
   `secondGap` doivent se voir à chaque exécution, pas dormir dans un commentaire. Une
   exception non déclarée reste un échec.

4. **Compense le total.** Le Japon perd son unique minerai et tombe à 8 ; garde-le dans la
   bande. Le charbon est la piste la plus défendable — Hokkaidō (Ishikari, Kushiro) est un
   bassin réel qui n'est pas encore posé. Si tu trouves mieux, prends-le, mais reste sur du
   sourcé : pas de gisement inventé pour boucher un trou d'arithmétique.

5. **Deux lignes dans l'en-tête du script.** C'est la deuxième fois qu'un mécanisme global
   produit un effet à distance — l'espacement transfrontalier, puis le tirage mondial. Écris
   la règle noir sur blanc : *tout ce qui se calcule sur le monde entier plutôt que par pays
   fera bouger une nation quand on en modifie une autre.* Un `pourquoi`, pas un `quoi` — il
   évitera la troisième occurrence.

## Critères d'acceptation

- Deux exécutions consécutives : md5 identique.
- Le Japon sort à 0 en minerais et 0 en pétrole, dans la bande de 2×.
- L'audit imprime les deux exceptions déclarées avec leur raison.
- Retirer la déclaration `secondGap` du Japon fait échouer le script — prouve-le une fois.
- Déclarer un `secondGap` sur une autre nation au hasard échoue aussi si aucune
  justification n'est fournie.
- Aucune des six nations sans pétrole n'en a gagné ; les trois autres garde-fous mordent
  toujours.

## Ce que tu ne fais pas

Tu ne retouches pas les autres profils, ni les tables curatées, ni la bande. Si le Japon à
0 minerais fait sortir une autre nation d'un garde-fou, **signale-le et arrête-toi** — ce
serait un effet à distance de plus, et j'aimerais le voir avant qu'il soit corrigé.
