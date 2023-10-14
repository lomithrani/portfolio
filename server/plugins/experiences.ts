import { Experience } from '../models';
import Elysia from 'elysia';
import { corsConf } from './corsConf';

export const experiences = new Elysia()
  .use(corsConf())
  .get('/experiences', async () => await Experience.find());