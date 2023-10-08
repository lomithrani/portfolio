import { Elysia, t } from 'elysia'
import { jwt } from '@elysiajs/jwt'
import { Role } from '../models';
import cors from '@elysiajs/cors';
import { UserRole } from 'portfolio-common';

export const googleAuth = new Elysia()
  .use(cors({
    credentials: true,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
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
  .post("/login",
    async ({ body: { token }, jwt, cookie: { auth }, set }) => {

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

      const roles = (await Role.findOne({ email }))?.roles ?? [UserRole.Recruiter];

      const jwtToken = await jwt.sign({ "roles": `${JSON.stringify(roles)}` })

      auth.value = jwtToken;
      auth.secure = false;
      auth.httpOnly = true;
      auth.priority = 'high';
      auth.sameSite = 'strict';
      const date = new Date();
      date.setDate(date.getDate() + 7);

      auth.expires = date;

      set.headers['expires'] = date.toISOString();
      return roles;
    },
    {
      cookie: t.Cookie({
        auth: t.String()
      }),
      body: t.Object({
        token: t.String()
      })
    });

