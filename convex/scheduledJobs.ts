import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

/**
 * **Un job gardé, jamais empilé** (#146). Les jobs que le jeu replanifie à chaque événement
 * (réveil des oreilles, reprise d'une file, regard de caisse) gardent leur id sur la ligne qui les
 * a voulus ; ces deux gestes sont les seuls à les toucher.
 */

/** Annule un job **en attente**, et lui seul : celui qui tourne est peut-être l'appelant lui-même,
 *  et le défaire le ferait passer à « annulé » en plein vol. */
export async function cancelJob(
  ctx: MutationCtx,
  jobId: Id<'_scheduled_functions'>,
): Promise<void> {
  if (await isPending(ctx, jobId)) await ctx.scheduler.cancel(jobId);
}

/** Le job attend encore son heure : s'il est parti, fini ou annulé, il ne couvre plus rien. */
export async function isPending(
  ctx: MutationCtx,
  jobId: Id<'_scheduled_functions'> | undefined,
): Promise<boolean> {
  return jobId !== undefined && (await ctx.db.system.get(jobId))?.state.kind === 'pending';
}
