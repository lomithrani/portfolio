import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { Role } from '../models';
import cors from '@elysiajs/cors';

export const googleAuth = new Elysia()
  .use(cors({
    credentials: true,
    origin: (request: Request): boolean => {
      const origin = request.headers.get('origin');
      if (!origin) {
        return false;
      }
      const allowedOrigins = JSON.parse(Bun.env.ALLOWED_DOMAINS || '[]') as string[];
      return allowedOrigins.includes(origin);
    }
  }))
  .use(jwt({
    name: 'jwt',
    secret: Bun.env.JWT_SECRET!,
    exp: '7d'
  }))
  .get("/login/:token",
    async ({ params: { token }, jwt, cookie: { auth }, set }) => {

      const googleToken = token;

      // Verify the token with Google's API
      const googleResponse = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${googleToken}`);

      if (!googleResponse.ok) {
        set.status = 401;
        return { error: "Invalid Google token" };
      }

      const googleData = await googleResponse.json();

      // Check if the email is verified
      if (!googleData.email_verified) {
        set.status = 401;
        return { error: "Email not verified by Google" };
      }

      const email = googleData.email;

      const roles = (await Role.findOne({ email }))?.roles ?? ['recruiter'];

      const jwtToken = await jwt.sign({ "roles": `${JSON.stringify(roles)}` })

      auth.value = jwtToken;
      auth.secure = true;
      auth.priority = 'high';
      auth.sameSite = 'strict';
      auth.maxAge = 7 * 24 * 60 * 60 * 60;

      return `Sign in as ${auth}`
    },
    {
      cookie: t.Cookie({
        value: t.String()
      })
    }
  );

