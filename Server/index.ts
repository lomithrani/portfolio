import mongoose from 'mongoose';
import { Experience } from './models/experience';
import { Elysia, t } from 'elysia'
import { swagger } from '@elysiajs/swagger'

await mongoose.connect(Bun.env.MONGO_URL ?? '');

const portfolio = new Elysia()
  .use(swagger())
  .get('/', async () => await Experience.find())
  .listen(8080)

export type Portfolio = typeof portfolio;
