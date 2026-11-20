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
  // Before the session is read: while MATCHING is off, every route answers
  // the 404 of a route that does not exist, signed in or not, and nothing is
  // read or written
  .onTransform(() => {
    if (!env.matchingEnabled) throw new NotFoundError();
  })
  .use(discovery);
