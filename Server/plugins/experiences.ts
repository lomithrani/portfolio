import cors from '@elysiajs/cors';
import { Experience } from '../models';
import Elysia, { t } from 'elysia';

export const experiences = new Elysia()
  .use(cors({
    credentials: true,
    origin: (request: Request): boolean => {
      const origin = request.headers.get('origin');
      if (!origin) {
        return false;
      }
      const allowedOrigins = JSON.parse(Bun.env.ALLOWED_DOMAINS || '[]') as string[];
      return allowedOrigins.includes(origin);
    },
  }))
  .get('/experiences',
    async ({ cookie: { auth } }) => {
      console.log(auth.value);
      return await Experience.find();
    })