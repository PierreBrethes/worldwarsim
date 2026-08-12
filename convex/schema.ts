import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Placeholders d'équilibrage : les valeurs chiffrées vivent dans constantes.ts, jamais ici.

const CLE_ROLE = v.union(
  v.literal('infanterie'),
  v.literal('blinde'),
  v.literal('transportTerrestre'),
  v.literal('chasseur'),
  v.literal('bombardier'),
  v.literal('transportAerien'),
  v.literal('escorte'),
  v.literal('cargo'),
  v.literal('porteAvions'),
);

const PALIER = v.union(v.literal(1), v.literal(2));

export default defineSchema({
  saisons: defineTable({
    code: v.string(),
    statut: v.union(v.literal('salon'), v.literal('lancee'), v.literal('terminee')),
    dureeHeures: v.union(v.literal(48), v.literal(168)),
    compensation: v.number(),
    graine: v.number(),
    regionJouable: v.union(v.string(), v.null()),
    lanceeLe: v.union(v.number(), v.null()),
  }).index('parCode', ['code']),

  joueurs: defineTable({
    saisonId: v.id('saisons'),
    jeton: v.string(),
    pseudo: v.string(),
    createur: v.boolean(),
    nation: v.union(v.string(), v.null()),
    doctrine: v.union(
      v.literal('domination'),
      v.literal('hegemonie'),
      v.literal('influence'),
      v.null(),
    ),
    pret: v.boolean(),
    plageRepos: v.object({ debutMinutes: v.number(), finMinutes: v.number() }),
  })
    .index('parJeton', ['jeton'])
    .index('parSaison', ['saisonId']),

  ressources: defineTable({
    joueurId: v.id('joueurs'),
    cle: v.union(v.literal('ravitaillement'), v.literal('acier'), v.literal('effectifs')),
    stock: v.number(),
    tauxParHeure: v.number(),
    majLe: v.number(),
    plafond: v.union(v.number(), v.null()),
  }).index('parJoueur', ['joueurId']),

  batiments: defineTable({
    joueurId: v.id('joueurs'),
    cle: v.union(
      v.literal('qg'),
      v.literal('industrie'),
      v.literal('logistique'),
      v.literal('conscription'),
      v.literal('ecoute'),
    ),
    niveau: v.number(),
  }).index('parJoueur', ['joueurId']),

  /** L'effectif à domicile, une ligne par couple rôle/palier. Ni position ni identité : une
   *  unité n'existe individuellement nulle part tant que le combat n'est pas écrit. */
  unites: defineTable({
    joueurId: v.id('joueurs'),
    role: CLE_ROLE,
    palier: PALIER,
    nombre: v.number(),
  }).index('parJoueur', ['joueurId']),

  /** Une file ordonnée par `rang`. Seul le lot de tête porte un `finitLe` : les suivants n'ont
   *  pas commencé, et ce sont exactement ceux qu'on peut annuler contre remboursement. */
  recrutements: defineTable({
    joueurId: v.id('joueurs'),
    role: CLE_ROLE,
    palier: PALIER,
    nombre: v.number(),
    rang: v.number(),
    finitLe: v.union(v.number(), v.null()),
  }).index('parJoueur', ['joueurId']),

  chantiers: defineTable({
    joueurId: v.id('joueurs'),
    batiment: v.union(
      v.literal('qg'),
      v.literal('industrie'),
      v.literal('logistique'),
      v.literal('conscription'),
      v.literal('ecoute'),
    ),
    finitLe: v.number(),
  }).index('parJoueur', ['joueurId']),
});
