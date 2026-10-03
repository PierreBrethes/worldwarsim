'use node';

import { v } from 'convex/values';
import webpush from 'web-push';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { push } from '../src/domain/push';

const PUSH_TTL_SECONDS = 24 * 3600;
const REVOKED = [404, 410];

/**
 * **L'envoi, à tous les appareils du compte.** Les clés VAPID viennent de l'environnement de
 * Convex, jamais du dépôt (`deploiement/README.md`). Un appareil qui répond 404 ou 410 a révoqué
 * son abonnement : la ligne tombe. Toute autre panne se tait — une notification ratée n'est pas
 * une erreur de jeu, et la rejouer sonnerait deux fois si la première était partie.
 */
export const deliver = internalAction({
  args: {
    accountId: v.id('accounts'),
    body: v.string(),
    url: v.string(),
    tag: v.string(),
    seasonId: v.union(v.id('seasons'), v.null()),
  },
  handler: async (ctx, { accountId, body, url, tag, seasonId }) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      console.error('notifications: clés VAPID absentes de l’environnement de Convex');
      return;
    }
    const subscriptions = await ctx.runQuery(internal.notifications.subscriptionsOf, { accountId });
    const payload = JSON.stringify({
      title: push.title,
      body,
      url,
      tag,
      icon: '/icons/icon-192.png',
      seasonId,
    });
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: PUSH_TTL_SECONDS, vapidDetails: { subject, publicKey, privateKey } },
        );
        await ctx.runMutation(internal.notifications.markSent, {
          endpoint: subscription.endpoint,
          at: Date.now(),
        });
      } catch (failure) {
        const status = (failure as { statusCode?: number }).statusCode;
        if (status !== undefined && REVOKED.includes(status)) {
          await ctx.runMutation(internal.notifications.revoke, { endpoint: subscription.endpoint });
        }
      }
    }
  },
});
