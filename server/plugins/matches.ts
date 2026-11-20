import Elysia, { NotFoundError } from 'elysia';
import { env } from '../env';
import { userLogged } from './userLogged';
import { discoveryCardRequest, discoveryConsentRequest } from '../models/elysia';
import { discoveryStatus, grantDiscovery, saveDiscoveryCard, withdrawDiscovery } from '../services/discovery';
import type { DiscoveryDto } from '../services/discovery';

// Path 2, matching on open jobs (CLAUDE.md, Matching): off unless MATCHING=true.
// For now, discovery (services/discovery.ts): a candidate asks to be proposed
// to recruiters, as an anonymous card, and can stop at once. Every route is
// the signed-in account's own: it takes no account or portfolio to read.

const discovery = new Elysia()
  .use(userLogged)
  .get('/discovery', ({ userId }): Promise<DiscoveryDto> => discoveryStatus(userId), {
    detail: { summary: 'Whether you are proposed to recruiters, what you still miss for it, and what your anonymous card shows' }
  })
  .put('/discovery', ({ userId, body }): Promise<DiscoveryDto> => saveDiscoveryCard(userId, body.card), {
    body: discoveryCardRequest,
    detail: { summary: 'Set what your anonymous card shows: a headline, the experiences it leaves out' }
  })
  // Opt-in: the consent (18 or over, under the terms in force) and every
  // requirement, or a 422 naming the first that is missing
  .post('/discovery/consent', ({ userId, body }): Promise<DiscoveryDto> => grantDiscovery(userId, body.consent), {
    body: discoveryConsentRequest,
    detail: { summary: 'Be proposed to recruiters, as an anonymous card: needs your consent and every requirement' }
  })
  // Withdrawal: at once, whatever is missing, and recorded
  .delete('/discovery/consent', ({ userId }): Promise<DiscoveryDto> => withdrawDiscovery(userId), {
    detail: { summary: 'Stop being proposed to recruiters, at once' }
  });

export const matches = new Elysia()
  // A backstop: createApp registers none of these routes while MATCHING is
  // off (matchingRoutes), so they answer the 404 of a route that does not
  // exist whatever the request, before its body is read. Should the flag be
  // turned off once the app is built (tests do), they still answer it before
  // the session is read, and nothing is read or written
  .onTransform(() => {
    if (!env.matchingEnabled) throw new NotFoundError();
  })
  .use(discovery);

/**
 * The matching routes as createApp mounts them, the flag read when the app is
 * built: none while MATCHING is off (not even listed by /swagger), every one
 * once it is on. Typed as when on, so the client is typed against them
 */
export const matchingRoutes = (): typeof matches =>
  env.matchingEnabled ? matches : (new Elysia() as unknown as typeof matches);
