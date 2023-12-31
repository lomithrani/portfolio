import Elysia, { t } from 'elysia';
import { Experience, Domain } from '../models/database';

export const domain = new Elysia()
  .get('/domain/:name', async ({ params: { name } }) => await (await Domain.findOne({
    name: name
  }))?.populate<{ experiences: Experience[] }>('experiences'));