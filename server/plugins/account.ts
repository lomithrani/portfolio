import Elysia, { t } from 'elysia';
import { userLogged } from './userLogged';
import { clearAuthCookie } from './auth';
import { acceptTermsRequest, consentRequest, deleteAccountRequest, userMode } from '../models/elysia';
import { deleteAccount } from '../services/accountDeletion';
import { recordConsent } from '../services/legal';
import { accountDto, findAccount, setActiveMode } from '../services/users';

// The signed-in account and its spaces (portfolio-common USER_MODES). The
// active mode only tells the client which space to show: routes authorise on
// what the account has (a domain, a recruiter space), never on it.
export const account = new Elysia()
  .use(userLogged)
  .get('/me', async ({ userId }) => ({ user: await accountDto(await findAccount(userId)) }), {
    detail: {
      summary: 'The signed-in account: its active mode, recruiter space and domain'
    }
  })
  // Opening the recruiter space (the first 'recruiter') needs the terms in
  // force: an account that has not accepted them sends the age and terms
  // confirmation ticked where it opens the space, recorded from the source
  // 'recruiter' (services/users.ts setActiveMode); 422 on `consent` otherwise
  .put('/me/mode', async ({ body: { mode, consent }, userId }) => ({
    user: await accountDto(await setActiveMode(userId, mode, consent))
  }),
    {
      body: t.Object({
        mode: userMode,
        consent: t.Optional(consentRequest)
      }),
      detail: {
        summary: 'Switch between the candidate and recruiter spaces (the recruiter space is created on first choice, once the terms in force are accepted)'
      }
    })
  // The account accepts the Terms of use in force, with the age confirmation
  // (services/legal.ts): an account that signed in elsewhere, before a claim
  // or from the account page. Accepting again changes nothing
  .put('/me/consent', async ({ body: { termsVersion, ageConfirmed, source }, userId }) => {
    // 401 first when the account no longer exists
    await findAccount(userId);
    await recordConsent(userId, { termsVersion, ageConfirmed }, source ?? 'account');
    return { user: await accountDto(await findAccount(userId)) };
  },
    {
      body: acceptTermsRequest,
      detail: {
        summary: 'Accept the Terms of use and Privacy policy in force, confirming the minimum age'
      }
    })
  // Deletes the account and everything tied to it (services/accountDeletion.ts),
  // then ends the session. The body must say DELETE: no request deletes an
  // account by accident
  .delete('/me', async ({ userId, cookie: { auth }, set }) => {
    await deleteAccount(userId);
    clearAuthCookie(auth);
    set.status = 204;
  },
    {
      body: deleteAccountRequest,
      cookie: t.Cookie({
        auth: t.Optional(t.String())
      }),
      detail: {
        summary: 'Delete the signed-in account and all its data (portfolio, journeys, job postings, schedules)'
      }
    })
