import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { User } from '../models/database';
import { corsConf } from './corsConf';

export const googleAuth = new Elysia()
  .use(corsConf())
  .use(jwt({
    name: 'jwt',
    secret: Bun.env.JWT_SECRET!,
    exp: '7d'
  }))
  .post("/login",
    async ({ body: { token }, jwt, cookie: { auth }, set }) => {

      const googleToken = token;

      // Verify the token with Google's API
      const googleResponse = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${googleToken}`);

      if (!googleResponse.ok) {
        set.status = 401;
        throw new Error(googleResponse.statusText)
      }

      const googleData = await googleResponse.json();

      // Check if the email is verified
      if (!googleData.email_verified) {
        set.status = 401;
        throw new Error(googleResponse.statusText)
      }

      const email = googleData.email;

      const user = await User.findOneAndUpdate({ email }, { email }, { upsert: true, new: true });

      const date = new Date();
      date.setDate(date.getDate() + 7);

      const expires = Math.round(date.getTime() / 1000);
      const jwtToken = await jwt.sign({ sub: user?.id, exp: expires });

      auth.value = jwtToken;
      auth.secure = false;
      auth.httpOnly = true;
      auth.priority = 'high';
      auth.sameSite = 'strict';
      auth.expires = date;

      return { user, expires };
    },
    {
      cookie: t.Cookie({
        auth: t.String()
      }),
      body: t.Object({
        token: t.String()
      })
    })
  .get("/isLogged",
    async ({ cookie: { auth }, jwt }) => {

      if (!auth.value) return { logged: false, reason: "No auth cookie" };

      const token = await jwt.verify(auth.value);

      if (!token) return { logged: false, reason: "Missing jwt" };

      if (!token.sub) return { logged: false, reason: "Missing sub" };

      const user = await User.findById(token.sub);

      return {
        logged: true,
        user,
        expires: token.exp
      }
    },
    {
      cookie: t.Cookie({
        auth: t.String()
      })
    })
  .get("/logout",
    async ({ cookie: { auth }, jwt }) => {
      auth.remove()
    },
    {
      cookie: t.Cookie({
        auth: t.String()
      })
    })


