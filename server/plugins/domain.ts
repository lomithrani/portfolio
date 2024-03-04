import Elysia, { t } from 'elysia';
import { Experience, Domain } from '../models/database';

export const domain = new Elysia()
  .get('/domain/:name', async ({ params: { name } }) => {
    const domain = await Domain.findOne({ name: name });
    if (!domain) throw new Error('Domain not found');
    const populatedDomain = await domain.populate<{ experiences: Experience[] }>('experiences');
    return populatedDomain;
  })