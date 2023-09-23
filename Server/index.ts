import mongoose from 'mongoose';
import { Experience } from './models/experience';
import { Elysia, t } from 'elysia'
import { swagger } from '@elysiajs/swagger'
import cors from '@elysiajs/cors';

await mongoose.connect(Bun.env.MONGO_URL ?? '');

const app = new Elysia()
  .use(swagger({
    documentation: {
      info: {
        title: 'Portfolio api - Documentation',
        version: '0.0.1'
      }
    }
  }))
  .use(cors({
    origin: ["http://127.0.0.1:5173"]
  }))
  .get(
    '/experiences',
    async () => await Experience.find(),
    {
      response: t.Array(t.Object({
        name: t.String()
      }), { description: "List of experiences" })
    })
  .listen({
    hostname: "::",
    port: Bun.env.PORT || 3000
  });

console.log(`Running at http://${app.server!.hostname}:${app.server!.port}`)

export type Portfolio = typeof app;
