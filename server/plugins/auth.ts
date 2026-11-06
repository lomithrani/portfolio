import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { User } from '../models/database';
import { userMode } from '../models/elysia';
import { env } from '../env';
import { google } from '../services/google';
import { accountDto, findOrCreateGoogleUser, setActiveMode } from '../services/users';

const SESSION_DAYS = 7;

// Same attributes when setting and clearing, or browsers keep the old cookie
const authCookieAttributes = () => ({
  httpOnly: true,
  secure: env.authCookieSecure,
  sameSite: env.AUTH_COOKIE_SAMESITE,
  path: '/',
  priority: 'high' as const
});

export const googleAuth = new Elysia()
  .use(jwt({
    name: 'jwt',
    secret: env.JWT_SECRET,
    exp: `${SESSION_DAYS}d`
  }))
  .post("/login",
    async ({ body: { token, mode }, jwt, cookie: { auth } }) => {
      // Throws InvalidGoogleTokenError (401) unless the ID token is signed by
      // Google, issued for our client ID, unexpired and has a verified email
      const identity = await google.verifyIdToken(token);

      const found = await findOrCreateGoogleUser(identity);
      // The space picked on the login screen, set (and the recruiter space
      // created) before the session is issued, as PUT /me/mode would
      const user = mode ? await setActiveMode(found.id, mode) : found;

      const date = new Date();
      date.setDate(date.getDate() + SESSION_DAYS);

      const expires = Math.round(date.getTime() / 1000);
      const jwtToken = await jwt.sign({ sub: user.id, exp: expires });

      auth.set({
        value: jwtToken,
        ...authCookieAttributes(),
        expires: date
      });

      return { user: await accountDto(user), expires };
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String())
      }),
      body: t.Object({
        // Google ID tokens are ~1-2 KB JWTs
        token: t.String({ minLength: 1, maxLength: 8192 }),
        // Without it, the account keeps the space it last chose
        mode: t.Optional(userMode)
      })
    })
  .get("/isLogged",
    async ({ cookie: { auth }, jwt }) => {

      if (!auth.value) return { logged: false, reason: "No auth cookie" };

      const token = await jwt.verify(auth.value);

      if (!token) return { logged: false, reason: "Missing jwt" };

      if (!token.sub) return { logged: false, reason: "Missing sub" };

      const user = await User.findById(token.sub);

      if (!user) return { logged: false, reason: "Unknown user" };

      return {
        logged: true,
        user: await accountDto(user),
        expires: token.exp
      }
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String())
      })
    })
  .get("/logout",
    async ({ cookie: { auth } }) => {
      auth.set({
        value: '',
        ...authCookieAttributes(),
        expires: new Date(0),
        maxAge: 0
      });
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String())
      })
    })
