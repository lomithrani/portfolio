import mongoose from 'mongoose';
import { Experience } from './models/experience';
import { Elysia, t } from 'elysia'
import { swagger } from '@elysiajs/swagger'

await mongoose.connect(Bun.env.MONGO_URL ?? '');

const app = new Elysia()
  .use(swagger())
  .get('/', async () => await Experience.find())
  .listen({
    hostname: "::",
    port: 3000
  });

  console.log(`Running at http://${app.server!.hostname}:${app.server!.port}`)

export type Portfolio = typeof app;
