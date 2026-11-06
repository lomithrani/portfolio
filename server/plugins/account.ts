import Elysia, { t } from 'elysia';
import { userLogged } from './userLogged';
import { userMode } from '../models/elysia';
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
  .put('/me/mode', async ({ body: { mode }, userId }) => ({
    user: await accountDto(await setActiveMode(userId, mode))
  }),
    {
      body: t.Object({ mode: userMode }),
      detail: {
        summary: 'Switch between the candidate and recruiter spaces (the recruiter space is created on first choice)'
      }
    })
