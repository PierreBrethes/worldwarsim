import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { readMarksOf, stampReadMark } from './readMarks';
import { playerOf, requireStarted } from './seats';
import { FIRST_STEP, FIRST_STEPS_SHOWN } from './validators';
import { FIRST_STEPS } from '../src/domain/first-steps';

/**
 * **Les premiers pas** (ADR 0027 §2), gardés par la place : l'écran lit les gestes faits dans sa
 * vue (`stepsDoneIn`) et les retient ici, parce qu'un mouvement arrive et qu'un lot se forme —
 * l'état qui les prouvait ne dure pas. `requireStarted` et non `requirePlayable` : c'est une
 * marque de lecture, comme l'ouverture du plateau personnel.
 */
export const check = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), steps: v.array(FIRST_STEP) },
  handler: async (ctx, { token, seasonId, steps }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requireStarted(season);
    const { firstSteps } = await readMarksOf(ctx, player);
    const done = FIRST_STEPS.filter(
      (step) => firstSteps.done.includes(step) || steps.includes(step),
    );
    if (done.length === firstSteps.done.length) return;
    await stampReadMark(ctx, player._id, { firstSteps: { ...firstSteps, done } });
  },
});

/** Déplier, replier ou passer la liste ; « reprendre » depuis l'aide la rouvre. */
export const show = mutation({
  args: { token: v.string(), seasonId: v.id('seasons'), shown: FIRST_STEPS_SHOWN },
  handler: async (ctx, { token, seasonId, shown }) => {
    const { player, season } = await playerOf(ctx, token, seasonId);
    requireStarted(season);
    const { firstSteps } = await readMarksOf(ctx, player);
    await stampReadMark(ctx, player._id, { firstSteps: { done: [...firstSteps.done], shown } });
  },
});
