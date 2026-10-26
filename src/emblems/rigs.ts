/**
 * **The nodes an articulated copy keeps apart, by model file** (ADR 0036 §2), named at their
 * pivot in the file. Only what a sequence moves: the rest is merged under them. A family joins
 * when the sequence that moves it does; `EXPECT` of `verifier-glb.mjs` stays the brief of the
 * files, wider than what the code reads.
 */
export const RIG_PARTS = {
  barracks: ['porte_gauche', 'porte_droite', 'remise_porte_gauche', 'remise_porte_droite'],
} as const;

export type RigFamily = keyof typeof RIG_PARTS;
export type RigPart<F extends RigFamily> = (typeof RIG_PARTS)[F][number];
