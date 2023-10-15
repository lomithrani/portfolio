import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { User } from '../models/user';
import { Domain } from '../models/domain';
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

      const user = await User.findOneAndUpdate({ email }, { email }, { upsert: true });

      const jwtToken = await jwt.sign({ aud: user?.id });

      const domain = await Domain.findOne({ admin: user?._id });

      auth.value = jwtToken;
      auth.secure = false;
      auth.httpOnly = true;
      auth.priority = 'high';
      auth.sameSite = 'strict';
      const date = new Date();
      date.setDate(date.getDate() + 7);

      auth.expires = date;

      set.headers['expires'] = date.toISOString();
      return domain;
    },
    {
      cookie: t.Cookie({
        auth: t.String()
      }),
      body: t.Object({
        token: t.String()
      })
    });

