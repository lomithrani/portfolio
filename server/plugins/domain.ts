import Elysia from 'elysia';
import { Domain } from '../models/database/domain';
import type { Experience } from '../models/database';


export const domain = new Elysia()
  .get('/domain/:name', async ({ params: { name } }) => {
    const result = await Domain.findOne({
      name: name
    }).populate<{ experiences: Experience[] }>('experiences').orFail();

    return result
  });