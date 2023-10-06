import cors from '@elysiajs/cors';
import { Experience, UserRole } from '../models';
import Elysia, { t } from 'elysia';
import cookie from '@elysiajs/cookie';
import jwt from '@elysiajs/jwt';
import { validateUserRole } from './validateUserRole';

export const experiences = new Elysia()
  .use(validateUserRole([UserRole.Test]))
  .get('/experiences',
    async ({ cookie: { auth } }) => {
      return await Experience.find();
    })