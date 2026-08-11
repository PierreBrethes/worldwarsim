# ADR 0004 — Avant-postes ponctuels plutôt que conquête de provinces

**Statut :** acceptée

## Contexte

Trois modèles de territoire étaient sur la table :

1. conquête de pays voisins (annexion, le front bouge) ;
2. nation fixe sans annexion, façon Ogame ;
3. conquête à l'échelle de la province (découpage admin-1).

L'objection au modèle 2 était sérieuse : la carte ne raconte plus rien, ce qui est du gâchis vu la
qualité du rendu.

## Décision

Modèle 2 — **nation fixe, jamais annexée** — augmenté d'une couche d'**avant-postes ponctuels** posés
sur les pays neutres.

Un avant-poste est un point : `{ lon, lat, propriétaire, niveau, spécialisation }`.

## Justification

Les avant-postes règlent l'objection au modèle 2 **à une granularité qu'on contrôle**. On obtient la
course au territoire, les fronts qui avancent et la carte qui se colore, sans jamais toucher au
découpage administratif.

Le coût comparé est écrasant :

| | Conquête de provinces | Avant-postes |
|---|---|---|
| Données | ~4000 entités admin-1 à filtrer et nettoyer | aucune |
| Rendu | repeindre des polygones, gérer les frontières mouvantes | un marqueur |
| Modèle | graphe d'adjacence, contiguïté, enclaves | un point et un propriétaire |
| Lisibilité à 5 joueurs | risque de noyade | immédiate |

Et l'avant-poste est **plus riche** que la province : sa spécialisation exclusive (relais / extraction
/ écoute) est une décision, alors que posséder une province n'en est pas une.

## Conséquences

- La nation d'origine ne peut être qu'**occupée**, jamais annexée — ce qui sert directement la
  politique anti-élimination (design/07).
- Il faut un garde-fou sur les pays neutres, sinon le farm PNJ domine (design/03).
- Un avant-poste ne change **jamais** de propriétaire : il se désactive par raid et se détruit après
  plusieurs raids. Une couche de capture aurait recréé la conquête par la fenêtre.
- La richesse des pays hôtes doit être **tirée par la graine de saison**, sinon les meilleures cases
  sont connues d'avance et la première heure décide de toute la saison.

## Ce qu'on abandonne

La granularité tactique fine, et l'image d'une carte entièrement repeinte aux couleurs du vainqueur.
Réversible plus tard : les avant-postes n'interdisent pas d'ajouter une couche de provinces un jour.
