import { Elysia, t } from 'elysia'
import type { Cookie } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { User } from '../models/database';
import { consentRequest, loginConsentSource, userMode } from '../models/elysia';
import { env } from '../env';
import { google } from '../services/google';
import { assertValidConsent, recordConsent } from '../services/legal';
import { accountDto, findAccount, findOrCreateGoogleUser, setActiveMode } from '../services/users';

const SESSION_DAYS = 7;

// Same attributes when setting and clearing, or browsers keep the old cookie
const authCookieAttributes = () => ({
  httpOnly: true,
  secure: env.authCookieSecure,
  sameSite: env.AUTH_COOKIE_SAMESITE,
  path: '/',
  priority: 'high' as const
});

/** Clears the session cookie (GET /logout, DELETE /me) */
export const clearAuthCookie = (auth: Cookie<string | undefined>) => {
  auth.set({
    value: '',
    ...authCookieAttributes(),
    expires: new Date(0),
    maxAge: 0
  });
};

export const googleAuth = new Elysia()
  .use(jwt({
    name: 'jwt',
    secret: env.JWT_SECRET,
    exp: `${SESSION_DAYS}d`
  }))
  .post("/login",
    async ({ body: { token, mode, consent, consentSource }, jwt, cookie: { auth } }) => {
      // The age and terms confirmation of the sign-in, checked before
      // anything else: an older version of the terms is a 422, and no account
      // is created nor session issued
      const accepted = consent === undefined ? undefined : assertValidConsent(consent);

      // Throws InvalidGoogleTokenError (401) unless the ID token is signed by
      // Google, issued for our client ID, unexpired and has a verified email
      const identity = await google.verifyIdToken(token);

      const found = await findOrCreateGoogleUser(identity);
      // Recorded before the session exists: an account signed in with the
      // confirmation never has a session without it
      // From where the box was ticked: the landing page, or a claim form that signs in first
      const recorded = accepted ? await recordConsent(found.id, accepted, consentSource ?? 'landing') : false;
      // The space picked on the login screen, set (and the recruiter space
      // created) before the session is issued, as PUT /me/mode would
      const user = mode
        ? await setActiveMode(found.id, mode)
        : recorded
          ? await findAccount(found.id)
          : found;

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
        mode: t.Optional(userMode),
        // Sent when the person ticked the age and terms checkbox before
        // signing in; recorded with the source consentSource
        consent: t.Optional(consentRequest),
        // Where that checkbox was: the landing page (default), or the claim
        // form of a portfolio page, which signs in before claiming
        consentSource: t.Optional(loginConsentSource)
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
      clearAuthCookie(auth);
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String())
      })
    })
