import Elysia from 'elysia';
import { Domain } from '../models/domain';

export const domain = new Elysia()
  .get('/domain/:name', async ({ params: { name } }) => {
    return Domain.findOne({
      name: name
    }).populate('experiences')
  });