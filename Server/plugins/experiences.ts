import cookie from '@elysiajs/cookie';
import { Experience } from '../models';
import Elysia, { t } from 'elysia';

export const experiences = new Elysia()
  .use(cookie())
  .get('/experiences',
    async ({ cookie: { auth } }) => {
      console.log(auth);
      return await Experience.find();
    })