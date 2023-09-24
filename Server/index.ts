import mongoose from 'mongoose';
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors';
import { getAllExperiences, getAllExperiencesDescription } from './controllers';
import { googleAuth } from './plugins';

await mongoose.connect(Bun.env.MONGO_URL ?? '');

const app = new Elysia()
  .use(googleAuth)
  .use(cors({
    origin: (request: Request): boolean => {
      const origin = request.headers.get('origin');
      if (!origin) {
        return false;
      }
      const allowedOrigins = JSON.parse(Bun.env.ALLOWED_DOMAINS || '[]') as string[];
      return allowedOrigins.includes(origin);
    },
  }))
  .get('/experiences', getAllExperiences, getAllExperiencesDescription)
  .listen({
    hostname: "::",
    port: Bun.env.PORT || 3000
  });

console.log(`Running at http://${app.server!.hostname}:${app.server!.port} CORS allowed: ${JSON.stringify(Bun.env.ALLOWED_DOMAINS)}`)

export type Portfolio = typeof app;
