import { Experience } from '../models';
import Elysia, { t } from 'elysia';

export const experiences = new Elysia()
  .get('/experiences',
    async ({ cookie: { auth } }) => {
      console.log(auth.value);
      return await Experience.find();
    })