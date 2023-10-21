import Elysia from 'elysia';
import { type Experience, Domain } from 'models/database';

export const domain = new Elysia()
  .get('/domain/:name', async ({ params: { name } }) => {
    const result = await Domain.findOne({
      name: name
    }).populate<{ experiences: Experience[] }>('experiences').orFail();

    return result
  });